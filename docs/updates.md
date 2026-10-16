# Updates and installing nodes

## Wings on the nodes

The Wings of Stratosphere ([stratwings](https://github.com/kokofixcomputers/stratwings)) updates itself when the panel asks:

* **Admin > Nodes > Update nodes** updates every node, one after the other. A node's own page has **Update Wings** next to its version.
* The nodes list shows each node's Wings version and marks old ones.
* The node downloads `wings_linux_<arch>` and `checksums.txt` of the nightly release, checks the hash, starts the new binary once with
  `version`, keeps the old one as `wings.old`, and restarts in place. Servers keep running. If the new Wings fails to stay up three times,
  the old one is put back by itself.
* Needs the permission `nodes.software` (root admins have it).
* Where the nodes download from: `WINGS_UPDATE_URL` in `.env` of the panel is only used to look up the newest version; the nodes use their own
  `WINGS_UPDATE_URL` environment variable (default: the nightly release of stratwings).
* A node whose Wings is older than this feature (the original Wings, or a build of the fork from before self update) answers "too old to
  update itself". Replace its binary once by hand, from then on it updates itself:

  ```bash
  sudo curl -fL -o /usr/local/bin/wings.new https://github.com/kokofixcomputers/stratwings/releases/download/nightly/wings_linux_amd64   # arm64 on ARM
  sudo chmod +x /usr/local/bin/wings.new && sudo mv /usr/local/bin/wings.new /usr/local/bin/wings && sudo systemctl restart wings
  ```

### One command for a new node

Put the Wings of Stratosphere on the machine (`curl -L .../wings_linux_amd64 -o /usr/local/bin/wings && chmod +x /usr/local/bin/wings`), make the
node in the panel, press **Generate Token** on its Configuration tab and run the `wings install ...` line it shows. It writes the
configuration, installs the systemd service if there is none, and starts Wings.

## The panel, router and edge on the panel machine

**Admin > Updates** (root admins only) can update the panel itself, and `mc-router` and `panel-edge` (it restarts their services):

* **Update the panel**: downloads `panel.tar.gz` (latest release or nightly, your choice) and does what `tools/update-panel.sh` does, as root:
  backs up the current files (`/var/backups/stratosphere`, the last three are kept), `php artisan down`, extracts the archive over the panel,
  `chown` to the web user, `composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`, `db:seed`, clears the caches,
  restarts the queue worker (`pteroq`, `QUEUE_SERVICE` in the env file), `php artisan up`. Then it updates the router and edge from the
  same archive and the updater itself. If extracting or composer fails, the old files are put back; a failed migration leaves the new files
  in place (the result says so). The panel always comes out of maintenance mode. The page shows the maintenance screen for a minute or two
  and picks up the result by itself.

* **Update router and edge only**: the same download, but only the two binaries are taken out of it.
* **Update from the files on this machine**: uses `tools/mc-router/dist` and `tools/panel-edge/dist` of the panel, so what you extracted last.
* The download is `PANEL_TAR_URL` (the latest release) or, with *Nightly* chosen, `PANEL_TAR_NIGHTLY_URL`
  (`.../releases/download/nightly/panel.tar.gz`).

If a new build does not stay up, the previous one is put back and the result says so.

### Setup, once

```bash
sudo bash tools/updater/install.sh
```

The panel's web user can not restart services, so a small root service (`stratosphere-updater.path`) waits for the panel to write a request
file, `storage/app/updates/request`, with one of five words: `local`, `download`, `download-nightly`, `panel` or `panel-nightly`. Nothing else the panel writes is used: the download address
and paths come from `/etc/stratosphere-updater.env`, which only root can change. The result is written to `storage/app/updates/status.json`
and shown on the page.

Because the web user owns the panel files, a hacked panel could replace the binaries in `tools/*/dist` and have root run them. For that reason
**the files on this machine are only used when they do not belong to the web user**: run this once after extracting the panel,

```bash
sudo chown -R root: tools/mc-router/dist tools/panel-edge/dist
```

The download does not have this limit, it comes from the release, not from a folder the panel can write to. (`ALLOW_WEB_OWNED=1` in
`/etc/stratosphere-updater.env` turns the check off.)
