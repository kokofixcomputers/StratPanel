package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

// A panel that says the server is asleep, and records what the router asks it.
type sleepyPanel struct {
	*httptest.Server
	mu        sync.Mutex
	wakes     []string
	auth      []string
	wakeReply string
}

func newSleepyPanel(t *testing.T, sleeping bool, wakeReply string) *sleepyPanel {
	panel := &sleepyPanel{wakeReply: wakeReply}
	panel.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		panel.mu.Lock()
		defer panel.mu.Unlock()
		panel.auth = append(panel.auth, req.Header.Get("Authorization"))

		switch req.URL.Path {
		case "/api/router/state":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"state":"offline","sleeping":%v}`, sleeping)))
		case "/api/router/wake":
			var body struct {
				Domain string `json:"domain"`
			}
			_ = json.NewDecoder(req.Body).Decode(&body)
			panel.wakes = append(panel.wakes, body.Domain)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"result":%q}`, panel.wakeReply)))
		default:
			http.NotFound(w, req)
		}
	}))
	t.Cleanup(panel.Close)

	return panel
}

func (p *sleepyPanel) wakeCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()

	return len(p.wakes)
}

func sleepConfig(panel *sleepyPanel) config {
	return config{
		PanelURL: panel.URL, Token: "secret", OfflineMOTD: "offline", StartingMOTD: "starting",
		SleepingMOTD: "asleep, join to wake it", WakingMOTD: "waking up",
	}
}

func TestSleepingServerSaysSoInTheServerListAndIsNotWokenByLooking(t *testing.T) {
	panel := newSleepyPanel(t, true, "woken")
	router := startRouterWith(t, sleepConfig(panel), []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	answer := ask(t, router, "mc.example.com", 1)
	if !bytes.Contains(answer, []byte("asleep, join to wake it")) || !bytes.Contains(answer, []byte("Sleeping")) {
		t.Fatalf("expected the sleeping message in the server list, got %q", answer)
	}
	// Looking at the server list, however often, must not start the server.
	for i := 0; i < 3; i++ {
		ask(t, router, "mc.example.com", 1)
	}
	if panel.wakeCount() != 0 {
		t.Fatalf("the server list woke the server %d times", panel.wakeCount())
	}
}

func TestJoiningASleepingServerWakesItAndSaysSo(t *testing.T) {
	panel := newSleepyPanel(t, true, "woken")
	router := startRouterWith(t, sleepConfig(panel), []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	answer := ask(t, router, "mc.example.com", 2)
	if !bytes.Contains(answer, []byte("waking up")) {
		t.Fatalf("expected the waking message, got %q", answer)
	}
	if panel.wakeCount() != 1 || panel.wakes[0] != "mc.example.com" {
		t.Fatalf("expected one request to wake mc.example.com, got %v", panel.wakes)
	}
	for _, auth := range panel.auth {
		if auth != "Bearer secret" {
			t.Fatalf("the router did not send its token: %q", auth)
		}
	}
}

func TestAServerThatIsAlreadyBeingWokenGetsTheSameMessage(t *testing.T) {
	for _, reply := range []string{"cooldown", "awake"} {
		panel := newSleepyPanel(t, true, reply)
		router := startRouterWith(t, sleepConfig(panel), []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

		if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("waking up")) {
			t.Fatalf("%s: expected the waking message, got %q", reply, answer)
		}
	}
}

func TestAPanelThatDoesNotWakeItLeavesThePlayerWithTheSleepingMessage(t *testing.T) {
	for _, reply := range []string{"not-sleeping", "blocked"} {
		panel := newSleepyPanel(t, true, reply)
		router := startRouterWith(t, sleepConfig(panel), []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

		answer := ask(t, router, "mc.example.com", 2)
		if bytes.Contains(answer, []byte("waking up")) || !bytes.Contains(answer, []byte("asleep, join to wake it")) {
			t.Fatalf("%s: expected the sleeping message, got %q", reply, answer)
		}
	}
}

func TestAServerThatIsOffButNotAsleepIsNeverWoken(t *testing.T) {
	panel := newSleepyPanel(t, false, "woken")
	router := startRouterWith(t, sleepConfig(panel), []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("offline")) {
		t.Fatalf("expected the offline message, got %q", answer)
	}
	if panel.wakeCount() != 0 {
		t.Fatal("a server that was only stopped was woken")
	}
}

func TestSleepingMessagesCanBeChanged(t *testing.T) {
	t.Setenv("SLEEPING_MOTD", `zzz\nnight`)
	t.Setenv("WAKING_MOTD", `up`)

	cfg := loadConfig()
	if cfg.SleepingMOTD != "zzz\nnight" || cfg.WakingMOTD != "up" {
		t.Fatalf("got %q and %q", cfg.SleepingMOTD, cfg.WakingMOTD)
	}
}

func TestTheDefaultSleepingMessagesExplainWhatToDo(t *testing.T) {
	cfg := loadConfig()
	if !strings.Contains(cfg.SleepingMOTD, "asleep") || !strings.Contains(cfg.WakingMOTD, "Waking") {
		t.Fatalf("got %q and %q", cfg.SleepingMOTD, cfg.WakingMOTD)
	}
}

// A panel that answers the state question with whatever body it is given.
func statePanel(t *testing.T, body string) *httptest.Server {
	panel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(panel.Close)

	return panel
}

func TestAMessageFromThePanelReplacesTheRoutersOwnWords(t *testing.T) {
	panel := statePanel(t, `{"state":"offline","sleeping":false,"notice":{"label":"Closed","message":"custom message"}}`)
	router := startRouterWith(t, config{PanelURL: panel.URL, Token: "x", OfflineMOTD: "offline"},
		[]mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	status := ask(t, router, "mc.example.com", 1)
	if !bytes.Contains(status, []byte("custom message")) || !bytes.Contains(status, []byte("Closed")) || bytes.Contains(status, []byte("offline")) {
		t.Fatalf("expected the message of the panel in the server list, got %q", status)
	}
	if login := ask(t, router, "mc.example.com", 2); !bytes.Contains(login, []byte("custom message")) {
		t.Fatalf("expected the message of the panel when joining, got %q", login)
	}
}

func TestAMessageWithoutALabelKeepsTheRoutersLabel(t *testing.T) {
	panel := statePanel(t, `{"state":"offline","sleeping":false,"notice":{"message":"custom message"}}`)
	router := startRouterWith(t, config{PanelURL: panel.URL, Token: "x", OfflineMOTD: "offline"},
		[]mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	status := ask(t, router, "mc.example.com", 1)
	if !bytes.Contains(status, []byte("Offline")) || !bytes.Contains(status, []byte("custom message")) {
		t.Fatalf("got %q", status)
	}
}

func TestAnEmptyMessageFromThePanelIsIgnored(t *testing.T) {
	for _, body := range []string{
		`{"state":"offline","notice":{"label":"x","message":""}}`,
		`{"state":"offline","notice":{"label":"x","message":"   "}}`,
		`{"state":"offline","notice":null}`,
		`{"state":"offline","notice":"text"}`,
	} {
		panel := statePanel(t, body)
		router := startRouterWith(t, config{PanelURL: panel.URL, Token: "x", OfflineMOTD: "offline"},
			[]mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

		if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("offline")) {
			t.Fatalf("%s: expected the router's own message, got %q", body, answer)
		}
	}
}

func TestAMessageFromThePanelDoesNotHideWhyAServerCannotBeJoined(t *testing.T) {
	panel := statePanel(t, `{"state":"offline","notice":{"message":"custom message"}}`)
	router := startRouterWith(t, config{PanelURL: panel.URL, Token: "x", SuspendedMOTD: "suspended"},
		[]mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1, Status: "suspended"}})

	if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("suspended")) || bytes.Contains(answer, []byte("custom")) {
		t.Fatalf("expected the suspended message, got %q", answer)
	}
}

func TestAMessageFromThePanelShowsForASleepingServerInTheServerListButWakingStillWins(t *testing.T) {
	panel := newSleepyPanel(t, true, "woken")
	cfg := sleepConfig(panel)
	router := startRouterWith(t, cfg, []mapping{{Domain: "mc.example.com", Host: "127.0.0.1", Port: 1}})

	if answer := ask(t, router, "mc.example.com", 2); !bytes.Contains(answer, []byte("waking up")) {
		t.Fatalf("expected the waking message, got %q", answer)
	}
}
