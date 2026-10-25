package edge

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// makeCert is a self signed certificate for these names, valid for this long from now.
func makeCert(t *testing.T, cn string, names []string, life time.Duration) certEntry {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: cn},
		DNSNames:     names,
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(life),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}

	return certEntry{
		Name:        cn,
		Domains:     names,
		Certificate: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		Key:         string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})),
	}
}

func commonName(t *testing.T, cert *tls.Certificate) string {
	t.Helper()
	if cert == nil {
		t.Fatal("no certificate")
	}
	leaf, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatal(err)
	}

	return leaf.Subject.CommonName
}

func TestLookupFindsExactWildcardAndDefault(t *testing.T) {
	exact := makeCert(t, "exact", []string{"panel.example.com"}, time.Hour)
	wild := makeCert(t, "wild", []string{"*.example.org"}, time.Hour)
	other := makeCert(t, "default", []string{"other.test"}, time.Hour)
	other.Default = true

	s := newStore()
	if ok, skipped := s.set(certList{Certificates: []certEntry{exact, wild, other}}); ok != 3 || skipped != 0 {
		t.Fatalf("ok %d skipped %d", ok, skipped)
	}

	cases := map[string]string{
		"panel.example.com":  "exact",
		"PANEL.example.com.": "exact", // case and a trailing dot do not matter
		"a.example.org":      "wild",
		"deep.a.example.org": "default", // a wildcard covers one label only
		"example.org":        "default", // and not the bare domain
		"unknown.net":        "default",
		"":                   "default", // somebody who used the IP address
	}
	for name, want := range cases {
		if got := commonName(t, s.lookup(name)); got != want {
			t.Errorf("%q: got %s, want %s", name, got, want)
		}
	}
}

func TestWithoutADefaultAnUnknownNameGetsNoCertificate(t *testing.T) {
	s := newStore()
	s.set(certList{Certificates: []certEntry{makeCert(t, "only", []string{"a.test"}, time.Hour)}})

	if s.lookup("b.test") != nil || s.lookup("") != nil {
		t.Fatal("expected nothing")
	}
	if _, err := s.getCertificate(&tls.ClientHelloInfo{ServerName: "b.test"}); err == nil {
		t.Fatal("expected the handshake to be refused")
	}
}

func TestACertificateThatCanNotBeReadIsSkippedAndTheOthersWork(t *testing.T) {
	good := makeCert(t, "good", []string{"good.test"}, time.Hour)
	bad := makeCert(t, "bad", []string{"bad.test"}, time.Hour)
	bad.Key = "not a key"
	swapped := makeCert(t, "swapped", []string{"swapped.test"}, time.Hour)
	swapped.Key = makeCert(t, "other", []string{"x.test"}, time.Hour).Key // the key of another certificate

	s := newStore()
	ok, skipped := s.set(certList{Certificates: []certEntry{bad, good, swapped}})
	if ok != 1 || skipped != 2 {
		t.Fatalf("ok %d skipped %d", ok, skipped)
	}
	if commonName(t, s.lookup("good.test")) != "good" || s.lookup("bad.test") != nil || s.lookup("swapped.test") != nil {
		t.Fatal("wrong certificates in use")
	}
}

func TestOfTwoCertificatesForANameTheOneThatLastsLongerIsUsed(t *testing.T) {
	short := makeCert(t, "short", []string{"site.test"}, time.Hour)
	long := makeCert(t, "long", []string{"site.test"}, 48*time.Hour)

	for _, order := range [][]certEntry{{short, long}, {long, short}} {
		s := newStore()
		s.set(certList{Certificates: order})
		if got := commonName(t, s.lookup("site.test")); got != "long" {
			t.Fatalf("got %s", got)
		}
	}
}

func TestSetReplacesWhatWasThere(t *testing.T) {
	s := newStore()
	s.set(certList{ETag: "one", Certificates: []certEntry{makeCert(t, "old", []string{"old.test"}, time.Hour)}})
	s.set(certList{ETag: "two", Certificates: []certEntry{makeCert(t, "new", []string{"new.test"}, time.Hour)}})

	if s.lookup("old.test") != nil || s.lookup("new.test") == nil || s.tag() != "two" {
		t.Fatal("the old list was not replaced")
	}
}

func panelServer(t *testing.T, list certList, token string) (*httptest.Server, *int) {
	t.Helper()
	calls := 0

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/api/router/certificates" || r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.Header.Get("If-None-Match") == list.ETag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_ = json.NewEncoder(w).Encode(list)
	})), &calls
}

func TestFetchUsesTheTokenAndTheTag(t *testing.T) {
	list := certList{ETag: "abc", Certificates: []certEntry{makeCert(t, "a", []string{"a.test"}, time.Hour)}}
	panel, _ := panelServer(t, list, "secret")
	defer panel.Close()
	cfg := config{PanelURL: panel.URL, Token: "secret"}

	got, changed, err := fetch(context.Background(), panel.Client(), cfg, "")
	if err != nil || !changed || got.ETag != "abc" || len(got.Certificates) != 1 {
		t.Fatalf("first fetch: %+v %v %v", got, changed, err)
	}

	_, changed, err = fetch(context.Background(), panel.Client(), cfg, "abc")
	if err != nil || changed {
		t.Fatalf("with the tag: changed %v err %v", changed, err)
	}

	_, _, err = fetch(context.Background(), panel.Client(), config{PanelURL: panel.URL, Token: "wrong"}, "")
	if err == nil || !strings.Contains(err.Error(), "token") {
		t.Fatalf("a wrong token should say so, got %v", err)
	}
}

func TestFetchSaysWhenThePanelIsTooOldOrBroken(t *testing.T) {
	for status, want := range map[int]string{404: "updated", 500: "500"} {
		status := status
		panel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
		_, _, err := fetch(context.Background(), panel.Client(), config{PanelURL: panel.URL, Token: "x"}, "")
		panel.Close()
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("status %d: %v", status, err)
		}
	}

	panel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "not json") }))
	defer panel.Close()
	if _, _, err := fetch(context.Background(), panel.Client(), config{PanelURL: panel.URL, Token: "x"}, ""); err == nil {
		t.Error("an answer that is not json should be an error")
	}
}

func TestRefreshKeepsWhatWorksWhenThePanelFails(t *testing.T) {
	list := certList{ETag: "abc", Certificates: []certEntry{makeCert(t, "a", []string{"a.test"}, time.Hour)}}
	panel, _ := panelServer(t, list, "secret")
	state := filepath.Join(t.TempDir(), "state", "certificates.json")
	cfg := config{PanelURL: panel.URL, Token: "secret", State: state}
	s := newStore()

	refresh(context.Background(), panel.Client(), cfg, s)
	if s.lookup("a.test") == nil {
		t.Fatal("not loaded")
	}

	panel.Close() // the panel goes away
	refresh(context.Background(), &http.Client{Timeout: time.Second}, cfg, s)
	if s.lookup("a.test") == nil {
		t.Fatal("the certificates that were loaded must stay in use")
	}
}

func TestTheLastListIsRememberedPrivately(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "certificates.json")
	list := certList{ETag: "abc", Certificates: []certEntry{makeCert(t, "a", []string{"a.test"}, time.Hour)}}

	if err := remember(path, list); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("private keys are in this file, mode %v", info.Mode().Perm())
	}

	back, ok := recall(path)
	if !ok || back.ETag != "abc" || len(back.Certificates) != 1 {
		t.Fatalf("recall: %+v %v", back, ok)
	}
	if _, ok := recall(filepath.Join(t.TempDir(), "missing.json")); ok {
		t.Fatal("a missing file is not a list")
	}
	_ = os.WriteFile(path, []byte("garbage"), 0o600)
	if _, ok := recall(path); ok {
		t.Fatal("garbage is not a list")
	}
}

func TestProxyKeepsTheHostAndMakesTheForwardedHeaders(t *testing.T) {
	var seen http.Header
	var seenHost, seenBody string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, seenHost = r.Header.Clone(), r.Host
		body, _ := io.ReadAll(r.Body)
		seenBody = string(body)
		w.Header().Set("X-From-Backend", "yes")
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, "hello")
	}))
	defer backend.Close()

	handler, err := newProxy(backend.URL, 0)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "https://panel.example.com/api/x?y=1", strings.NewReader("payload"))
	req.RemoteAddr = "203.0.113.9:5555"
	req.TLS = &tls.ConnectionState{}
	// What a visitor could send to pretend to be somebody else.
	req.Header.Set("X-Forwarded-For", "10.0.0.1")
	req.Header.Set("X-Forwarded-Proto", "http")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated || rec.Body.String() != "hello" || rec.Header().Get("X-From-Backend") != "yes" {
		t.Fatalf("response: %d %q", rec.Code, rec.Body.String())
	}
	if seenHost != "panel.example.com" || seenBody != "payload" {
		t.Fatalf("host %q body %q", seenHost, seenBody)
	}
	if seen.Get("X-Forwarded-Proto") != "https" || seen.Get("X-Forwarded-Host") != "panel.example.com" {
		t.Fatalf("forwarded: %v", seen)
	}
	if seen.Get("X-Forwarded-For") != "203.0.113.9" {
		t.Fatalf("a visitor must not choose their own address, got %q", seen.Get("X-Forwarded-For"))
	}
}

func TestProxyAnswers502WhenThePanelIsDown(t *testing.T) {
	backend := httptest.NewServer(http.NotFoundHandler())
	url := backend.URL
	backend.Close()

	handler, _ := newProxy(url, 0)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("GET", "https://panel.example.com/", nil))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestHSTSIsOnlyAddedWhenAsked(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer backend.Close()

	for seconds, want := range map[int]string{0: "", 600: "max-age=600"} {
		handler, _ := newProxy(backend.URL, seconds)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest("GET", "https://panel.example.com/", nil))
		if got := rec.Header().Get("Strict-Transport-Security"); got != want {
			t.Errorf("%d: got %q", seconds, got)
		}
	}
}

func TestABadBackendAddressIsRefused(t *testing.T) {
	for _, address := range []string{"", "127.0.0.1:80", "://x"} {
		if _, err := newProxy(address, 0); err == nil {
			t.Errorf("%q should be refused", address)
		}
	}
}

// The whole thing: a TLS server that picks the certificate by the name the client asks for.
func TestTheTLSServerPresentsTheCertificateOfTheRequestedName(t *testing.T) {
	a := makeCert(t, "a", []string{"a.test"}, time.Hour)
	b := makeCert(t, "b", []string{"*.b.test"}, time.Hour)
	s := newStore()
	s.set(certList{Certificates: []certEntry{a, b}})

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, r.Host) }))
	defer backend.Close()
	handler, _ := newProxy(backend.URL, 0)

	server := httptest.NewUnstartedServer(handler)
	server.TLS = tlsConfig(s)
	server.StartTLS()
	defer server.Close()

	for name, want := range map[string]string{"a.test": "a", "x.b.test": "b"} {
		conn, err := tls.Dial("tcp", server.Listener.Addr().String(), &tls.Config{ServerName: name, InsecureSkipVerify: true})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if got := conn.ConnectionState().PeerCertificates[0].Subject.CommonName; got != want {
			t.Errorf("%s: got %s", name, got)
		}
		conn.Close()
	}

	// A name nothing covers (and there is no default) is refused during the handshake.
	conn, err := tls.Dial("tcp", server.Listener.Addr().String(), &tls.Config{ServerName: "nobody.test", InsecureSkipVerify: true})
	if err == nil {
		conn.Close()
		t.Fatal("expected the handshake to fail")
	}

	// And a request over that connection reaches the panel with the name the browser used.
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true, ServerName: "a.test"}}}
	req, _ := http.NewRequest("GET", server.URL, nil)
	req.Host = "a.test"
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if string(body) != "a.test" {
		t.Fatalf("the backend saw host %q", body)
	}
}

// ---- routing: the panel, the sites of servers, http and https --------------------------------------------------------------

func routing(t *testing.T, list certList, listen string) (*edge, *httptest.Server) {
	t.Helper()

	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "app host="+r.Host+" proto="+r.Header.Get("X-Forwarded-Proto")+" path="+r.URL.RequestURI())
	}))
	t.Cleanup(app.Close)
	for i := range list.Sites {
		if list.Sites[i].Target == "APP" {
			list.Sites[i].Target = strings.TrimPrefix(app.URL, "http://")
		}
	}

	s := newStore()
	s.set(list)
	panel := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "panel "+r.URL.RequestURI())
	})

	return newEdge(s, panel, listen), app
}

func ask(e *edge, method, url string, secure bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, nil)
	req.RemoteAddr = "203.0.113.9:4444"
	if secure {
		req.TLS = &tls.ConnectionState{}
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	return rec
}

func TestAHostThatHasACertificateIsSentToHTTPS(t *testing.T) {
	e, _ := routing(t, certList{Certificates: []certEntry{makeCert(t, "panel", []string{"panel.example.com", "*.apps.example.com"}, time.Hour)}}, ":443")

	rec := ask(e, "GET", "http://panel.example.com/admin/users?page=2", false)
	if rec.Code != 301 || rec.Header().Get("Location") != "https://panel.example.com/admin/users?page=2" {
		t.Fatalf("exact: %d %q", rec.Code, rec.Header().Get("Location"))
	}

	rec = ask(e, "GET", "http://shop.apps.example.com/", false)
	if rec.Code != 301 || rec.Header().Get("Location") != "https://shop.apps.example.com/" {
		t.Fatalf("wildcard: %d %q", rec.Code, rec.Header().Get("Location"))
	}

	if rec = ask(e, "HEAD", "http://panel.example.com/", false); rec.Code != 301 {
		t.Fatalf("head: %d", rec.Code)
	}
	// A request that sends something keeps its method, a 301 would turn a POST into a GET.
	if rec = ask(e, "POST", "http://panel.example.com/api/x", false); rec.Code != 308 {
		t.Fatalf("post: %d", rec.Code)
	}
}

func TestTheNameInTheRedirectIsTheOneThatWasChecked(t *testing.T) {
	e, _ := routing(t, certList{Certificates: []certEntry{makeCert(t, "panel", []string{"panel.example.com"}, time.Hour)}}, ":443")

	// The port of the visitor and the case do not change where they are sent, and nothing else of the request is used for it.
	rec := ask(e, "GET", "http://PANEL.example.com:80/x", false)
	if rec.Header().Get("Location") != "https://panel.example.com/x" {
		t.Fatalf("got %q", rec.Header().Get("Location"))
	}

	req := httptest.NewRequest("GET", "http://panel.example.com/x", nil)
	req.Header.Set("X-Forwarded-Host", "evil.example")
	req.Header.Set("X-Forwarded-Proto", "https")
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Header().Get("Location") != "https://panel.example.com/x" {
		t.Fatalf("headers of the visitor changed the redirect: %q", rec.Header().Get("Location"))
	}
}

func TestAnotherHTTPSPortIsPartOfTheRedirect(t *testing.T) {
	e, _ := routing(t, certList{Certificates: []certEntry{makeCert(t, "panel", []string{"panel.example.com"}, time.Hour)}}, "0.0.0.0:8443")

	if got := ask(e, "GET", "http://panel.example.com/", false).Header().Get("Location"); got != "https://panel.example.com:8443/" {
		t.Fatalf("got %q", got)
	}
}

func TestAHostWithoutACertificateIsNotRedirectedAndGoesToThePanel(t *testing.T) {
	e, _ := routing(t, certList{Certificates: []certEntry{makeCert(t, "panel", []string{"panel.example.com"}, time.Hour)}}, ":443")

	for _, host := range []string{"http://other.example.com/x", "http://10.43.28.128/x", "http://127.0.0.1/x"} {
		rec := ask(e, "GET", host, false)
		if rec.Code != 200 || rec.Body.String() != "panel /x" {
			t.Errorf("%s: %d %q", host, rec.Code, rec.Body.String())
		}
	}
}

func TestADefaultCertificateDoesNotSendEveryNameToHTTPS(t *testing.T) {
	fallback := makeCert(t, "fallback", []string{"fallback.example.com"}, time.Hour)
	fallback.Default = true
	e, _ := routing(t, certList{Certificates: []certEntry{fallback}}, ":443")

	if rec := ask(e, "GET", "http://unknown.example.net/", false); rec.Code != 200 {
		t.Fatalf("got %d: a name nothing covers must keep working over http", rec.Code)
	}
}

func TestLetsEncryptIsAlwaysAnsweredByThePanelOverHTTP(t *testing.T) {
	e, _ := routing(t, certList{
		Certificates: []certEntry{makeCert(t, "panel", []string{"panel.example.com", "app.example.com"}, time.Hour)},
		Sites:        []site{{Domain: "app.example.com", Target: "APP"}},
	}, ":443")

	// Even for a name that has a certificate (a renewal) and for a site that would otherwise go to its server.
	for _, host := range []string{"panel.example.com", "app.example.com", "new.example.com"} {
		rec := ask(e, "GET", "http://"+host+"/.well-known/acme-challenge/token123", false)
		if rec.Code != 200 || rec.Body.String() != "panel /.well-known/acme-challenge/token123" {
			t.Errorf("%s: %d %q", host, rec.Code, rec.Body.String())
		}
	}
	// Over https it is an ordinary path.
	if rec := ask(e, "GET", "https://app.example.com/.well-known/acme-challenge/x", true); !strings.HasPrefix(rec.Body.String(), "app ") {
		t.Fatalf("over https: %q", rec.Body.String())
	}
}

func TestADomainOfAServerIsSentToItsAllocation(t *testing.T) {
	e, _ := routing(t, certList{
		Certificates: []certEntry{makeCert(t, "wild", []string{"*.example.com"}, time.Hour)},
		Sites:        []site{{Domain: "App.Example.com", Target: "APP"}},
	}, ":443")

	rec := ask(e, "GET", "https://app.example.com:443/page?x=1", true)
	if rec.Code != 200 || rec.Body.String() != "app host=app.example.com:443 proto=https path=/page?x=1" {
		t.Fatalf("https: %d %q", rec.Code, rec.Body.String())
	}
	// The panel is still the panel.
	if rec = ask(e, "GET", "https://panel.example.com/x", true); rec.Body.String() != "panel /x" {
		t.Fatalf("panel: %q", rec.Body.String())
	}
}

func TestASiteWithoutACertificateIsServedOverHTTPAndRedirectedOnceItHasOne(t *testing.T) {
	list := certList{Sites: []site{{Domain: "app.example.com", Target: "APP"}}}
	e, _ := routing(t, list, ":443")

	rec := ask(e, "GET", "http://app.example.com/hello", false)
	if rec.Code != 200 || rec.Body.String() != "app host=app.example.com proto=http path=/hello" {
		t.Fatalf("before: %d %q", rec.Code, rec.Body.String())
	}

	// The certificate arrives, a refresh later the same request is sent to https.
	e.store.set(certList{Certificates: []certEntry{makeCert(t, "app", []string{"app.example.com"}, time.Hour)}, Sites: list.Sites})
	rec = ask(e, "GET", "http://app.example.com/hello", false)
	if rec.Code != 301 || rec.Header().Get("Location") != "https://app.example.com/hello" {
		t.Fatalf("after: %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestASiteWhoseServerCanNotBeReachedSaysSo(t *testing.T) {
	e, _ := routing(t, certList{Sites: []site{{Domain: "app.example.com", Target: "APP", Status: "suspended"}}}, ":443")

	rec := ask(e, "GET", "http://app.example.com/", false)
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "suspended") {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
}

func TestASiteThatDoesNotAnswerIsABadGatewayNotACrash(t *testing.T) {
	e, _ := routing(t, certList{Sites: []site{{Domain: "app.example.com", Target: "127.0.0.1:1"}}}, ":443")

	if rec := ask(e, "GET", "http://app.example.com/", false); rec.Code != http.StatusBadGateway {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestASiteWithABrokenTargetIsABadGateway(t *testing.T) {
	for _, target := range []string{"://nonsense", "%%%"} {
		e, _ := routing(t, certList{Sites: []site{{Domain: "app.example.com", Target: target}}}, ":443")
		if rec := ask(e, "GET", "http://app.example.com/", false); rec.Code != http.StatusBadGateway {
			t.Errorf("%q: got %d", target, rec.Code)
		}
	}
}

func TestSitesWithoutATargetOrNameAreIgnored(t *testing.T) {
	s := newStore()
	s.set(certList{Sites: []site{{Domain: "", Target: "x:1"}, {Domain: "a.example.com", Target: ""}, {Domain: "b.example.com", Target: "x:1"}}})

	if _, ok := s.siteFor("a.example.com"); ok {
		t.Error("a site without a target is not a site")
	}
	if _, ok := s.siteFor("B.example.com."); !ok {
		t.Error("b.example.com is")
	}
}

func TestTheEdgeSaysItAnswersOnPortEightyOnlyWhenItDoes(t *testing.T) {
	var features []string
	panel := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		features = append(features, r.Header.Get("X-Edge-Features"))
		_ = json.NewEncoder(w).Encode(certList{ETag: "x"})
	}))
	defer panel.Close()

	_, _, _ = fetch(context.Background(), panel.Client(), config{PanelURL: panel.URL, Token: "t"}, "")
	_, _, _ = fetch(context.Background(), panel.Client(), config{PanelURL: panel.URL, Token: "t", HTTPListen: ":80"}, "")

	if len(features) != 2 || features[0] != "" || features[1] != "http" {
		t.Fatalf("features sent: %q", features)
	}
}

func TestHostParsing(t *testing.T) {
	for host, want := range map[string]string{
		"Panel.Example.com":      "panel.example.com",
		"panel.example.com:8080": "panel.example.com",
		"panel.example.com.":     "panel.example.com",
		"[::1]:80":               "::1",
		"10.0.0.5":               "10.0.0.5",
	} {
		req := httptest.NewRequest("GET", "/", nil)
		req.Host = host
		if got := hostOf(req); got != want {
			t.Errorf("%q: got %q, want %q", host, got, want)
		}
	}
}

// A real http listener next to a real https one, the way the program runs them.
func TestBothListenersTogether(t *testing.T) {
	app := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "site") }))
	defer app.Close()
	entry := makeCert(t, "app", []string{"127.0.0.1", "app.test"}, time.Hour)
	s := newStore()
	s.set(certList{Certificates: []certEntry{entry}, Sites: []site{{Domain: "app.test", Target: strings.TrimPrefix(app.URL, "http://")}}})
	panelHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "panel") })

	plain := httptest.NewServer(newEdge(s, panelHandler, ":443"))
	defer plain.Close()
	secure := httptest.NewUnstartedServer(newEdge(s, panelHandler, ":443"))
	secure.TLS = tlsConfig(s)
	secure.StartTLS()
	defer secure.Close()

	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	req, _ := http.NewRequest("GET", plain.URL+"/page", nil)
	req.Host = "app.test"
	res, err := noFollow.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 301 || res.Header.Get("Location") != "https://app.test/page" {
		t.Fatalf("http: %d %q", res.StatusCode, res.Header.Get("Location"))
	}

	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true, ServerName: "app.test"}}}
	req, _ = http.NewRequest("GET", secure.URL+"/page", nil)
	req.Host = "app.test"
	res, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if string(body) != "site" {
		t.Fatalf("https: %q", body)
	}
}
