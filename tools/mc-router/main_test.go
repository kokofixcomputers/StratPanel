package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"io"
	"net"
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

	r := &router{cfg: config{UnknownMOTD: "unknown", OfflineMOTD: "offline"}, routes: map[string]string{}}
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
