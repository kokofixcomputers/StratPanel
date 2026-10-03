#!/usr/bin/env bash
# One command setup for custom domains. Run it on the machine that runs the panel:
#
#   sudo bash tools/mc-router/install.sh
#
# It installs the router, creates the secret between the router and the panel, runs the database migration and starts
# the service. Afterwards users only have to point an A record at this machine.
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

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
esac

BINARY="$HERE/dist/mc-router-linux-$ARCH"
if [ ! -x "$BINARY" ]; then
  echo "Missing $BINARY" >&2
  exit 1
fi

# Port 25565 is what lets a domain work without typing a port, so nothing else may use it.
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]25565$' && ! systemctl is-active --quiet mc-router; then
  echo "Something is already listening on port 25565 on this machine." >&2
  echo "Move that server to another port (or set LISTEN in /etc/mc-router.env after install) and run this again." >&2
  exit 1
fi

get_env() { grep -E "^$1=" "$PANEL_DIR/.env" | tail -n1 | cut -d= -f2- | tr -d '"' || true; }
set_env() {
  if grep -qE "^$1=" "$PANEL_DIR/.env"; then
    sed -i "s|^$1=.*|$1=$2|" "$PANEL_DIR/.env"
  else
    printf '\n%s=%s\n' "$1" "$2" >> "$PANEL_DIR/.env"
  fi
}

TOKEN="$(get_env PTERODACTYL_DOMAINS_ROUTER_TOKEN)"
if [ -z "$TOKEN" ]; then
  TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env PTERODACTYL_DOMAINS_ROUTER_TOKEN "$TOKEN"
fi

PANEL_URL="$(get_env APP_URL)"
PANEL_URL="${PANEL_URL:-http://127.0.0.1}"

echo "Installing the router binary..."
install -m 755 "$BINARY" /usr/local/bin/mc-router

umask 077
cat > /etc/mc-router.env <<ENV
PANEL_URL=$PANEL_URL
ROUTER_TOKEN=$TOKEN
LISTEN=:25565
REFRESH=15s
PROXY_PROTOCOL=0
ENV
umask 022

install -m 644 "$HERE/mc-router.service" /etc/systemd/system/mc-router.service

echo "Updating the panel..."
( cd "$PANEL_DIR" && sudo -u "$WEB_USER" php artisan migrate --force && sudo -u "$WEB_USER" php artisan config:clear )

# Running this as root can leave root owned files behind, give them back to the web server's user.
chown -R "$WEB_USER": "$PANEL_DIR/storage" "$PANEL_DIR/bootstrap/cache" 2>/dev/null || true

systemctl daemon-reload
systemctl enable --now mc-router
systemctl restart mc-router

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 25565/tcp >/dev/null && echo "Opened port 25565 in ufw."
fi

sleep 1
if systemctl is-active --quiet mc-router; then
  echo
  echo "Done. Domains now work: add an A record pointing at this machine's public IP, then add the domain in the"
  echo "server's Domains tab. Logs: journalctl -u mc-router -f"
else
  echo "The service did not start, check: journalctl -u mc-router -e" >&2
  exit 1
fi
