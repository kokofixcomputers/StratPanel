package router

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestServerHashMatchesTheKnownExamples(t *testing.T) {
	for name, want := range map[string]string{
		"Notch": "4ed1f46bbe04bc756bcb17c0c7ce3e4632f06a48",
		"jeb_":  "-7c9d5b0044c130109a5d7b5fb5c317c02b4e28c1",
		"simon": "88e16a1019277b15d58faf0541e11910eb756f6",
	} {
		if got := serverHash([]byte(name)); got != want {
			t.Errorf("%s: got %s, want %s", name, got, want)
		}
	}
}

func TestCFB8RoundTrips(t *testing.T) {
	secret := []byte("0123456789abcdef")
	message := []byte("Stratosphere Minecraft Link, a message longer than a block of sixteen bytes")

	enc, _ := newCFB8(secret, false)
	dec, _ := newCFB8(secret, true)
	sealed := make([]byte, len(message))
	enc.XORKeyStream(sealed, message)
	if bytes.Equal(sealed, message) {
		t.Fatal("nothing was encrypted")
	}
	opened := make([]byte, len(sealed))
	dec.XORKeyStream(opened, sealed)
	if !bytes.Equal(opened, message) {
		t.Fatalf("got %q", opened)
	}
}

// fakeMojang answers hasJoined: the hash it expects (what the client works out) gets a profile, anything else gets 204.
type fakeMojang struct {
	*httptest.Server
	mu    sync.Mutex
	asked []string
	hash  string
	id    string
	name  string
}

func newFakeMojang(t *testing.T) *fakeMojang {
	t.Helper()
	m := &fakeMojang{id: "069a79f444e94726a5befca90e38aaf5", name: "Notch"}
	m.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		m.mu.Lock()
		defer m.mu.Unlock()
		m.asked = append(m.asked, req.URL.Query().Get("username")+" "+req.URL.Query().Get("serverId"))
		if req.URL.Query().Get("serverId") != m.hash {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": m.id, "name": m.name, "properties": []string{}})
	}))
	t.Cleanup(m.Close)

	return m
}

type fakePanel struct {
	*httptest.Server
	mu     sync.Mutex
	bodies []map[string]string
	answer string
	auth   string
}

func newFakePanel(t *testing.T, answer string) *fakePanel {
	t.Helper()
	p := &fakePanel{answer: answer}
	p.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		p.mu.Lock()
		defer p.mu.Unlock()
		var body map[string]string
		_ = json.NewDecoder(req.Body).Decode(&body)
		p.bodies = append(p.bodies, body)
		p.auth = req.Header.Get("Authorization")
		_, _ = io.WriteString(w, p.answer)
	}))
	t.Cleanup(p.Close)

	return p
}

func (p *fakePanel) calls() int {
	p.mu.Lock()
	defer p.mu.Unlock()

	return len(p.bodies)
}

func linkRouter(t *testing.T, mojang *fakeMojang, panel *fakePanel) string {
	t.Helper()
	cfg := config{UnknownMOTD: "unknown", LinkMOTD: "link me", PanelURL: panel.URL, Token: "secret", MojangURL: mojang.URL}
	r := &router{cfg: cfg, routes: map[string]route{}}
	r.linking.Store(true)

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

func handshakeFor(host string, protocol, next int) []byte {
	var body bytes.Buffer
	writeVarInt(&body, 0)
	writeVarInt(&body, protocol)
	body.Write(stringBody(host))
	_ = binary.Write(&body, binary.BigEndian, uint16(25565))
	writeVarInt(&body, next)

	return packetLength(body.Bytes())
}

func packetLength(body []byte) []byte {
	var out bytes.Buffer
	writeVarInt(&out, len(body))
	out.Write(body)

	return out.Bytes()
}

// joinAs is a Minecraft client that joins `unknown.example` as `name`: it does the encryption handshake like the real one, and returns
// the text of the screen it is disconnected with. `mojang.hash` is set to what the session server should accept.
func joinAs(t *testing.T, addr, name string, protocol int, mojang *fakeMojang, premium bool) string {
	t.Helper()

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	br := bufio.NewReader(conn)

	_, _ = conn.Write(handshakeFor("unknown.example", protocol, 2))

	var login bytes.Buffer
	writeVarInt(&login, 0)
	login.Write(stringBody(name))
	if protocol >= 764 {
		login.Write(make([]byte, 16))
	}
	_, _ = conn.Write(packetLength(login.Bytes()))

	id, body, err := readBody(br)
	if err != nil || id != 1 {
		t.Fatalf("expected an encryption request, got %d %v", id, err)
	}
	serverID, _ := readString(body, 20)
	der, _ := readBytes(body, 1024)
	token, _ := readBytes(body, 64)
	if protocol >= 766 {
		if flag, _ := body.ReadByte(); flag != 1 {
			t.Fatal("the request should say that the player is checked")
		}
	}
	parsed, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		t.Fatal(err)
	}
	public := parsed.(*rsa.PublicKey)

	secret := make([]byte, 16)
	_, _ = rand.Read(secret)
	if premium {
		mojang.mu.Lock()
		mojang.hash = serverHash([]byte(serverID), secret, der)
		mojang.mu.Unlock()
	}
	encSecret, _ := rsa.EncryptPKCS1v15(rand.Reader, public, secret)
	encToken, _ := rsa.EncryptPKCS1v15(rand.Reader, public, token)

	var response bytes.Buffer
	writeVarInt(&response, 1)
	response.Write(byteArray(encSecret))
	if protocol == 759 || protocol == 760 {
		response.WriteByte(1)
	}
	response.Write(byteArray(encToken))
	_, _ = conn.Write(packetLength(response.Bytes()))

	rest, _ := io.ReadAll(br)
	dec, _ := newCFB8(secret, true)
	dec.XORKeyStream(rest, rest)

	packet := bufio.NewReader(bytes.NewReader(rest))
	id, kick, err := readBody(packet)
	if err != nil || id != 0 {
		t.Fatalf("expected a disconnect, got %d %v (%x)", id, err, rest)
	}
	message, _ := readString(kick, 32767)

	var parsedMessage struct {
		Extra []struct {
			Text string `json:"text"`
		} `json:"extra"`
	}
	if err := json.Unmarshal([]byte(message), &parsedMessage); err != nil {
		t.Fatalf("the screen is not a text component: %v (%s)", err, message)
	}
	var out strings.Builder
	for _, part := range parsedMessage.Extra {
		out.WriteString(part.Text)
	}

	return out.String()
}

const codeAnswer = `{"status":"code","code":"123456","minutes":15,"panel":"panel.example.com","where":"Account → Minecraft"}`

func TestAPlayerGetsACodeAfterMojangSaysWhoTheyAre(t *testing.T) {
	for _, protocol := range []int{767, 766, 765, 761, 760, 759, 47} {
		mojang := newFakeMojang(t)
		panel := newFakePanel(t, codeAnswer)
		addr := linkRouter(t, mojang, panel)

		screen := joinAs(t, addr, "Notch", protocol, mojang, true)
		for _, want := range []string{"Stratosphere Minecraft Link", "123 456", "15 minutes", "Account → Minecraft", "panel.example.com", "Notch"} {
			if !strings.Contains(screen, want) {
				t.Errorf("protocol %d: the screen lacks %q: %q", protocol, want, screen)
			}
		}
		if panel.calls() != 1 || panel.bodies[0]["uuid"] != mojang.id || panel.bodies[0]["username"] != "Notch" || panel.auth != "Bearer secret" {
			t.Errorf("protocol %d: the panel was asked %v with %q", protocol, panel.bodies, panel.auth)
		}
	}
}

func TestAPlayerMojangDoesNotKnowIsNeverGivenACode(t *testing.T) {
	mojang := newFakeMojang(t)
	panel := newFakePanel(t, codeAnswer)
	addr := linkRouter(t, mojang, panel)

	screen := joinAs(t, addr, "Notch", 767, mojang, false)
	if !strings.Contains(screen, "could not be verified") || strings.Contains(screen, "123") {
		t.Fatalf("unexpected screen: %q", screen)
	}
	if panel.calls() != 0 {
		t.Fatal("the panel should not hear about an account nobody verified")
	}
}

func TestAProfileForAnotherNameIsRefused(t *testing.T) {
	mojang := newFakeMojang(t)
	mojang.name = "jeb_"
	panel := newFakePanel(t, codeAnswer)
	addr := linkRouter(t, mojang, panel)

	if screen := joinAs(t, addr, "Notch", 767, mojang, true); !strings.Contains(screen, "could not be verified") || panel.calls() != 0 {
		t.Fatalf("unexpected screen: %q", screen)
	}
}

func TestALinkedAccountSaysWhoItIsLinkedTo(t *testing.T) {
	mojang := newFakeMojang(t)
	panel := newFakePanel(t, `{"status":"linked","account":"koko"}`)
	addr := linkRouter(t, mojang, panel)

	screen := joinAs(t, addr, "Notch", 767, mojang, true)
	if !strings.Contains(screen, "Linked") || !strings.Contains(screen, "koko") {
		t.Fatalf("unexpected screen: %q", screen)
	}
}

func TestAnUnreachablePanelIsSaidSo(t *testing.T) {
	mojang := newFakeMojang(t)
	panel := newFakePanel(t, codeAnswer)
	addr := linkRouter(t, mojang, panel)
	panel.Close()

	if screen := joinAs(t, addr, "Notch", 767, mojang, true); !strings.Contains(screen, "panel could not be reached") {
		t.Fatalf("unexpected screen: %q", screen)
	}
}

func TestWithoutLinkingAnUnknownAddressIsAnswerAsBefore(t *testing.T) {
	r := &router{cfg: config{UnknownMOTD: "unknown", LinkMOTD: "link me"}, routes: map[string]route{}}
	listener, _ := net.Listen("tcp", "127.0.0.1:0")
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

	if got := string(ask(t, listener.Addr().String(), "nothing.example", 2)); !strings.Contains(got, "unknown") {
		t.Fatalf("got %q", got)
	}
}

func TestTheServerListInvitesToLink(t *testing.T) {
	mojang := newFakeMojang(t)
	panel := newFakePanel(t, codeAnswer)
	addr := linkRouter(t, mojang, panel)

	if got := string(ask(t, addr, "nothing.example", 1)); !strings.Contains(got, "link me") {
		t.Fatalf("got %q", got)
	}
}

func TestSomeoneWhoKeepsTryingIsSlowedDown(t *testing.T) {
	mojang := newFakeMojang(t)
	panel := newFakePanel(t, codeAnswer)
	addr := linkRouter(t, mojang, panel)

	for i := 0; i < 12; i++ {
		joinAs(t, addr, "Notch", 767, mojang, true)
	}

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	_, _ = conn.Write(handshakeFor("unknown.example", 767, 2))
	got, _ := io.ReadAll(conn)
	if !strings.Contains(string(got), "Too many tries") {
		t.Fatalf("got %q", got)
	}
}
