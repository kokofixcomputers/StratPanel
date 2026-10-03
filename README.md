# StratPanel

StratPanel is a fork of the [Pterodactyl Panel](https://github.com/pterodactyl/panel) focused on **Minecraft**. It keeps
everything that makes Pterodactyl good (isolated Docker containers, Wings, the permission system, the API) and adds a
modern light UI plus the Minecraft tools you would otherwise need plugins and scripts for.

> StratPanel is not affiliated with or endorsed by the Pterodactyl project. Pterodactyl® is a trademark of its owners.
> This repository is MIT licensed like the original, see [LICENSE.md](LICENSE.md).

## What is different

**A new interface.** The whole panel, including the admin area, was redesigned: light theme, rounded cards, top tab
navigation, new dialogs, dropdowns and toasts. The file editor is now Monaco.

**Minecraft tools built in**

| Feature | What it does |
|---|---|
| **Versions tab** | Pick Paper, Purpur, Spigot, Fabric, Quilt, Forge, NeoForge or Velocity, choose the Minecraft version and a build (latest is preselected) and install it in one click. The server is stopped, the jar replaced and the egg variables and Java image updated. Shows what is currently running, backed by a `pterodactyl.json` in the server folder. |
| **Server properties** | Typed editor for `server.properties` with switches, a search box and a **MOTD builder** with colours and formatting. |
| **Proxy settings** | For Velocity servers the properties tab becomes a proxy configurator for `velocity.toml`: drag to reorder servers, forced hosts, forwarding mode and secret. |
| **Mods & plugins** | Browse Modrinth and install plugins or mods straight onto the server. |
| **Operators & whitelist** | Manage `ops.json` and `whitelist.json` with player heads, from the console page. |
| **Create new server** | Users can create their own server from a guided wizard: software, version, node (with ping) and adjustable specs. |
| **Custom domains** | Point an A record at the panel and map the domain to a server allocation. Needs the small router service, one command to install. |
| **Console** | Colour coded warnings and errors, a copy button per block, search, and a full screen mode. |
| **Background tasks** | Archiving and extracting run in the background with a task menu instead of freezing the file manager. |

## Install

StratPanel installs on top of a normal Pterodactyl setup, so you can use any Pterodactyl guide or script to get the
base panel and Wings running, then switch to StratPanel with the update steps below.

New to Pterodactyl? Follow the [official installation guide](https://pterodactyl.io/panel/1.0/getting_started.html)
(or a community installer) first.

## Install or update StratPanel

Every push to `1.0-develop` builds a ready to use archive, and every `v*` tag creates a release. Both contain the built
frontend, so there is nothing to compile on your server.

Replace the URL with a release if you want a fixed version, for example
`https://github.com/kokofixcomputers/StratPanel/releases/download/v1.0.0/panel.tar.gz`.

```bash
cd /var/www/pterodactyl
sudo php artisan down

# Back up first, this is not optional
sudo tar -czf ~/panel-backup-$(date +%F).tar.gz --exclude=vendor --exclude=node_modules .
sudo mysqldump panel > ~/panel-db-$(date +%F).sql   # use your database name

curl -L https://github.com/kokofixcomputers/StratPanel/releases/download/nightly/panel.tar.gz | sudo tar -xzv
sudo chmod -R 755 storage/* bootstrap/cache

sudo composer install --no-dev --optimize-autoloader
sudo php artisan view:clear
sudo php artisan config:clear
sudo php artisan route:clear
sudo php artisan migrate --seed --force

sudo chown -R www-data:www-data /var/www/pterodactyl/*   # nginx / apache user, use "nginx" on RHEL based systems
sudo php artisan queue:restart
sudo php artisan up
```

Hard refresh the browser afterwards (Ctrl+Shift+R).

The archive never touches your `.env`, your database or your server files.

### Optional: let users create their own servers

Import `eggs/egg-java-server.json` in **Admin → Nests → Minecraft → Import Egg**. It is a plain Java container with no
install script, which is what the Versions tab and the create wizard expect. The wizard automatically uses an egg whose
name starts with `Java`. Then add any of these to `.env` (all optional):

| Variable | Default | |
|---|---|---|
| `PTERODACTYL_SELF_SERVICE_ENABLED` | `true` | Turn the "Create new" button on or off |
| `PTERODACTYL_SELF_SERVICE_EGG` | auto | Egg id to create servers from |
| `PTERODACTYL_SELF_SERVICE_LOCATIONS` | any | Comma separated location ids |
| `PTERODACTYL_SELF_SERVICE_MAX_SERVERS` | `3` | Servers per user, `0` for no limit (admins are never limited) |
| `PTERODACTYL_SELF_SERVICE_MEMORY` / `_DISK` / `_CPU` | `2048` / `10240` / `200` | Default specs |
| `PTERODACTYL_SELF_SERVICE_MAX_MEMORY` / `_MAX_DISK` / `_MAX_CPU` | `8192` / `51200` / `400` | Upper limit of the spec sliders |

### Optional: custom domains

Users can point their own domain at a server. A domain only needs an **A record** to the panel machine, but something
has to listen on port 25565 and read which domain the player typed. That is the bundled router, installed with one
command on the machine the A records point to:

```bash
cd /var/www/pterodactyl
sudo php artisan p:router:install
```

Make sure nothing else on that machine uses port 25565. See [tools/mc-router](tools/mc-router/README.md) for details.
Set `PTERODACTYL_DOMAINS_TARGET_IP` in `.env` if your panel is reached through an internal address.

## Development

```bash
yarn install
yarn preview        # http://localhost:4000, the full UI with a mocked API, no backend needed
yarn tsc && yarn lint && yarn test
yarn build:production
```

`yarn preview` runs the real frontend against an in-memory mock of the panel API and a fake Wings console, so you can
work on the UI without PHP, a database or Wings. Add `PREVIEW_PROXY=1` to preview a Velocity server.

The router in `tools/mc-router` is a small Go program (`go test ./...`, `go build`).

## Credits

StratPanel is built on the excellent work of the [Pterodactyl](https://pterodactyl.io) project and its contributors.
Server software metadata comes from [MCJars](https://mcjars.app) and mods and plugins come from
[Modrinth](https://modrinth.com).
