package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestEachPartHasItsOwnListenAndRefresh(t *testing.T) {
	t.Setenv("ROUTER_LISTEN", ":25570")
	t.Setenv("EDGE_LISTEN", ":8443")
	t.Setenv("LISTEN", ":1")
	t.Setenv("ROUTER_REFRESH", "20s")

	router := scoped("ROUTER_", "LISTEN", "REFRESH", "PANEL_URL")
	edge := scoped("EDGE_", "LISTEN", "REFRESH", "PANEL_URL")

	if router("LISTEN") != ":25570" || edge("LISTEN") != ":8443" {
		t.Fatalf("listen: router %q, edge %q", router("LISTEN"), edge("LISTEN"))
	}
	if router("REFRESH") != "20s" || edge("REFRESH") != "" {
		t.Fatalf("refresh: router %q, edge %q (empty is the default of the part)", router("REFRESH"), edge("REFRESH"))
	}
}

func TestAPartNeverTakesTheLISTENOfTheOther(t *testing.T) {
	// An old file with one plain LISTEN must not make the edge listen where the router does.
	t.Setenv("LISTEN", ":25565")

	if got := scoped("EDGE_", "LISTEN")("LISTEN"); got != "" {
		t.Fatalf("got %q, want the default of the edge", got)
	}
}

func TestThePanelAddressCanBeSharedOrOwn(t *testing.T) {
	t.Setenv("PANEL_URL", "https://panel.example.com")
	t.Setenv("EDGE_PANEL_URL", "http://127.0.0.1:8081")

	if got := scoped("ROUTER_", "PANEL_URL")("PANEL_URL"); got != "https://panel.example.com" {
		t.Fatalf("router got %q", got)
	}
	if got := scoped("EDGE_", "PANEL_URL")("PANEL_URL"); got != "http://127.0.0.1:8081" {
		t.Fatalf("edge got %q", got)
	}
}

func TestOtherSettingsAreReadAsTheyAre(t *testing.T) {
	t.Setenv("ROUTER_TOKEN", "a")
	t.Setenv("BACKEND", "http://127.0.0.1:8081")

	if scoped("ROUTER_", "LISTEN")("ROUTER_TOKEN") != "a" || scoped("EDGE_", "LISTEN")("BACKEND") != "http://127.0.0.1:8081" {
		t.Fatal("a setting that is not scoped must be read by its name")
	}
}

func TestAPartCanBeSwitchedOffOrOnAndOtherwiseGoesByItsSettings(t *testing.T) {
	cases := []struct {
		value string
		ready bool
		want  bool
	}{{"", true, true}, {"", false, false}, {"0", true, false}, {"false", true, false}, {"1", false, true}, {" ON ", false, true}, {"maybe", true, true}}
	for _, c := range cases {
		t.Setenv("ENABLE_X", c.value)
		if got := flag("ENABLE_X", c.ready); got != c.want {
			t.Errorf("value %q ready %v: got %v, want %v", c.value, c.ready, got, c.want)
		}
	}
}

func TestAPartThatFailsIsStartedAgainAndStopsWithTheContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	runs := 0
	done := make(chan struct{})
	go func() {
		supervise(ctx, "test", 5*time.Millisecond, func(context.Context) error {
			runs++
			if runs == 3 {
				cancel()
			}

			return errors.New("the port is busy")
		})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("it did not stop with the context")
	}
	if runs != 3 {
		t.Fatalf("ran %d times, want 3", runs)
	}
}
