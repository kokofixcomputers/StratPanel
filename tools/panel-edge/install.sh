#!/usr/bin/env bash
# One command setup for https. Run it on the machine that runs the panel:
#
#   sudo bash tools/panel-edge/install.sh
#
# It installs panel-edge (the program that serves the panel over https with the certificates added in the panel), creates the secret
# between it and the panel, and starts the service. Afterwards add a certificate under Admin > Settings > Certificates.
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

BINARY="$HERE/dist/panel-edge-linux-$ARCH"
if [ ! -x "$BINARY" ]; then
  echo "Missing $BINARY" >&2
  exit 1
fi

# Port 443 is where browsers go, nothing else may use it. A web server that already does https there has to be moved first.
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]443$' && ! systemctl is-active --quiet panel-edge; then
  echo "Something is already listening on port 443 on this machine (nginx or Apache with https?)." >&2
  echo "Either stop it listening there, or set LISTEN=:8443 in /etc/panel-edge.env after install and send port 443 to it yourself." >&2
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

TOKEN="$(get_env PTERODACTYL_CERTIFICATES_TOKEN)"
if [ -z "$TOKEN" ]; then
  TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  set_env PTERODACTYL_CERTIFICATES_TOKEN "$TOKEN"
fi

# Behind panel-edge the panel has to believe X-Forwarded-Proto, or it makes http links and cookies. It only comes from this machine.
if [ -z "$(get_env TRUSTED_PROXIES)" ]; then
  set_env TRUSTED_PROXIES "127.0.0.1"
fi

# Port 80 lets panel-edge send http to https where there is a certificate, and answer Let's Encrypt (free certificates for the domains of
# servers). The web server of the panel normally has it. With nginx it can be moved to a port only this machine can reach (127.0.0.1:8081),
# the file is backed up and nginx is tested before it is reloaded, and put back if the test fails. Answer no to leave port 80 alone.
BACKEND="http://127.0.0.1:80"
HTTP_LISTEN=""
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '[:.]80$'; then
  HOLDER="$(ss -ltnp 2>/dev/null | awk '$4 ~ /[:.]80$/ {print $0}' | grep -oE 'users:\(\("[^"]+"' | head -n1 | sed 's/users:(("//; s/"//')"
  if [ "$HOLDER" = "panel-edge" ] && [ -f /etc/panel-edge.env ]; then
    # Installed before: keep how port 80 was set up.
    BACKEND="$(grep -E '^BACKEND=' /etc/panel-edge.env | tail -n1 | cut -d= -f2-)"
    HTTP_LISTEN="$(grep -E '^HTTP_LISTEN=' /etc/panel-edge.env | tail -n1 | cut -d= -f2-)"
    BACKEND="${BACKEND:-http://127.0.0.1:80}"
  elif [ "$HOLDER" = "nginx" ] && command -v nginx >/dev/null 2>&1; then
    if [ "${YES:-}" = "1" ] || { [ -t 0 ] && read -r -p "nginx has port 80. Move it to 127.0.0.1:8081 so panel-edge can use port 80 (redirects, Let's Encrypt)? [y/N] " ANSWER && [ "${ANSWER:-n}" = "y" ]; }; then
      # nginx loads everything in sites-enabled and conf.d, so backups must live somewhere else. Files there are often symlinks to
      # sites-available: the real file is edited (sed -i would replace the link with a copy).
      BACKUPS="/var/backups/panel-edge-nginx"
      mkdir -p "$BACKUPS"
      CHANGED=()
      for LINK in $(grep -lE 'listen\s+(\[::\]:)?80\b' /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null || true); do
        FILE="$(readlink -f "$LINK")"
        cp -p "$FILE" "$BACKUPS/$(basename "$FILE").bak"
        sed -i -E 's/listen\s+\[::\]:80\b[^;]*;/# panel-edge: moved from port 80/; s/listen\s+80\b[^;]*;/listen 127.0.0.1:8081;/' "$FILE"
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
    echo "port only this machine reaches (for example 127.0.0.1:8081), then set BACKEND=http://127.0.0.1:8081 and HTTP_LISTEN=:80 in /etc/panel-edge.env." >&2
  fi
else
  HTTP_LISTEN=":80"
fi

echo "Installing panel-edge..."
install -m 755 "$BINARY" /usr/local/bin/panel-edge

# The panel is asked on this machine, not through https (which is what is being set up).
# When the edge answers port 80 itself, the panel is the web server it passes requests to, not http://127.0.0.1 (that is the edge).
PANEL_URL="http://127.0.0.1"
[ -n "$HTTP_LISTEN" ] && PANEL_URL="$BACKEND"
umask 077
cat > /etc/panel-edge.env <<ENV
PANEL_URL=$PANEL_URL
EDGE_TOKEN=$TOKEN
LISTEN=:443
BACKEND=$BACKEND
HTTP_LISTEN=$HTTP_LISTEN
REFRESH=60s
HSTS_SECONDS=0
ENV
umask 022

install -m 644 "$HERE/panel-edge.service" /etc/systemd/system/panel-edge.service

echo "Updating the panel..."
( cd "$PANEL_DIR" && sudo -u "$WEB_USER" php artisan migrate --force && sudo -u "$WEB_USER" php artisan config:clear )
chown -R "$WEB_USER": "$PANEL_DIR/storage" "$PANEL_DIR/bootstrap/cache" 2>/dev/null || true

systemctl daemon-reload
systemctl enable --now panel-edge
systemctl restart panel-edge

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 443/tcp >/dev/null && echo "Opened port 443 in ufw."
  [ -n "$HTTP_LISTEN" ] && ufw allow 80/tcp >/dev/null && echo "Opened port 80 in ufw."
fi

sleep 1
if systemctl is-active --quiet panel-edge; then
  echo
  echo "Done. Now add a certificate in the panel (Admin > Settings > Certificates). Until there is one, https is refused."
  if [ -n "$HTTP_LISTEN" ]; then
    echo "Port 80 is answered too: names that have a certificate are sent to https, and Let's Encrypt can be turned on in the same place."
  fi
  echo "Logs: journalctl -u panel-edge -f"
else
  echo "The service did not start, check: journalctl -u panel-edge -e" >&2
  exit 1
fi
