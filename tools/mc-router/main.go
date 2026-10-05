// mc-router sends Minecraft Java connections to the right server based on the address the player typed.
//
// Players connect to a custom domain on the default port 25565. The first packet of every Minecraft connection (the
// handshake) contains that domain, so the router reads it, looks it up in the list of domains the panel knows about,
// and forwards the connection to the matching allocation. Nothing but an A record is needed for the domain.
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type mapping struct {
	Domain string `json:"domain"`
	Host   string `json:"host"`
	Port   int    `json:"port"`
	// Set by the panel when the server cannot be joined at all: "suspended", "installing" or "restoring".
	Status string `json:"status"`
}

type route struct {
	Target string
	Status string
}

type cachedState struct {
	state string
	at    time.Time
}

type config struct {
	Listen        string
	PanelURL      string
	Token         string
	MappingFile   string
	Refresh       time.Duration
	ProxyProtocol bool
	UnknownMOTD   string
	OfflineMOTD   string
	StartingMOTD  string
	StoppingMOTD  string
	SuspendedMOTD string
	InstallMOTD   string
}

type router struct {
	cfg    config
	mu     sync.RWMutex
	routes map[string]route

	stateMu sync.Mutex
	states  map[string]cachedState
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

// motdOr reads a message from the environment. Environment files cannot hold a real line break, so "\n" is accepted.
func motdOr(key, fallback string) string {
	return strings.ReplaceAll(envOr(key, fallback), `\n`, "\n")
}

func loadConfig() config {
	refresh, err := time.ParseDuration(envOr("REFRESH", "15s"))
	if err != nil || refresh < time.Second {
		refresh = 15 * time.Second
	}

	return config{
		Listen:        envOr("LISTEN", ":25565"),
		PanelURL:      strings.TrimRight(os.Getenv("PANEL_URL"), "/"),
		Token:         os.Getenv("ROUTER_TOKEN"),
		MappingFile:   os.Getenv("MAPPING_FILE"),
		Refresh:       refresh,
		ProxyProtocol: os.Getenv("PROXY_PROTOCOL") == "1",
		UnknownMOTD:   motdOr("UNKNOWN_MOTD", "§cNo server is set up for this address."),
		OfflineMOTD:   motdOr("OFFLINE_MOTD", "§eThis server is off.\n§7Come back once it has been started."),
		StartingMOTD:  motdOr("STARTING_MOTD", "§aThis server is starting...\n§7See you soon!"),
		StoppingMOTD:  motdOr("STOPPING_MOTD", "§eThis server is shutting down.\n§7Try again in a moment."),
		SuspendedMOTD: motdOr("SUSPENDED_MOTD", "§cThis server is suspended.\n§7Contact the owner or an administrator."),
		InstallMOTD:   motdOr("INSTALLING_MOTD", "§eThis server is being set up.\n§7Check back soon."),
	}
}

// ---- Minecraft protocol helpers -------------------------------------------------------------------------------

func readVarInt(r io.ByteReader) (int, error) {
	value := 0
	for i := 0; i < 5; i++ {
		b, err := r.ReadByte()
		if err != nil {
			return 0, err
		}

		value |= int(b&0x7f) << (7 * i)
		if b&0x80 == 0 {
			return value, nil
		}
	}

	return 0, errors.New("varint is too long")
}

func writeVarInt(buf *bytes.Buffer, value int) {
	v := uint32(value)
	for {
		b := byte(v & 0x7f)
		v >>= 7
		if v != 0 {
			buf.WriteByte(b | 0x80)
		} else {
			buf.WriteByte(b)
			return
		}
	}
}

func packet(id int, body []byte) []byte {
	var inner bytes.Buffer
	writeVarInt(&inner, id)
	inner.Write(body)

	var out bytes.Buffer
	writeVarInt(&out, inner.Len())
	out.Write(inner.Bytes())

	return out.Bytes()
}

func stringBody(text string) []byte {
	var out bytes.Buffer
	writeVarInt(&out, len(text))
	out.WriteString(text)

	return out.Bytes()
}

type handshake struct {
	Raw       []byte // the packet exactly as the client sent it, including its length prefix
	Protocol  int
	Host      string
	Port      uint16
	NextState int
}

// readHandshake reads the first packet of a connection.
func readHandshake(r *bufio.Reader) (*handshake, error) {
	length, err := readVarInt(r)
	if err != nil {
		return nil, err
	}
	if length < 3 || length > 1024 {
		return nil, fmt.Errorf("unexpected handshake length %d", length)
	}

	body := make([]byte, length)
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}

	var prefix bytes.Buffer
	writeVarInt(&prefix, length)
	raw := append(prefix.Bytes(), body...)

	br := bytes.NewReader(body)
	id, err := readVarInt(br)
	if err != nil || id != 0 {
		return nil, errors.New("first packet is not a handshake")
	}

	protocol, err := readVarInt(br)
	if err != nil {
		return nil, err
	}

	hostLength, err := readVarInt(br)
	if err != nil || hostLength < 0 || hostLength > 255*4 {
		return nil, errors.New("invalid host length")
	}

	host := make([]byte, hostLength)
	if _, err := io.ReadFull(br, host); err != nil {
		return nil, err
	}

	var port uint16
	if err := binary.Read(br, binary.BigEndian, &port); err != nil {
		return nil, err
	}

	next, err := readVarInt(br)
	if err != nil {
		return nil, err
	}

	return &handshake{Raw: raw, Protocol: protocol, Host: normalizeHost(string(host)), Port: port, NextState: next}, nil
}

// normalizeHost strips what clients append to the address, such as the "\0FML\0" marker of Forge clients and the
// trailing dot of fully qualified names.
func normalizeHost(host string) string {
	if i := strings.IndexByte(host, 0); i >= 0 {
		host = host[:i]
	}

	return strings.ToLower(strings.TrimSuffix(host, "."))
}

// ---- answering players when there is no server ------------------------------------------------------------------

func chatJSON(text string) string {
	data, _ := json.Marshal(map[string]string{"text": text})

	return string(data)
}

// reply answers a player the router cannot send anywhere. Status pings get a server list entry that explains why,
// logins get a disconnect message.
func reply(conn net.Conn, br *bufio.Reader, hs *handshake, label, message string) {
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	if hs.NextState == 1 {
		// Status request (an empty packet), then a ping the server has to echo back.
		if _, err := readPacket(br); err != nil {
			return
		}

		status, _ := json.Marshal(map[string]interface{}{
			"version":     map[string]interface{}{"name": label, "protocol": -1},
			"players":     map[string]interface{}{"max": 0, "online": 0},
			"description": map[string]string{"text": message},
		})
		_, _ = conn.Write(packet(0, stringBody(string(status))))

		if ping, err := readPacket(br); err == nil {
			_, _ = conn.Write(ping)
		}

		return
	}

	// Disconnect during login.
	_, _ = conn.Write(packet(0, stringBody(chatJSON(message))))
}

// readPacket returns a whole packet including its length prefix.
func readPacket(br *bufio.Reader) ([]byte, error) {
	length, err := readVarInt(br)
	if err != nil {
		return nil, err
	}
	if length < 0 || length > 1024 {
		return nil, errors.New("packet too large")
	}

	body := make([]byte, length)
	if _, err := io.ReadFull(br, body); err != nil {
		return nil, err
	}

	var out bytes.Buffer
	writeVarInt(&out, length)
	out.Write(body)

	return out.Bytes(), nil
}

// ---- routing ----------------------------------------------------------------------------------------------------

func (r *router) lookup(host string) (route, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	found, ok := r.routes[host]

	return found, ok
}

func (r *router) set(list []mapping) {
	routes := make(map[string]route, len(list))
	for _, m := range list {
		if m.Domain != "" && m.Host != "" && m.Port > 0 {
			routes[strings.ToLower(m.Domain)] = route{
				Target: net.JoinHostPort(m.Host, strconv.Itoa(m.Port)),
				Status: m.Status,
			}
		}
	}

	r.mu.Lock()
	r.routes = routes
	r.mu.Unlock()
}

func (r *router) refresh(ctx context.Context) error {
	if r.cfg.MappingFile != "" {
		data, err := os.ReadFile(r.cfg.MappingFile)
		if err != nil {
			return err
		}

		return r.parse(data)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.cfg.PanelURL+"/api/router/domains", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.cfg.Token)
	req.Header.Set("Accept", "application/json")

	res, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("panel answered with status %d", res.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return err
	}

	return r.parse(data)
}

func (r *router) parse(data []byte) error {
	var body struct {
		Data []mapping `json:"data"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return err
	}

	r.set(body.Data)

	return nil
}

func (r *router) poll(ctx context.Context) {
	ticker := time.NewTicker(r.cfg.Refresh)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.refresh(ctx); err != nil {
				// Keep serving the last list we know about.
				log.Printf("could not refresh domains: %v", err)
			}
		}
	}
}

// liveState asks the panel what the server behind a domain is doing right now: "running", "starting", "stopping",
// "offline" or "unknown". Answers are remembered for a few seconds so server list refreshes do not flood the panel.
func (r *router) liveState(domain string) string {
	if r.cfg.MappingFile != "" || r.cfg.PanelURL == "" {
		return "unknown"
	}

	r.stateMu.Lock()
	if cached, ok := r.states[domain]; ok && time.Since(cached.at) < 3*time.Second {
		r.stateMu.Unlock()
		return cached.state
	}
	r.stateMu.Unlock()

	state := r.fetchState(domain)

	r.stateMu.Lock()
	if r.states == nil {
		r.states = map[string]cachedState{}
	}
	r.states[domain] = cachedState{state: state, at: time.Now()}
	r.stateMu.Unlock()

	return state
}

func (r *router) fetchState(domain string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.cfg.PanelURL+"/api/router/state?domain="+url.QueryEscape(domain), nil)
	if err != nil {
		return "unknown"
	}
	req.Header.Set("Authorization", "Bearer "+r.cfg.Token)
	req.Header.Set("Accept", "application/json")

	res, err := (&http.Client{Timeout: 2 * time.Second}).Do(req)
	if err != nil {
		return "unknown"
	}
	defer res.Body.Close()

	var body struct {
		State string `json:"state"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&body) != nil || body.State == "" {
		return "unknown"
	}

	return body.State
}

// notice is what a player is told when a server cannot be reached, with a short label for the server list.
func (r *router) notice(status, state string) (string, string) {
	switch status {
	case "suspended":
		return "Suspended", r.cfg.SuspendedMOTD
	case "installing", "restoring":
		return "Setting up", r.cfg.InstallMOTD
	}

	switch state {
	case "starting":
		return "Starting", r.cfg.StartingMOTD
	case "stopping":
		return "Stopping", r.cfg.StoppingMOTD
	}

	return "Offline", r.cfg.OfflineMOTD
}

func (r *router) handle(client net.Conn) {
	defer client.Close()

	_ = client.SetReadDeadline(time.Now().Add(10 * time.Second))
	br := bufio.NewReader(client)

	hs, err := readHandshake(br)
	if err != nil {
		return
	}

	found, ok := r.lookup(hs.Host)
	if !ok {
		reply(client, br, hs, "Unknown", r.cfg.UnknownMOTD)
		return
	}

	// Servers that are suspended or still being installed are never forwarded to.
	if found.Status != "" {
		label, message := r.notice(found.Status, "")
		reply(client, br, hs, label, message)
		return
	}

	backend, err := net.DialTimeout("tcp", found.Target, 5*time.Second)
	if err != nil {
		log.Printf("%s -> %s: %v", hs.Host, found.Target, err)
		label, message := r.notice("", r.liveState(hs.Host))
		reply(client, br, hs, label, message)
		return
	}
	defer backend.Close()

	if r.cfg.ProxyProtocol {
		if src, ok := client.RemoteAddr().(*net.TCPAddr); ok {
			dst := client.LocalAddr().(*net.TCPAddr)
			family := "TCP4"
			if src.IP.To4() == nil {
				family = "TCP6"
			}
			_, _ = fmt.Fprintf(backend, "PROXY %s %s %s %d %d\r\n", family, src.IP, dst.IP, src.Port, dst.Port)
		}
	}

	// Replay the handshake and whatever the client already sent behind it, then just pipe bytes both ways. Anything
	// the buffered reader pulled off the connection has been forwarded here, so the pipe continues right after it.
	if _, err := backend.Write(hs.Raw); err != nil {
		return
	}
	if buffered := br.Buffered(); buffered > 0 {
		rest, _ := br.Peek(buffered)
		if _, err := backend.Write(rest); err != nil {
			return
		}
	}

	_ = client.SetReadDeadline(time.Time{})

	done := make(chan struct{}, 2)
	pipe := func(dst, src net.Conn) {
		_, _ = io.Copy(dst, src)
		if tcp, ok := dst.(*net.TCPConn); ok {
			_ = tcp.CloseWrite()
		}
		done <- struct{}{}
	}

	go pipe(backend, client)
	go pipe(client, backend)
	<-done
	<-done
}

func main() {
	cfg := loadConfig()
	if cfg.MappingFile == "" && (cfg.PanelURL == "" || cfg.Token == "") {
		log.Fatal("set PANEL_URL and ROUTER_TOKEN (or MAPPING_FILE for a static list)")
	}

	r := &router{cfg: cfg, routes: map[string]route{}}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := r.refresh(ctx); err != nil {
		log.Printf("could not load domains yet, will keep retrying: %v", err)
	}
	go r.poll(ctx)

	listener, err := net.Listen("tcp", cfg.Listen)
	if err != nil {
		log.Fatal(err)
	}
	go func() {
		<-ctx.Done()
		_ = listener.Close()
	}()

	log.Printf("mc-router listening on %s", cfg.Listen)
	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			continue
		}

		go r.handle(conn)
	}
}
