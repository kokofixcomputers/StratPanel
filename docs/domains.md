# Domains for servers

People can get a domain for their server in two ways, and an admin can have either or both on (Admin > Settings > Domains).

**1. Their own domain.** They add an A record at their own DNS provider that points at the panel machine (the Minecraft router, `PTERODACTYL_DOMAINS_TARGET_IP`,
or the panel's own address when that is empty), then add the domain on the Domains page of the server. The panel checks the record. A switch in the settings turns this
on and off (the default is `PTERODACTYL_DOMAINS_ENABLED`).

**2. A name under a domain of the admin.** The admin adds one or more domains (`example.com`, `mc-hosting.net`, ...), each with its own DNS access. On the Domains page the
person types a name (`play`) and picks one of those domains from a list; the panel checks the name is free, makes the A record at the provider, and removes the record
again when the name (or the server, or the whole domain) is removed. After that it is a normal domain: the router sends players to the server, and https works as
for any other (`docs/certificates.md`).

Names the panel keeps for itself cannot be taken (`www`, `mail`, `admin`, `api`, ... see `PTERODACTYL_DOMAINS_RESERVED`), nor a name that already has a DNS record of any
kind at the provider (a record somebody made by hand is never taken over), nor the host of the panel. A name is one label: letters, numbers and dashes, up to 63.

## Setting up a domain (Cloudflare)

1. Create an API token at dash.cloudflare.com > My Profile > API Tokens with the template **Edit zone DNS**, limited to the domain.
2. Admin > Settings > Domains > Add a domain: the domain, the token (the zone id is found by itself).
3. The access is checked when you save (and with "Test the access"). A domain that does not work is switched off, so people never see it.

Several domains can be added, each with its own token. The records are made **without** the Cloudflare proxy (Minecraft is not web traffic). The token is kept
encrypted and is never shown again or sent to the browser.

Another DNS provider is one class that implements `App\Services\Dns\DnsProvider` (verify, check a name, add and remove an A record) and an entry in
`App\Services\Dns\DnsProviders`; the settings form is built from that entry. Only Cloudflare is built, and it was tested against a fake of its API, not the real one.

## Good to know

* Removing a name removes its DNS record; if the provider cannot be reached the name goes anyway and the record is logged as left behind.
* Deleting a domain of the admin removes every name under it (and their records). Deleting a server removes its names the same way.
* Role permissions: `settings.domains.view` and `settings.domains.update`.
* API (client): `GET /api/client/servers/{server}/domains` (`meta.zones`), `POST` with `zone_id` and `label` (or `domain`), `GET .../domains/check?zone_id=&label=`.
