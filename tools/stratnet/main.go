// stratosphere-net is the program that sits at the edge of the machine of the panel. It has two parts that can each be on or off:
//
//   - the router: Minecraft connections for the custom domains of servers (port 25565), see the router package.
//   - the edge: the panel over https with the certificates added in the panel (ports 443 and 80), see the edge package.
//
// Both read one environment file. The names that would be the same for the two (LISTEN, REFRESH, PANEL_URL) have a prefix there:
// ROUTER_LISTEN, EDGE_LISTEN and so on. A part that fails to start or stops is started again after a while, it does not take the other
// one down with it.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"stratnet/edge"
	"stratnet/router"
)

// scoped reads the environment for one part: a name that is in "own" is looked for with the prefix first (ROUTER_LISTEN). Only
// PANEL_URL may also be shared, the others fall back to nothing so that the part's own default is used and one part never takes the
// port of the other.
func scoped(prefix string, own ...string) func(string) string {
	return func(name string) string {
		for _, n := range own {
			if n == name {
				if value := os.Getenv(prefix + name); value != "" {
					return value
				}
				if name == "PANEL_URL" {
					return os.Getenv(name)
				}

				return ""
			}
		}

		return os.Getenv(name)
	}
}

// flag reads ENABLE_ROUTER / ENABLE_EDGE: "0" or "false" is off, "1" or "true" is on, empty is "on when it has what it needs".
func flag(name string, ready bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "0", "false", "off", "no":
		return false
	case "1", "true", "on", "yes":
		return true
	}

	return ready
}

// supervise runs a part until the context ends. When it fails it says why and tries again, a part with nothing wrong in its setting
// (a port that is busy for a moment, a panel that is not up yet) comes back by itself.
func supervise(ctx context.Context, name string, retry time.Duration, run func(context.Context) error) {
	for ctx.Err() == nil {
		err := run(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("%s stopped: %v (trying again in %s)", name, err, retry)
		} else {
			log.Printf("%s stopped (trying again in %s)", name, retry)
		}
		select {
		case <-ctx.Done():
		case <-time.After(retry):
		}
	}
}

func main() {
	router.Getenv = scoped("ROUTER_", "LISTEN", "REFRESH", "PANEL_URL")
	edge.Getenv = scoped("EDGE_", "LISTEN", "REFRESH", "PANEL_URL")

	runRouter := flag("ENABLE_ROUTER", router.Enabled())
	runEdge := flag("ENABLE_EDGE", edge.Enabled())
	if !runRouter && !runEdge {
		log.Fatal("nothing to do: set ROUTER_TOKEN (the router) and/or EDGE_TOKEN (the edge), see /etc/stratosphere-net.env")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	start := func(name string, run func(context.Context) error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			supervise(ctx, name, 10*time.Second, run)
		}()
	}
	if runRouter {
		start("router", router.Run)
	} else {
		log.Print("router is off")
	}
	if runEdge {
		start("edge", edge.Run)
	} else {
		log.Print("edge is off")
	}

	wg.Wait()
}
