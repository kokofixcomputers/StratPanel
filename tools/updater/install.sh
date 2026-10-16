#!/usr/bin/env bash
# Lets the panel update the router and the edge from its Updates page. Run on the machine that runs the panel:
#
#   sudo bash tools/updater/install.sh
#
# It installs a small root service that does nothing until the panel writes a request file, and then does one of two fixed things.
# See docs/updates.md.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
WEB_USER="${WEB_USER:-www-data}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this with sudo." >&2
  exit 1
fi
if [ ! -f "$PANEL_DIR/.env" ]; then
  echo "Could not find the panel in $PANEL_DIR. Set PANEL_DIR=/path/to/panel and run again." >&2
  exit 1
fi

install -m 755 "$HERE/stratosphere-updater.sh" /usr/local/bin/stratosphere-updater
if [ ! -f /etc/stratosphere-updater.env ]; then
  printf 'PANEL_DIR=%s\nWEB_USER=%s\n# PANEL_TAR_URL=https://github.com/kokofixcomputers/StratPanel/releases/latest/download/panel.tar.gz\n# PANEL_TAR_NIGHTLY_URL=https://github.com/kokofixcomputers/StratPanel/releases/download/nightly/panel.tar.gz\n' "$PANEL_DIR" "$WEB_USER" > /etc/stratosphere-updater.env
  chmod 644 /etc/stratosphere-updater.env
fi

install -d -m 775 -o "$WEB_USER" "$PANEL_DIR/storage/app/updates"
touch "$PANEL_DIR/storage/app/updates/installed"
chown "$WEB_USER" "$PANEL_DIR/storage/app/updates/installed"

install -m 644 "$HERE/stratosphere-updater.service" /etc/systemd/system/stratosphere-updater.service
sed "s|@PANEL_DIR@|$PANEL_DIR|g" "$HERE/stratosphere-updater.path" > /etc/systemd/system/stratosphere-updater.path
systemctl daemon-reload
systemctl enable --now stratosphere-updater.path

echo
echo "Done. The panel can now update the router and the edge: Admin > Updates."
echo "To use the files on this machine (not only the download), the binaries must not belong to $WEB_USER:"
echo "  sudo chown -R root: $PANEL_DIR/tools/mc-router/dist $PANEL_DIR/tools/panel-edge/dist"
