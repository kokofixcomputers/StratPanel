// Package edge serves the panel over HTTPS with the certificates that were added in the panel (Admin > Settings > Certificates).
//
// PHP can not terminate TLS by itself, the web server does. This small program is that: it listens on the HTTPS port, picks the
// certificate that belongs to the domain the browser asked for (SNI, wildcards included), and passes the request on to the web server
// that runs the panel (nginx on port 80 for example), with the X-Forwarded-* headers that tell the panel the visitor used https.
// The certificates are fetched from the panel with a secret that is only for this, and are checked again every minute, so a
// certificate that is added, replaced or removed in the panel is in use within a minute and nothing has to be restarted.
package edge

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// What the panel sends for each certificate.
type certEntry struct {
	Name        string   `json:"name"`
	Domains     []string `json:"domains"`
	Certificate string   `json:"certificate"`
	Key         string   `json:"key"`
	Default     bool     `json:"default"`
	Fingerprint string   `json:"fingerprint"`
}

// A domain of a server that is served over the web: its requests go to the allocation.
type site struct {
	Domain string `json:"domain"`
	Target string `json:"target"`
	// Set by the panel when the server can not be reached at all ("suspended", "installing").
	Status string `json:"status"`
}

type certList struct {
	ETag         string      `json:"etag"`
	Certificates []certEntry `json:"certificates"`
	Sites        []site      `json:"sites"`
}

type loaded struct {
	cert     *tls.Certificate
	notAfter time.Time
}

// store holds the certificates in use and finds the one for a name.
type store struct {
	mu    sync.RWMutex
	exact map[string]loaded
	// "*.example.com" is kept as ".example.com": it covers one label in front of it, like the certificate does.
	wild map[string]loaded
	def  *tls.Certificate
	etag string
	// The domains that are served over the web, by name.
	sites map[string]site
}

func newStore() *store {
	return &store{exact: map[string]loaded{}, wild: map[string]loaded{}, sites: map[string]site{}}
}

func clean(domain string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(domain)), ".")
}

// set replaces everything with the list from the panel. Certificates that can not be read are skipped (and said), one bad one must not
// take the others away. Of two certificates for the same name the one that lasts longer is used.
func (s *store) set(list certList) (ok int, skipped int) {
	exact := map[string]loaded{}
	wild := map[string]loaded{}
	var def *tls.Certificate
	var defExpiry time.Time

	for _, entry := range list.Certificates {
		pair, err := tls.X509KeyPair([]byte(entry.Certificate), []byte(entry.Key))
		if err != nil {
			log.Printf("certificate %q skipped: %v", entry.Name, err)
			skipped++
			continue
		}
		leaf, err := x509.ParseCertificate(pair.Certificate[0])
		if err != nil {
			log.Printf("certificate %q skipped: %v", entry.Name, err)
			skipped++
			continue
		}
		pair.Leaf = leaf
		item := loaded{cert: &pair, notAfter: leaf.NotAfter}

		for _, domain := range entry.Domains {
			name := clean(domain)
			target := exact
			if strings.HasPrefix(name, "*.") {
				name = name[1:]
				target = wild
			}
			if name == "" {
				continue
			}
			if current, found := target[name]; !found || item.notAfter.After(current.notAfter) {
				target[name] = item
			}
		}
		if entry.Default && (def == nil || item.notAfter.After(defExpiry)) {
			def, defExpiry = &pair, item.notAfter
		}
		ok++
	}

	sites := map[string]site{}
	for _, entry := range list.Sites {
		if name := clean(entry.Domain); name != "" && entry.Target != "" {
			sites[name] = entry
		}
	}

	s.mu.Lock()
	s.exact, s.wild, s.def, s.etag, s.sites = exact, wild, def, list.ETag, sites
	s.mu.Unlock()

	return ok, skipped
}

func (s *store) tag() string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.etag
}

func (s *store) count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return len(s.exact) + len(s.wild)
}

// lookup is the certificate for a name: exactly that name, a wildcard that covers it, or the default certificate (which is also
// what a visitor who used the IP address, with no name, gets).
func (s *store) lookup(name string) *tls.Certificate {
	name = clean(name)

	s.mu.RLock()
	defer s.mu.RUnlock()

	if name != "" {
		if item, ok := s.exact[name]; ok {
			return item.cert
		}
		if dot := strings.Index(name, "."); dot > 0 {
			if item, ok := s.wild[name[dot:]]; ok {
				return item.cert
			}
		}
	}

	return s.def
}

// hasCertificate says whether a certificate was added for this name (the default one that is given to everybody does not count): the
// question behind "can this name be sent to https".
func (s *store) hasCertificate(name string) bool {
	name = clean(name)
	if name == "" {
		return false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	if _, ok := s.exact[name]; ok {
		return true
	}
	if dot := strings.Index(name, "."); dot > 0 {
		_, ok := s.wild[name[dot:]]

		return ok
	}

	return false
}

// siteFor is the domain of a server that is served over the web, when the name is one.
func (s *store) siteFor(name string) (site, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	found, ok := s.sites[clean(name)]

	return found, ok
}

// getCertificate is what the TLS server asks for every handshake.
func (s *store) getCertificate(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	if cert := s.lookup(hello.ServerName); cert != nil {
		return cert, nil
	}

	return nil, errors.New("no certificate for " + hello.ServerName)
}

type config struct {
	PanelURL string
	Token    string
	Listen   string
	Backend  string
	Refresh  time.Duration
	State    string
	HSTS     int
	// The port that http is served on (to send people to https and to answer Let's Encrypt). Empty: only https is served.
	HTTPListen string
}

// Getenv is where the settings are read from, see the router's.
var Getenv = os.Getenv

func env(name, fallback string) string {
	if value := strings.TrimSpace(Getenv(name)); value != "" {
		return value
	}

	return fallback
}

func loadConfig() (config, error) {
	cfg := config{
		PanelURL: strings.TrimRight(env("PANEL_URL", ""), "/"),
		Token:    env("EDGE_TOKEN", ""),
		Listen:   env("LISTEN", ":443"),
		Backend:  env("BACKEND", "http://127.0.0.1:80"),
		State:    env("STATE_FILE", "/var/lib/stratosphere-net/certificates.json"),

		HTTPListen: env("HTTP_LISTEN", ""),
	}
	if cfg.PanelURL == "" || cfg.Token == "" {
		return cfg, errors.New("PANEL_URL and EDGE_TOKEN are required")
	}

	refresh, err := time.ParseDuration(env("REFRESH", "60s"))
	if err != nil || refresh < 10*time.Second {
		refresh = 60 * time.Second
	}
	cfg.Refresh = refresh

	if seconds := env("HSTS_SECONDS", "0"); seconds != "0" {
		fmt.Sscanf(seconds, "%d", &cfg.HSTS)
	}

	return cfg, nil
}

// fetch asks the panel for the certificates. changed is false when the panel says nothing is different (304).
func fetch(ctx context.Context, client *http.Client, cfg config, etag string) (list certList, changed bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.PanelURL+"/api/router/certificates", nil)
	if err != nil {
		return list, false, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Accept", "application/json")
	// What this edge can do, the panel shows buttons (a free certificate needs port 80) for what works.
	if cfg.HTTPListen != "" {
		req.Header.Set("X-Edge-Features", "http")
	}
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	res, err := client.Do(req)
	if err != nil {
		return list, false, err
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusNotModified:
		return list, false, nil
	case http.StatusOK:
	case http.StatusUnauthorized:
		return list, false, errors.New("the panel refused the token (EDGE_TOKEN does not match PTERODACTYL_CERTIFICATES_TOKEN)")
	case http.StatusNotFound:
		return list, false, errors.New("the panel does not know about certificates (is it updated?)")
	default:
		return list, false, fmt.Errorf("the panel answered with status %d", res.StatusCode)
	}

	if err := json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(&list); err != nil {
		return list, false, fmt.Errorf("the answer of the panel could not be read: %w", err)
	}

	return list, true, nil
}

// remember keeps the last good list on disk, so the edge can serve https again after a restart while the panel is down.
func remember(path string, list certList) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(list)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}

	return os.Rename(tmp, path)
}

func recall(path string) (certList, bool) {
	var list certList
	data, err := os.ReadFile(path)
	if err != nil || json.Unmarshal(data, &list) != nil {
		return list, false
	}

	return list, true
}

func refresh(ctx context.Context, client *http.Client, cfg config, s *store) {
	callCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	list, changed, err := fetch(callCtx, client, cfg, s.tag())
	if err != nil {
		log.Printf("could not refresh certificates: %v", err)
		return
	}
	if !changed {
		return
	}

	ok, skipped := s.set(list)
	log.Printf("certificates loaded: %d in use, %d skipped, covering %d name(s)", ok, skipped, s.count())
	if err := remember(cfg.State, list); err != nil {
		log.Printf("could not remember the certificates: %v", err)
	}
}

// newProxy passes requests to the web server of the panel. The browser's Host is kept, and the X-Forwarded headers are made here:
// whatever the visitor sent in them is dropped, they could lie about their address or about using https.
func newProxy(backend string, hstsSeconds int) (http.Handler, error) {
	target, err := url.Parse(backend)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("BACKEND %q is not an address like http://127.0.0.1:80", backend)
	}

	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.Host = r.In.Host
			r.SetXForwarded()
		},
		// Console websockets and downloads must not wait for a buffer to fill.
		FlushInterval: -1,
		ModifyResponse: func(res *http.Response) error {
			if hstsSeconds > 0 {
				res.Header.Set("Strict-Transport-Security", fmt.Sprintf("max-age=%d", hstsSeconds))
			}

			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("%s %s: %v", r.Host, r.URL.Path, err)
			http.Error(w, "The panel is not answering.", http.StatusBadGateway)
		},
	}, nil
}

func tlsConfig(s *store) *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: s.getCertificate}
}

// Enabled says whether the edge has what it needs to run: the panel and its secret.
func Enabled() bool {
	_, err := loadConfig()

	return err == nil
}

// Run is the edge: it listens until the context ends. An error is a reason it could not start or that it stopped.
func Run(ctx context.Context) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	handler, err := newProxy(cfg.Backend, cfg.HSTS)
	if err != nil {
		return err
	}

	s := newStore()
	if list, ok := recall(cfg.State); ok {
		ok, skipped := s.set(list)
		log.Printf("certificates from the last run: %d in use, %d skipped", ok, skipped)
		// The first refresh must not be told "nothing changed" by an old tag, it asks again with what the panel has.
		s.etag = ""
	}

	client := &http.Client{Timeout: 20 * time.Second}
	refresh(ctx, client, cfg, s)
	go func() {
		ticker := time.NewTicker(cfg.Refresh)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				refresh(ctx, client, cfg, s)
			}
		}
	}()

	routes := newEdge(s, handler, cfg.Listen)
	if cfg.HTTPListen != "" {
		plain := &http.Server{
			Addr:              cfg.HTTPListen,
			Handler:           routes,
			ReadHeaderTimeout: 10 * time.Second,
			IdleTimeout:       120 * time.Second,
			ErrorLog:          log.New(io.Discard, "", 0),
		}
		go func() {
			<-ctx.Done()
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = plain.Shutdown(shutdown)
		}()
		go func() {
			log.Printf("edge listening on %s for http (redirects to https where there is a certificate)", cfg.HTTPListen)
			if err := plain.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Printf("http on %s stopped: %v", cfg.HTTPListen, err)
			}
		}()
	}

	server := &http.Server{
		Addr:              cfg.Listen,
		Handler:           routes,
		TLSConfig:         tlsConfig(s),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		ErrorLog:          log.New(io.Discard, "", 0),
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()

	log.Printf("edge listening on %s, passing requests to %s", cfg.Listen, cfg.Backend)
	if err := server.ListenAndServeTLS("", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}

// edge decides where a request goes: the domain of a server that is served over the web goes to its allocation, everything else to the
// panel. On http it also answers Let's Encrypt (that is the panel's job, it is passed on) and sends a name that has a certificate to https.
type edge struct {
	store     *store
	panel     http.Handler
	httpsPort string

	mu    sync.Mutex
	sites map[string]http.Handler
}

func newEdge(s *store, panel http.Handler, listen string) *edge {
	port := "443"
	if _, p, err := net.SplitHostPort(listen); err == nil && p != "" {
		port = p
	}

	return &edge{store: s, panel: panel, httpsPort: port, sites: map[string]http.Handler{}}
}

// hostOf is the name a request was made for, without the port.
func hostOf(r *http.Request) string {
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}

	return clean(strings.Trim(host, "[]"))
}

func (e *edge) site(target string) (http.Handler, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if handler, ok := e.sites[target]; ok {
		return handler, nil
	}
	handler, err := newSiteProxy(target)
	if err != nil {
		return nil, err
	}
	e.sites[target] = handler

	return handler, nil
}

const acmePrefix = "/.well-known/acme-challenge/"

func (e *edge) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host := hostOf(r)

	if r.TLS == nil {
		// Let's Encrypt asks any domain for this, the panel knows the answers.
		if strings.HasPrefix(r.URL.Path, acmePrefix) {
			e.panel.ServeHTTP(w, r)
			return
		}
		if e.store.hasCertificate(host) {
			e.redirect(w, r, host)
			return
		}
	}

	if found, ok := e.store.siteFor(host); ok {
		if found.Status != "" {
			http.Error(w, "This server is not available right now ("+found.Status+").", http.StatusServiceUnavailable)
			return
		}
		handler, err := e.site(found.Target)
		if err != nil {
			http.Error(w, "This site is not set up right.", http.StatusBadGateway)
			return
		}
		handler.ServeHTTP(w, r)
		return
	}

	e.panel.ServeHTTP(w, r)
}

// redirect sends the visitor to the same page over https. A request that is not a plain page view keeps its method (308).
func (e *edge) redirect(w http.ResponseWriter, r *http.Request, host string) {
	target := "https://" + host
	if e.httpsPort != "443" {
		target += ":" + e.httpsPort
	}
	if strings.Contains(host, ":") {
		target = "https://[" + host + "]"
		if e.httpsPort != "443" {
			target += ":" + e.httpsPort
		}
	}
	target += r.URL.RequestURI()

	status := http.StatusMovedPermanently
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		status = http.StatusPermanentRedirect
	}
	http.Redirect(w, r, target, status)
}

// newSiteProxy passes requests to the allocation of a server, the browser's Host stays.
func newSiteProxy(target string) (http.Handler, error) {
	address, err := url.Parse("http://" + target)
	if err != nil || address.Host == "" || address.Hostname() == "" {
		return nil, fmt.Errorf("%q is not an address like 10.0.0.5:3000", target)
	}

	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(address)
			r.Out.Host = r.In.Host
			r.SetXForwarded()
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("%s -> %s: %v", r.Host, target, err)
			http.Error(w, "The server is not answering.", http.StatusBadGateway)
		},
	}, nil
}
