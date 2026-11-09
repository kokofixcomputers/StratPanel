package router

// Linking a Minecraft account to a panel account. A player who joins through the router with an address that leads nowhere is not
// turned away with "no server": the router asks Mojang whether they are who they say they are (the encryption handshake of an online
// mode server), asks the panel for a code and shows it on the disconnect screen. The player types the code into their account page on
// the panel. Nothing is stored here, and nothing about the player is trusted until Mojang confirmed it.

import (
	"bufio"
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// DefaultMojangURL answers whether a player did join a server with the hash of the encryption handshake.
const DefaultMojangURL = "https://sessionserver.mojang.com/session/minecraft/hasJoined"

var playerName = regexp.MustCompile(`^[A-Za-z0-9_]{1,16}$`)

// ---- the encrypted half of the connection -------------------------------------------------------------------------------

// cfb8 is the cipher Minecraft encrypts the connection with (AES in CFB8 mode, the shared secret is the key and the first block). The
// standard library has the other modes only.
type cfb8 struct {
	block   cipher.Block
	iv      []byte
	decrypt bool
}

func newCFB8(secret []byte, decrypt bool) (*cfb8, error) {
	block, err := aes.NewCipher(secret)
	if err != nil {
		return nil, err
	}

	return &cfb8{block: block, iv: append([]byte(nil), secret...), decrypt: decrypt}, nil
}

func (c *cfb8) XORKeyStream(dst, src []byte) {
	scratch := make([]byte, c.block.BlockSize())
	for i, in := range src {
		c.block.Encrypt(scratch, c.iv)
		out := in ^ scratch[0]
		copy(c.iv, c.iv[1:])
		if c.decrypt {
			c.iv[len(c.iv)-1] = in
		} else {
			c.iv[len(c.iv)-1] = out
		}
		dst[i] = out
	}
}

// serverHash is what Minecraft sends to the session server: the SHA-1 of the server id, the shared secret and the public key, read as
// a signed number and written in hexadecimal (so it can start with a minus sign).
func serverHash(parts ...[]byte) string {
	sum := sha1.New()
	for _, part := range parts {
		sum.Write(part)
	}
	digest := sum.Sum(nil)

	number := new(big.Int).SetBytes(digest)
	if digest[0]&0x80 != 0 {
		number.Sub(number, new(big.Int).Lsh(big.NewInt(1), 160))
	}

	return number.Text(16)
}

// ---- reading what the client sends -----------------------------------------------------------------------------------

// readBody returns the id and the rest of one packet.
func readBody(br *bufio.Reader) (int, *bytes.Reader, error) {
	length, err := readVarInt(br)
	if err != nil {
		return 0, nil, err
	}
	if length < 1 || length > 4096 {
		return 0, nil, errors.New("packet has an unexpected size")
	}

	body := make([]byte, length)
	if _, err := io.ReadFull(br, body); err != nil {
		return 0, nil, err
	}

	reader := bytes.NewReader(body)
	id, err := readVarInt(reader)

	return id, reader, err
}

func readString(r *bytes.Reader, max int) (string, error) {
	length, err := readVarInt(r)
	if err != nil || length < 0 || length > max*4 {
		return "", errors.New("string has an unexpected size")
	}

	text := make([]byte, length)
	if _, err := io.ReadFull(r, text); err != nil {
		return "", err
	}

	return string(text), nil
}

func readBytes(r *bytes.Reader, max int) ([]byte, error) {
	length, err := readVarInt(r)
	if err != nil || length < 0 || length > max {
		return nil, errors.New("array has an unexpected size")
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, err
	}

	return data, nil
}

func byteArray(data []byte) []byte {
	var out bytes.Buffer
	writeVarInt(&out, len(data))
	out.Write(data)

	return out.Bytes()
}

// ---- what is said to the player --------------------------------------------------------------------------------------

type component map[string]interface{}

func text(value, color string, bold bool) component {
	part := component{"text": value, "color": color}
	if bold {
		part["bold"] = true
	}

	return part
}

// disconnect is the screen the player sees. `extra` is a list of parts, the lines are made with "\n".
func disconnect(parts ...component) string {
	extra := make([]component, 0, len(parts))
	extra = append(extra, parts...)
	data, _ := json.Marshal(component{"text": "", "extra": extra})

	return string(data)
}

func spaced(code string) string {
	if len(code) == 6 {
		return code[:3] + " " + code[3:]
	}

	return code
}

// ---- asking the panel ----------------------------------------------------------------------------------------------

// linkAnswer is what the panel says about a Minecraft account that wants to be linked.
type linkAnswer struct {
	// "code": here is a code, "linked": it already is linked, "disabled": the panel does not link accounts.
	Status  string `json:"status"`
	Code    string `json:"code"`
	Minutes int    `json:"minutes"`
	Account string `json:"account"`
	// Where the player goes to enter the code (the address of the panel, and the way to the page).
	Panel string `json:"panel"`
	Where string `json:"where"`
}

type profile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// linker keeps what linking needs: a key for the encryption handshake and a limit on how much of it one person can ask for.
type linker struct {
	once sync.Once
	key  *rsa.PrivateKey
	der  []byte
	err  error

	mu    sync.Mutex
	tries map[string][]time.Time
	slots chan struct{}
}

func (l *linker) init() error {
	l.once.Do(func() {
		// Minecraft clients expect a 1024 bit key, which is also what vanilla servers make.
		l.key, l.err = rsa.GenerateKey(rand.Reader, 1024)
		if l.err == nil {
			l.der, l.err = x509.MarshalPKIXPublicKey(&l.key.PublicKey)
		}
		l.slots = make(chan struct{}, 64)
		l.tries = map[string][]time.Time{}
	})

	return l.err
}

// allow says whether this address may try again (twelve times a minute), and whether there is room for one more at the same time.
func (l *linker) allow(address string) (release func(), ok bool) {
	l.mu.Lock()
	now := time.Now()
	recent := l.tries[address][:0]
	for _, at := range l.tries[address] {
		if now.Sub(at) < time.Minute {
			recent = append(recent, at)
		}
	}
	if len(recent) >= 12 {
		l.tries[address] = recent
		l.mu.Unlock()
		return nil, false
	}
	l.tries[address] = append(recent, now)
	// Addresses that stopped trying are forgotten now and then.
	if len(l.tries) > 4096 {
		for key, times := range l.tries {
			if len(times) == 0 || now.Sub(times[len(times)-1]) > time.Minute {
				delete(l.tries, key)
			}
		}
	}
	l.mu.Unlock()

	select {
	case l.slots <- struct{}{}:
		return func() { <-l.slots }, true
	default:
		return nil, false
	}
}

// verify asks Mojang whether the player really joined with this hash. An empty profile is a player who is not who they say (or who
// plays without an account, which is the same to us).
func (r *router) verify(name, hash string) (*profile, error) {
	base := r.cfg.MojangURL
	if base == "" {
		base = DefaultMojangURL
	}

	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"?username="+url.QueryEscape(name)+"&serverId="+url.QueryEscape(hash), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	res, err := (&http.Client{Timeout: 6 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNoContent || res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the session server answered with status %d", res.StatusCode)
	}

	var found profile
	if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&found); err != nil {
		return nil, err
	}
	found.ID = strings.ReplaceAll(strings.ToLower(found.ID), "-", "")
	if len(found.ID) != 32 || !strings.EqualFold(found.Name, name) {
		return nil, nil
	}

	return &found, nil
}

// askPanel tells the panel who wants to link their account and gets the code (or the news that it is linked already).
func (r *router) askPanel(id, name string) (*linkAnswer, error) {
	body, _ := json.Marshal(map[string]string{"uuid": id, "username": name})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.cfg.PanelURL+"/api/router/link", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+r.cfg.Token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	res, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the panel answered with status %d", res.StatusCode)
	}

	var answer linkAnswer
	if err := json.NewDecoder(io.LimitReader(res.Body, 16<<10)).Decode(&answer); err != nil {
		return nil, err
	}

	return &answer, nil
}

func linkTitle() component {
	return text("Stratosphere Minecraft Link\n\n", "aqua", true)
}

func (r *router) linkScreen(name string, answer *linkAnswer) string {
	switch answer.Status {
	case "linked":
		return disconnect(
			linkTitle(),
			text("Linked\n\n", "green", true),
			text(name, "white", true),
			text(" is linked to the Stratosphere account ", "gray", false),
			text(answer.Account, "white", true),
			text(".\n\n", "gray", false),
			text("Nothing more to do. You can unlink it in your account settings.", "dark_gray", false),
		)
	case "code":
		where := answer.Where
		if where == "" {
			where = "Account → Minecraft"
		}
		parts := []component{
			linkTitle(),
			text("Hi ", "gray", false), text(name, "white", true), text("!\n", "gray", false),
			text("Go to ", "gray", false), text(where, "yellow", true),
		}
		if answer.Panel != "" {
			parts = append(parts, text(" on ", "gray", false), text(answer.Panel, "yellow", true))
		}
		parts = append(parts,
			text(" and enter this code:\n\n", "gray", false),
			text(spaced(answer.Code)+"\n\n", "gold", true),
			text(fmt.Sprintf("This code expires in %d minutes.\n", answer.Minutes), "gray", false),
			text("Join again for a new one. Never share it with anybody.", "dark_gray", false),
		)

		return disconnect(parts...)
	}

	return r.linkMessage("Linking is not available right now.", "Try again later.")
}

func (r *router) linkMessage(headline, hint string) string {
	return disconnect(linkTitle(), text(headline+"\n\n", "red", true), text(hint, "gray", false))
}

// link is what a player who joins an address that leads nowhere gets, when the panel links accounts: a handshake with Mojang to know
// who they are, then the screen with their code. Whatever goes wrong they get a message saying so, never a hang.
func (r *router) link(client net.Conn, br *bufio.Reader, hs *handshake) {
	if err := r.linker.init(); err != nil {
		reply(client, br, hs, "Unknown", r.cfg.UnknownMOTD)
		return
	}

	release, ok := r.linker.allow(remoteIP(client))
	if !ok {
		_, _ = client.Write(packet(0, stringBody(disconnect(linkTitle(), text("Too many tries.\n\n", "red", true), text("Wait a minute and join again.", "gray", false)))))
		return
	}
	defer release()

	_ = client.SetDeadline(time.Now().Add(30 * time.Second))

	// Login Start: the name the player says they have (what follows it differs per version and is not needed).
	id, body, err := readBody(br)
	if err != nil || id != 0 {
		return
	}
	name, err := readString(body, 16)
	if err != nil || !playerName.MatchString(name) {
		_, _ = client.Write(packet(0, stringBody(r.linkMessage("That is not a Minecraft name.", "Join with your own account."))))
		return
	}

	// The encryption request. Version 1.20.5 added a flag that says whether to check the player with Mojang.
	token := make([]byte, 4)
	if _, err := rand.Read(token); err != nil {
		return
	}
	var request bytes.Buffer
	request.Write(stringBody(""))
	request.Write(byteArray(r.linker.der))
	request.Write(byteArray(token))
	if hs.Protocol >= 766 {
		request.WriteByte(1)
	}
	if _, err := client.Write(packet(1, request.Bytes())); err != nil {
		return
	}

	id, body, err = readBody(br)
	if err != nil || id != 1 {
		return
	}
	encryptedSecret, err := readBytes(body, 1024)
	if err != nil {
		return
	}
	var encryptedToken []byte
	if hs.Protocol == 759 || hs.Protocol == 760 {
		// 1.19 and 1.19.1: the client may sign the token instead of encrypting it (chat signing), which proves nothing we need.
		has, err := body.ReadByte()
		if err != nil {
			return
		}
		if has == 1 {
			if encryptedToken, err = readBytes(body, 1024); err != nil {
				return
			}
		}
	} else if encryptedToken, err = readBytes(body, 1024); err != nil {
		return
	}

	secret, err := rsa.DecryptPKCS1v15(rand.Reader, r.linker.key, encryptedSecret)
	if err != nil || len(secret) != 16 {
		return
	}
	if encryptedToken != nil {
		if sent, err := rsa.DecryptPKCS1v15(rand.Reader, r.linker.key, encryptedToken); err != nil || !bytes.Equal(sent, token) {
			return
		}
	}

	// From here on the player expects everything encrypted, the disconnect screen as well.
	stream, err := newCFB8(secret, false)
	if err != nil {
		return
	}
	send := func(message string) {
		out := packet(0, stringBody(message))
		stream.XORKeyStream(out, out)
		_, _ = client.Write(out)
	}

	found, err := r.verify(name, serverHash([]byte(""), secret, r.linker.der))
	if err != nil {
		send(r.linkMessage("Minecraft could not be asked who you are.", "Try again in a moment."))
		return
	}
	if found == nil {
		send(r.linkMessage("Your account could not be verified.", "Join with a Minecraft account you own (not offline mode), signed in with the official launcher."))
		return
	}

	answer, err := r.askPanel(found.ID, found.Name)
	if err != nil {
		send(r.linkMessage("The panel could not be reached.", "Try again in a moment."))
		return
	}

	send(r.linkScreen(found.Name, answer))
}

func remoteIP(conn net.Conn) string {
	if tcp, ok := conn.RemoteAddr().(*net.TCPAddr); ok {
		return tcp.IP.String()
	}

	return conn.RemoteAddr().String()
}
