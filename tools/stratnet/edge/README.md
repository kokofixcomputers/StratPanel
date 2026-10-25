# The edge (part of stratosphere-net)

One of the two parts of `stratosphere-net`, the program in `tools/stratnet` (the other one is [the router](../router/README.md)). They share one binary, one service (`stratosphere-net`) and one settings file (`/etc/stratosphere-net.env`); `ENABLE_EDGE` switches this part on or off, and its settings there start with `EDGE_` (`EDGE_TOKEN`, `EDGE_LISTEN`, `EDGE_REFRESH`, `EDGE_PANEL_URL`).

Serves the panel over HTTPS with the certificates that were added in the panel (**Admin > Settings > Certificates**).

PHP can not do TLS by itself, the web server does. the edge is a small program that sits in front of the web server of the panel:

```
browser --https--> the edge :443 --http--> nginx / Apache :80 --> panel
```

- It picks the certificate by the name the browser asks for (SNI): an exact name, a wildcard (`*.example.com` covers one label), or the
  **default** certificate (also for somebody who used the IP address). A name that nothing covers, with no default, is refused.
- It asks the panel for the certificates every minute (and only gets the keys again when something changed), so adding, replacing or
  deleting a certificate in the panel takes effect within a minute, nothing is restarted. The last good set is kept on disk
  (`/var/lib/stratosphere-net`, readable by the service only), so https works after a restart while the panel is down.
- It passes the request on with the original `Host` and fresh `X-Forwarded-For/Host/Proto` headers (what a visitor sent in them is
  dropped), streams responses (console websockets, downloads), and speaks HTTP/2 to browsers.

## Install

```bash
sudo bash tools/stratnet/install.sh edge
```

It installs the program and a systemd service, creates the secret (`PTERODACTYL_CERTIFICATES_TOKEN` in the panel's `.env`, `EDGE_TOKEN` in
`/etc/stratosphere-net.env`; it is **not** the secret of the Minecraft router, because it gives out private keys), sets `TRUSTED_PROXIES` so the
panel knows requests came over https, runs the migration and starts it. Then add a certificate in the panel.

Port 443 has to be free: a web server that already does https there must stop listening on it, or `EDGE_LISTEN=:8443` is set and port 443 is sent
to it some other way. The web server of the panel keeps serving http on port 80 (`BACKEND`); making port 80 redirect to https is done there
(`return 301 https://$host$request_uri;` in nginx), or the panel stays reachable over both.

Settings in `/etc/stratosphere-net.env`: `EDGE_PANEL_URL` (or `PANEL_URL`; where to ask for certificates, use `http://127.0.0.1` on the same machine or an https
address, never plain http over a network: the answer holds private keys), `EDGE_TOKEN`, `EDGE_LISTEN` (`:443`), `BACKEND` (`http://127.0.0.1:80`),
`EDGE_REFRESH` (`60s`), `HSTS_SECONDS` (`0`, adds `Strict-Transport-Security` once you are sure https works everywhere).

Build it yourself with `go build`, run the tests with `go test ./...`. Logs: `journalctl -u stratosphere-net -f`.

## Port 80, and the domains of servers

- **http to https.** With `HTTP_LISTEN=:80` the edge also answers on port 80: a name that has a certificate is sent to https
  (`301`, `308` for requests that send something), anything else is passed on as before. The installer moves nginx to `127.0.0.1:8081`
  for you when you say yes (it backs the file up, tests nginx and puts it back if the test fails), and keeps the old setup otherwise.
- **Websites on servers.** A domain of a server (the Domains tab) that is switched to *Serve as a website* is passed on to its allocation,
  by the name in the request, on port 80 and 443. Everything else, including every name that is not a domain of a server, goes to the panel.
- **Free certificates.** With Let's Encrypt turned on under Settings > Certificates, the Domains tab gets a button that gets a certificate
  for the domain. Let's Encrypt asks `http://<domain>/.well-known/acme-challenge/<token>` on port 80, which the edge always passes to the
  panel (it holds the answer), and the panel adds and renews the certificate.
