#!/usr/bin/env bash
# One command setup for the router (custom domains for Minecraft servers) and the edge (https for the panel). Run it on the machine
# that runs the panel:
#
#   sudo bash tools/stratnet/install.sh            both
#   sudo bash tools/stratnet/install.sh router     only the router (what `php artisan p:router:install` does)
#   sudo bash tools/stratnet/install.sh edge       only the edge
#
# It installs stratosphere-net (the one program that is both), creates the secrets between it and the panel, runs the database migration
# and starts the service. Running it again for the other part adds that part, nothing that was set up is lost. A machine that has the old
# programs (mc-router and panel-edge) is moved to the new one first, with its settings.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
WEB_USER="${WEB_USER:-www-data}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PART="${1:-both}"
ENV_FILE="/etc/stratosphere-net.env"

case "$PART" in
  router | edge | both) ;;
  *) echo "Usage: install.sh [router|edge|both]" >&2; exit 1 ;;
esac
WANT_ROUTER=0
WANT_EDGE=0
[ "$PART" != edge ] && WANT_ROUTER=1
[ "$PART" != router ] && WANT_EDGE=1

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

BINARY="$HERE/dist/stratosphere-net-linux-$ARCH"
if [ ! -x "$BINARY" ]; then
  echo "Missing $BINARY" >&2
  exit 1
fi

listening() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }
ACTIVE=0
systemctl is-active --quiet stratosphere-net 2>/dev/null && ACTIVE=1

# The old two programs: moved to this one first (their settings come along), then this install adds what was asked for.
if [ ! -f "$ENV_FILE" ] && { [ -f /etc/mc-router.env ] || [ -f /etc/panel-edge.env ]; }; then
  echo "Moving mc-router and panel-edge to stratosphere-net..."
  bash "$HERE/migrate-legacy.sh" "$BINARY" "$HERE/stratosphere-net.service"
  ACTIVE=1
fi

# Port 25565 is what lets a domain work without typing a port, so nothing else may use it.
if [ "$WANT_ROUTER" = 1 ] && [ "$ACTIVE" = 0 ] && listening 25565; then
  echo "Something is already listening on port 25565 on this machine." >&2
  echo "Move that server to another port (or set ROUTER_LISTEN in $ENV_FILE after install) and run this again." >&2
  exit 1
fi
# Port 443 is where browsers go, nothing else may use it. A web server that already does https there has to be moved first.
if [ "$WANT_EDGE" = 1 ] && [ "$ACTIVE" = 0 ] && listening 443; then
  echo "Something is already listening on port 443 on this machine (nginx or Apache with https?)." >&2
  echo "Either stop it listening there, or set EDGE_LISTEN=:8443 in $ENV_FILE after install and send port 443 to it yourself." >&2
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
secret() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# One line of the file of this program: replaced when it is there, added when not.
net_set() {
  if [ ! -f "$ENV_FILE" ]; then
    (umask 077 && : > "$ENV_FILE")
  fi
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}
net_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

if [ "$WANT_ROUTER" = 1 ]; then
  TOKEN="$(get_env PTERODACTYL_DOMAINS_ROUTER_TOKEN)"
  if [ -z "$TOKEN" ]; then
    TOKEN="$(secret)"
    set_env PTERODACTYL_DOMAINS_ROUTER_TOKEN "$TOKEN"
  fi

  PANEL_URL="$(get_env APP_URL)"
  PANEL_URL="${PANEL_URL:-http://127.0.0.1}"
  net_set ENABLE_ROUTER 1
  net_set ROUTER_PANEL_URL "$PANEL_URL"
  net_set ROUTER_TOKEN "$TOKEN"
  [ -z "$(net_get ROUTER_LISTEN)" ] && net_set ROUTER_LISTEN ":25565"
  [ -z "$(net_get ROUTER_REFRESH)" ] && net_set ROUTER_REFRESH "15s"
  [ -z "$(net_get PROXY_PROTOCOL)" ] && net_set PROXY_PROTOCOL "0"
fi

if [ "$WANT_EDGE" = 1 ]; then
  TOKEN="$(get_env PTERODACTYL_CERTIFICATES_TOKEN)"
  if [ -z "$TOKEN" ]; then
    TOKEN="$(secret)"
    set_env PTERODACTYL_CERTIFICATES_TOKEN "$TOKEN"
  fi

  # Behind the edge the panel has to believe X-Forwarded-Proto, or it makes http links and cookies. It only comes from this machine.
  if [ -z "$(get_env TRUSTED_PROXIES)" ]; then
    set_env TRUSTED_PROXIES "127.0.0.1"
  fi

  # Port 80 lets the edge send http to https where there is a certificate, and answer Let's Encrypt (free certificates for the domains of
  # servers). The web server of the panel normally has it. With nginx it can be moved to a port only this machine can reach (127.0.0.1:8081),
  # the file is backed up and nginx is tested before it is reloaded, and put back if the test fails. Answer no to leave port 80 alone.
  BACKEND="http://127.0.0.1:80"
  HTTP_LISTEN=""
  if listening 80; then
    HOLDER="$(ss -ltnp 2>/dev/null | awk '$4 ~ /[:.]80$/ {print $0}' | grep -oE 'users:\(\("[^"]+"' | head -n1 | sed 's/users:(("//; s/"//')"
    if { [ "$HOLDER" = "stratosphere-net" ] || [ "$HOLDER" = "panel-edge" ]; } && [ -f "$ENV_FILE" ]; then
      # Installed before: keep how port 80 was set up.
      BACKEND="$(net_get BACKEND)"
      HTTP_LISTEN="$(net_get HTTP_LISTEN)"
      BACKEND="${BACKEND:-http://127.0.0.1:80}"
    elif [ "$HOLDER" = "nginx" ] && command -v nginx >/dev/null 2>&1; then
      if [ "${YES:-}" = "1" ] || { [ -t 0 ] && read -r -p "nginx has port 80. Move it to 127.0.0.1:8081 so the edge can use port 80 (redirects, Let's Encrypt)? [y/N] " ANSWER && [ "${ANSWER:-n}" = "y" ]; }; then
        # nginx loads everything in sites-enabled and conf.d, so backups must live somewhere else. Files there are often symlinks to
        # sites-available: the real file is edited (sed -i would replace the link with a copy).
        BACKUPS="/var/backups/stratosphere-net-nginx"
        mkdir -p "$BACKUPS"
        CHANGED=()
        for LINK in $(grep -lE 'listen\s+(\[::\]:)?80\b' /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null || true); do
          FILE="$(readlink -f "$LINK")"
          cp -p "$FILE" "$BACKUPS/$(basename "$FILE").bak"
          sed -i -E 's/listen\s+\[::\]:80\b[^;]*;/# stratosphere-net: moved from port 80/; s/listen\s+80\b[^;]*;/listen 127.0.0.1:8081;/' "$FILE"
          CHANGED+=("$FILE")
        done
        if [ "${#CHANGED[@]}" -gt 0 ] && nginx -t >/dev/null 2>&1; then
          # A restart, not a reload: the old workers can hold port 80 for a while after a reload.
          systemctl restart nginx
          BACKEND="http://127.0.0.1:8081"
          HTTP_LISTEN=":80"
          echo "nginx now listens on 127.0.0.1:8081 (backups: $BACKUPS)."
        else
          for FILE in "${CHANGED[@]}"; do cp -p "$BACKUPS/$(basename "$FILE").bak" "$FILE"; done
          echo "nginx could not be changed (nginx -t failed or no listen 80 found), it was left as it was. Port 80 stays with nginx." >&2
        fi
      fi
    else
      echo "Port 80 is used by '${HOLDER:-something else}', it was left alone. To use port 80 for https redirects and free certificates, move it to a" >&2
      echo "port only this machine reaches (for example 127.0.0.1:8081), then set BACKEND=http://127.0.0.1:8081 and HTTP_LISTEN=:80 in $ENV_FILE." >&2
    fi
  else
    HTTP_LISTEN=":80"
  fi

  # The panel is asked on this machine, not through https (which is what is being set up).
  # When the edge answers port 80 itself, the panel is the web server it passes requests to, not http://127.0.0.1 (that is the edge).
  EDGE_PANEL="http://127.0.0.1"
  [ -n "$HTTP_LISTEN" ] && EDGE_PANEL="$BACKEND"
  net_set ENABLE_EDGE 1
  net_set EDGE_PANEL_URL "$EDGE_PANEL"
  net_set EDGE_TOKEN "$TOKEN"
  net_set BACKEND "$BACKEND"
  net_set HTTP_LISTEN "$HTTP_LISTEN"
  [ -z "$(net_get EDGE_LISTEN)" ] && net_set EDGE_LISTEN ":443"
  [ -z "$(net_get EDGE_REFRESH)" ] && net_set EDGE_REFRESH "60s"
  [ -z "$(net_get HSTS_SECONDS)" ] && net_set HSTS_SECONDS "0"
fi

# A part that was not asked for stays as it is: off when it was never set up.
[ -z "$(net_get ENABLE_ROUTER)" ] && net_set ENABLE_ROUTER 0
[ -z "$(net_get ENABLE_EDGE)" ] && net_set ENABLE_EDGE 0

echo "Installing stratosphere-net..."
install -m 755 "$BINARY" /usr/local/bin/stratosphere-net
install -m 644 "$HERE/stratosphere-net.service" /etc/systemd/system/stratosphere-net.service

echo "Updating the panel..."
( cd "$PANEL_DIR" && sudo -u "$WEB_USER" php artisan migrate --force && sudo -u "$WEB_USER" php artisan config:clear )
# Running this as root can leave root owned files behind, give them back to the web server's user.
chown -R "$WEB_USER": "$PANEL_DIR/storage" "$PANEL_DIR/bootstrap/cache" 2>/dev/null || true

systemctl daemon-reload
systemctl enable --now stratosphere-net
systemctl restart stratosphere-net

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  if [ "$WANT_ROUTER" = 1 ]; then
    ufw allow 25565/tcp >/dev/null && echo "Opened port 25565 in ufw."
  fi
  if [ "$WANT_EDGE" = 1 ]; then
    ufw allow 443/tcp >/dev/null && echo "Opened port 443 in ufw."
    [ -n "${HTTP_LISTEN:-}" ] && ufw allow 80/tcp >/dev/null && echo "Opened port 80 in ufw."
  fi
fi

sleep 1
if systemctl is-active --quiet stratosphere-net; then
  echo
  if [ "$WANT_ROUTER" = 1 ]; then
    echo "The router works: add an A record pointing at this machine's public IP, then add the domain in the server's Domains tab."
  fi
  if [ "$WANT_EDGE" = 1 ]; then
    echo "The edge works: now add a certificate in the panel (Admin > Settings > Certificates). Until there is one, https is refused."
    if [ -n "${HTTP_LISTEN:-}" ]; then
      echo "Port 80 is answered too: names that have a certificate are sent to https, and Let's Encrypt can be turned on in the same place."
    fi
  fi
  echo "Logs: journalctl -u stratosphere-net -f"
else
  echo "The service did not start, check: journalctl -u stratosphere-net -e" >&2
  exit 1
fi
