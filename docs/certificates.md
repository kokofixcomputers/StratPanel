# Certificates (https for the panel)

Admin > Settings > **Certificates**: add the certificate and private key of your domain and the panel is served over https with it.

1. Run `sudo bash tools/stratnet/install.sh edge` once on the machine of the panel. It installs [the edge](../tools/stratnet/edge/README.md),
   the program that listens on port 443 (a web server does TLS, PHP can not).
2. Add a certificate: paste it (your certificate first, then the intermediates, like `fullchain.pem`) and the private key, or choose the
   files. A key with a passphrase works if you give the passphrase (it is stored without one). The panel checks that the key belongs to the
   certificate, that the chain is in order and that it has not expired, and reads which names it covers.
3. Within a minute `https://your-domain` works. The page says whether the edge is connected.

- Wildcards (`*.example.com`) work for one label. More than one certificate can be added, the right one is chosen by name. The **default**
  certificate is used for names none covers and for the IP address; the first one added is the default.
- **Renewing:** open the certificate, add the new certificate and key under *Renew*. It keeps its name and settings.
  Certificates ending within 14 days are marked, expired ones are marked too (and still served, so visitors see the real reason).
- Private keys are stored encrypted in the panel's database, are never shown again, and leave the panel only to the edge, with a secret of
  its own (`PTERODACTYL_CERTIFICATES_TOKEN`). Roles: `settings.certificates.view` / `settings.certificates.update`.
- The panel has to know it is behind a proxy (`TRUSTED_PROXIES=127.0.0.1`, the installer sets it), otherwise it makes http links.
- Certificates from Let's Encrypt end after 90 days: this does not renew them for you, add the renewed one (a script could post it to the
  admin page; automatic renewal is not built in).

## Certificates for the nodes (Wings)

Browsers talk to a node (Wings) directly for the console and for uploads and downloads, so the node needs a trusted https certificate
for its own name too. With the **Stratosphere fork of Wings** the panel gives it one: no certbot, no files, no restart.

1. Install the fork in place of Wings (same config and service, see `FORK.md` in the Wings fork) and restart it once.
2. Add a certificate that covers the node's name (a wildcard like `*.example.com` is the easy way), under *Settings > Certificates*.
3. Open the node, the **Certificate** tab. Choose the certificate (or "the one that covers this node", which follows renewals) and press
   **Enable https on this node**. The panel gives it the certificate, checks that it can reach the node over https with it, and then
   switches the node to https and tells it.
4. When a certificate is renewed or replaced in the panel it is given to every node that uses it within the hour (`p:node:sync-certificates`).

**The first time** the node has no certificate the panel could verify, so the key is given without checking who answers (or over http,
if that is how the node is reached). The panel asks you to confirm that, because it means the key goes to whatever answers at that name:
fine on a network you trust, not when you are unsure the name is yours. After that every push is verified, and nothing is ever given to
a node in the background that could not prove who it is. Roles: `nodes.certificate`.

## Port 80: redirects to https

The edge can also answer on port 80 (`HTTP_LISTEN=:80`). A request for a name that has a certificate is sent to https; names without one are
passed on as before, so nothing that works over http today stops working. `sudo bash tools/stratnet/install.sh edge` offers to move nginx to
`127.0.0.1:8081` for this (backup, `nginx -t`, put back on failure); run it again to switch it on later.

## Free certificates for the domains of servers (Let's Encrypt)

For domains that are not for a Minecraft server: a website, a map viewer, any service on an allocation of a server. Needs port 80 answered by
The edge (above).

1. Admin > Settings > Certificates > **Let's Encrypt**: turn it on and agree to the Subscriber Agreement (the email address is optional, test
   mode uses the staging authority).
2. A server's **Domains** tab: every domain is served as a website too, press **Get a free certificate**.
3. The panel checks the domain points at the panel (its A record), answers the challenge of Let's Encrypt over port 80, adds the certificate
   under Settings > Certificates and links it to the domain. A domain that an uploaded certificate (a wildcard) already covers needs none.
4. From then on `http://domain` goes to `https://domain`, and https is served to the allocation of the server. Certificates are renewed twice
   a day from 30 days before they end (`p:certificates:renew`); a domain that is not served any more is left to end.

A domain served as a website is passed on, by name, to the allocation on port 80 and 443; all other names (and the panel) work as before.
Roles that may change the Let's Encrypt settings: `settings.certificates.update`; the button needs `allocation.update` on the server.
Let's Encrypt limits how many certificates a domain can get per week, the panel refuses requests that can not work (no DNS, port 80 not
answered) before asking, so mistakes do not use them up.

## Free certificates with a DNS record (private addresses)

The button above proves the domain over port 80, so the domain has to point at a public address that reaches this panel. For a domain on a
private address (10.x, 192.168.x), behind a firewall, or with a provider the panel has no access to, use **Get one with a DNS record** on the
domain instead:

1. Press the button. The domain shows a TXT record to add: its name (`_acme-challenge.<domain>`) and value.
2. Add that record at your DNS provider. The panel looks it up with a public resolver every 10 seconds, for up to 15 minutes (the job holds a
   queue worker meanwhile), and asks Let's Encrypt as soon as it can see it. The record can be removed afterwards.
3. The certificate is added under Certificates and used by the edge within a minute, like the others.

Nothing is renewed by itself this way (the panel can not add the record): the domain shows **Renew with a DNS record** from 30 days before
the end, and the new certificate replaces the old one. The other kind keeps renewing itself. Wildcards are not offered.

