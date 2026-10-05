package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func buildHandshake(host string, port uint16, next int) []byte {
	var body bytes.Buffer
	writeVarInt(&body, 0)
	writeVarInt(&body, 767)
	writeVarInt(&body, len(host))
	body.WriteString(host)
	_ = binary.Write(&body, binary.BigEndian, port)
	writeVarInt(&body, next)

	var out bytes.Buffer
	writeVarInt(&out, body.Len())
	out.Write(body.Bytes())

	return out.Bytes()
}

func TestReadHandshakeNormalizesHost(t *testing.T) {
	hs, err := readHandshake(bufio.NewReader(bytes.NewReader(buildHandshake("Play.Example.COM.\x00FML\x00", 25565, 2))))
	if err != nil {
		t.Fatal(err)
	}
	if hs.Host != "play.example.com" || hs.NextState != 2 || hs.Port != 25565 {
		t.Fatalf("unexpected handshake: %+v", hs)
	}
}

func TestReadHandshakeRejectsGarbage(t *testing.T) {
	if _, err := readHandshake(bufio.NewReader(bytes.NewReader([]byte{0xff, 0xff, 0xff, 0xff, 0xff, 0xff}))); err == nil {
		t.Fatal("expected an error")
	}
}

func startRouter(t *testing.T, routes []mapping) string {
	t.Helper()

	return startRouterWith(t, config{UnknownMOTD: "unknown", OfflineMOTD: "offline", SuspendedMOTD: "suspended", StartingMOTD: "starting", InstallMOTD: "installing"}, routes)
}

func startRouterWith(t *testing.T, cfg config, routes []mapping) string {
	t.Helper()

	r := &router{cfg: cfg, routes: map[string]route{}}
	r.set(routes)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go r.handle(conn)
		}
	}()

	return listener.Addr().String()
}

func TestProxiesToBackend(t *testing.T) {
	backend, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()

	received := make(chan []byte, 1)
	go func() {
		conn, err := backend.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		// The backend must see the exact handshake, followed by the data the player sent next.
		buf := make([]byte, len(buildHandshake("mc.example.com", 25565, 1))+4)
		_, _ = io.ReadFull(conn, buf)
		received <- buf
		_, _ = conn.Write([]byte("pong"))
	}()

	addr := backend.Addr().(*net.TCPAddr)
	router := startRouter(t, []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: addr.Port}})

	client, err := net.Dial("tcp", router)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	handshake := buildHandshake("MC.example.com", 25565, 1)
	// Send the handshake and the next bytes in a single write so they arrive in the same buffer.
	_, _ = client.Write(append(append([]byte{}, handshake...), []byte("ping")...))

	_ = client.SetReadDeadline(time.Now().Add(3 * time.Second))
	answer := make([]byte, 4)
	if _, err := io.ReadFull(client, answer); err != nil || string(answer) != "pong" {
		t.Fatalf("expected pong, got %q (%v)", answer, err)
	}

	got := <-received
	if !bytes.Equal(got[:len(handshake)], handshake) || string(got[len(handshake):]) != "ping" {
		t.Fatalf("backend received %v", got)
	}
}

func TestUnknownHostGetsDisconnectMessage(t *testing.T) {
	router := startRouter(t, nil)

	client, err := net.Dial("tcp", router)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	_, _ = client.Write(buildHandshake("nope.example.com", 25565, 2))
	_ = client.SetReadDeadline(time.Now().Add(3 * time.Second))

	data, _ := io.ReadAll(client)
	if !bytes.Contains(data, []byte("unknown")) {
		t.Fatalf("expected the unknown message, got %q", data)
	}
}

func TestStatusPingOfflineBackend(t *testing.T) {
	// Nothing listens on this port, so the router has to explain that the server is offline.
	router := startRouter(t, []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	client, err := net.Dial("tcp", router)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	_, _ = client.Write(buildHandshake("mc.example.com", 25565, 1))
	_, _ = client.Write([]byte{1, 0}) // status request
	_ = client.SetReadDeadline(time.Now().Add(3 * time.Second))

	buf := make([]byte, 512)
	n, _ := client.Read(buf)
	if !bytes.Contains(buf[:n], []byte("offline")) {
		t.Fatalf("expected the offline message, got %q", buf[:n])
	}
}

// ask connects like a player would and returns everything the router answered.
func ask(t *testing.T, addr, host string, next int) []byte {
	t.Helper()

	client, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	_, _ = client.Write(buildHandshake(host, 25565, next))
	if next == 1 {
		_, _ = client.Write([]byte{1, 0})
	}
	_ = client.SetReadDeadline(time.Now().Add(3 * time.Second))

	buf := make([]byte, 1024)
	n, _ := client.Read(buf)

	return buf[:n]
}

func TestSuspendedServerIsNeverForwarded(t *testing.T) {
	backend, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	reached := make(chan struct{}, 1)
	go func() {
		if conn, err := backend.Accept(); err == nil {
			conn.Close()
			reached <- struct{}{}
		}
	}()

	port := backend.Addr().(*net.TCPAddr).Port
	router := startRouter(t, []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: port, Status: "suspended"}})

	if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("suspended")) {
		t.Fatalf("expected the suspended message, got %q", answer)
	}
	if answer := ask(t, router, "mc.example.com", 1); !bytes.Contains(answer, []byte("Suspended")) {
		t.Fatalf("expected the suspended label in the server list, got %q", answer)
	}

	select {
	case <-reached:
		t.Fatal("the router connected to a suspended server")
	case <-time.After(200 * time.Millisecond):
	}
}

func TestStartingServerExplainsItself(t *testing.T) {
	var asked string
	panel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		asked = req.URL.Query().Get("domain") + "|" + req.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"state":"starting"}`))
	}))
	defer panel.Close()

	// Nothing listens on port 1, so the router has to find out why from the panel.
	router := startRouterWith(t, config{PanelURL: panel.URL, Token: "secret", OfflineMOTD: "offline", StartingMOTD: "starting"},
		[]mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("starting")) {
		t.Fatalf("expected the starting message, got %q", answer)
	}
	if asked != "mc.example.com|Bearer secret" {
		t.Fatalf("unexpected request to the panel: %q", asked)
	}
}

func TestUnreachablePanelFallsBackToOffline(t *testing.T) {
	router := startRouterWith(t, config{PanelURL: "http://127.0.0.1:1", Token: "x", OfflineMOTD: "offline"},
		[]mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("offline")) {
		t.Fatalf("expected the offline message, got %q", answer)
	}
}

func TestMOTDsAcceptEscapedLineBreaks(t *testing.T) {
	t.Setenv("OFFLINE_MOTD", `first\nsecond`)

	if got := loadConfig().OfflineMOTD; got != "first\nsecond" {
		t.Fatalf("got %q", got)
	}
}
