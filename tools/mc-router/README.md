# mc-router

Custom domains for Minecraft servers on your panel. A player types `play.example.com` (default port), the router
reads the address from the first packet of the connection and forwards the player to the matching server allocation.
The domain owner only needs an **A record** pointing at the machine this runs on.

```
player ── play.example.com:25565 ──▶ mc-router ──▶ node-ip:allocation-port (the server)
```

## Quick install (recommended)

On the machine that runs the panel (and that the A records will point to):

```bash
cd /var/www/pterodactyl
sudo php artisan p:router:install
```

(`sudo bash tools/mc-router/install.sh` does exactly the same thing.) That's all. It installs the right binary for your CPU, creates the secret shared with the panel, runs the database
migration, starts the service and opens the port in ufw. After that, users add an A record pointing at the machine and
add the domain in a server's **Domains** tab.

## Manual install (if you prefer, or the router runs on another machine)

1. In the panel's `.env` set a secret and clear the cache:

   ```
   PTERODACTYL_DOMAINS_ROUTER_TOKEN=some-long-random-string
   # PTERODACTYL_DOMAINS_TARGET_IP=203.0.113.10   # only if the panel's host name does not resolve to the router
   ```

   ```bash
   sudo php artisan migrate --force
   sudo php artisan config:clear
   ```

2. Install the binary (use `mc-router-linux-arm64` on ARM machines), the config and the service:

   ```bash
   sudo install -m 755 dist/mc-router-linux-amd64 /usr/local/bin/mc-router
   sudo cp mc-router.env.example /etc/mc-router.env && sudo nano /etc/mc-router.env
   sudo cp mc-router.service /etc/systemd/system/mc-router.service
   sudo systemctl daemon-reload && sudo systemctl enable --now mc-router
   sudo journalctl -u mc-router -f
   ```

3. Open port 25565 in the firewall. **Nothing else may listen on 25565 on this machine**, if one of your own servers
   uses that port, give it another one.

## Notes

- The router can run anywhere that can reach both the panel and the nodes, the A records just have to point at it.
- Players see the router's address instead of their own on the backend. Set `PROXY_PROTOCOL=1` only for backends that
  understand it (Velocity with `haproxy-protocol = true`), otherwise IP bans and IP logging see the router.
- Players connecting with an unknown domain, or to a server they cannot join, get a short message in the server list and
  when they try to join. The router asks the panel why, so the message is specific: the server is off, starting up,
  shutting down, suspended or still being installed. Suspended and installing servers are never connected to. If the
  panel cannot be reached the player is simply told the server is off. The wording can be changed with `OFFLINE_MOTD`,
  `STARTING_MOTD`, `STOPPING_MOTD`, `SUSPENDED_MOTD` and `INSTALLING_MOTD` (see `mc-router.env.example`).
- Java Edition only. Bedrock uses UDP and is not routed.
- Build it yourself with `go build` (Go 1.21 or newer), run the tests with `go test ./...`.
