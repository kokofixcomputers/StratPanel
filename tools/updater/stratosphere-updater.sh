#!/usr/bin/env bash
# Runs as root when the panel asks for it (see stratosphere-updater.path): puts the newest router (mc-router) and edge (panel-edge) in
# place and restarts them, and can update the panel itself. The panel can ask for exactly these things, written as one word in
# $PANEL_DIR/storage/app/updates/request:
#   local             use the binaries in $PANEL_DIR/tools/*/dist
#   download          fetch the panel.tar.gz of the latest release first and use the binaries in it
#   download-nightly  the same with the nightly build
#   panel             update the panel from the panel.tar.gz of the latest release (the steps of tools/update-panel.sh), then the router and edge
#   panel-nightly     the same with the nightly build
# Nothing else the panel writes is used: the address to download from and the paths are from /etc/stratosphere-updater.env.
set -uo pipefail

ENV_FILE="${UPDATER_ENV:-/etc/stratosphere-updater.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
PANEL_DIR="${PANEL_DIR:-/var/www/pterodactyl}"
WEB_USER="${WEB_USER:-www-data}"
PANEL_TAR_URL="${PANEL_TAR_URL:-https://github.com/kokofixcomputers/StratPanel/releases/latest/download/panel.tar.gz}"
PANEL_TAR_NIGHTLY_URL="${PANEL_TAR_NIGHTLY_URL:-https://github.com/kokofixcomputers/StratPanel/releases/download/nightly/panel.tar.gz}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
RESTART="${RESTART:-systemctl restart}"
IS_ACTIVE="${IS_ACTIVE:-systemctl is-active --quiet}"
UNIT_EXISTS="${UNIT_EXISTS:-systemctl cat}"
SETTLE="${SETTLE:-3}"
QUEUE_SERVICE="${QUEUE_SERVICE:-pteroq}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/stratosphere}"

DIR="$PANEL_DIR/storage/app/updates"
REQUEST="$DIR/request"
STATUS="$DIR/status.json"

[ -f "$REQUEST" ] || exit 0
ACTION="$(tr -d '[:space:]' < "$REQUEST")"
rm -f "$REQUEST"

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) ARCH="" ;;
esac

# The panel page shows this while the work goes on.
printf '{"running":true,"action":"%s"}\n' "$ACTION" > "$STATUS.tmp" && chmod 644 "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"

RESULTS=()
note() { # name status detail
  local detail="$3"
  # One line, nothing that breaks the JSON.
  detail="${detail//$'\n'/ }"
  detail="${detail//$'\r'/ }"
  detail="${detail//$'\t'/ }"
  detail="${detail//\\//}"
  detail="${detail//\"/\'}"
  detail="${detail:0:400}"
  RESULTS+=("{\"name\":\"$1\",\"status\":\"$2\",\"detail\":\"$detail\"}")
}
finish() {
  local joined
  joined="$(IFS=,; echo "${RESULTS[*]-}")"
  printf '{"action":"%s","finished_at":"%s","results":[%s]}\n' "${ACTION:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$joined" > "$STATUS.tmp"
  chmod 644 "$STATUS.tmp"
  chown "$WEB_USER" "$STATUS.tmp" 2> /dev/null || true
  mv "$STATUS.tmp" "$STATUS"
}
trap finish EXIT

SRC="$PANEL_DIR/tools"
TMP=""
case "$ACTION" in
  local) ;;
  download | download-nightly | panel | panel-nightly)
    URL="$PANEL_TAR_URL"
    case "$ACTION" in *-nightly) URL="$PANEL_TAR_NIGHTLY_URL" ;; esac
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"; finish' EXIT
    if ! curl -fsSL --max-time 300 -o "$TMP/panel.tar.gz" "$URL"; then
      note download failed "could not download $URL"
      exit 0
    fi
    mkdir "$TMP/x"
    # Only the binaries are taken out of the archive, nothing else of it is touched. Each one on its own: an older archive may not have
    # all of them, and tar fails when a pattern finds nothing.
    for tool in mc-router panel-edge; do
      tar -xzf "$TMP/panel.tar.gz" -C "$TMP/x" --wildcards "*tools/$tool/dist/*" 2> /dev/null || true
    done
    tar -xzf "$TMP/panel.tar.gz" -C "$TMP/x" --wildcards "*tools/updater/*" 2> /dev/null || true
    FOUND="$(find "$TMP/x" -type d -path '*tools/*/dist' | head -n1)"
    if [ -n "$FOUND" ]; then
      SRC="$(dirname "$(dirname "$FOUND")")"
    elif [ "${ACTION#panel}" = "$ACTION" ]; then
      note download failed "the archive has no router or edge binaries"
      exit 0
    else
      SRC="$TMP/x/tools"
    fi
    ;;
  *)
    note request failed "unknown request"
    exit 0
    ;;
esac

if [ -z "$ARCH" ]; then
  note machine failed "unsupported CPU architecture $(uname -m)"
  exit 0
fi

update() { # name
  local name="$1" built="$SRC/$1/dist/$1-linux-$ARCH" target="$BIN_DIR/$1"
  if ! $UNIT_EXISTS "$name" > /dev/null 2>&1; then
    note "$name" missing "not installed on this machine"
    return
  fi
  if [ ! -f "$built" ]; then
    if [ "$ACTION" = local ]; then
      note "$name" failed "no build at $built"
    else
      note "$name" failed "this download has no $name build (it is older than $name), try the nightly"
    fi
    return
  fi
  # Files the panel's own user can replace would let a hacked panel run code as root, so those are only used from the download.
  if [ "$ACTION" = local ] && [ "${ALLOW_WEB_OWNED:-0}" != 1 ]; then
    local owner
    owner="$(stat -c %U "$built" 2> /dev/null || stat -f %Su "$built")"
    if [ "$owner" = "$WEB_USER" ]; then
      note "$name" failed "$built belongs to $WEB_USER. Run: chown -R root: $SRC/$name/dist (or use the download)"
      return
    fi
  fi
  if cmp -s "$built" "$target"; then
    note "$name" current "already the newest build"
    return
  fi
  install -m 755 "$built" "$target.new" && cp -p "$target" "$target.prev" 2> /dev/null
  mv "$target.new" "$target"
  $RESTART "$name"
  sleep "$SETTLE"
  if $IS_ACTIVE "$name"; then
    note "$name" updated "restarted"
  else
    # The new build does not stay up: put the previous one back.
    if [ -f "$target.prev" ]; then
      mv "$target.prev" "$target"
      $RESTART "$name"
    fi
    note "$name" failed "the new build did not start, the previous one was put back"
  fi
}

as_web() {
  if command -v sudo > /dev/null 2>&1; then
    sudo -u "$WEB_USER" -H "$@"
  else
    runuser -u "$WEB_USER" -- env HOME=/tmp "$@"
  fi
}

# The steps of tools/update-panel.sh, done here as root. The code is backed up first, the panel is put in maintenance mode while it
# changes, and it is always brought back up, also when a step failed (the result says which one).
update_panel() {
  local tarball="$TMP/panel.tar.gz" out backup

  if ! tar -tzf "$tarball" 2> /dev/null | grep -qE '^(\./)?artisan$'; then
    note panel failed "the download is not a panel archive"
    return 1
  fi

  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
  backup="$BACKUP_DIR/panel-backup-$(date +%F-%H%M).tar.gz"
  # Everything the archive can touch except vendor and storage. The .env stays where it is, the archive has none.
  tar -czf "$backup" -C "$PANEL_DIR" .env app bootstrap config database public resources routes composer.json composer.lock tools 2> /dev/null || true
  # Keep the last three.
  ls -1t "$BACKUP_DIR"/panel-backup-*.tar.gz 2> /dev/null | tail -n +4 | while read -r old; do rm -f "$old"; done

  cd "$PANEL_DIR" || return 1
  php artisan down > /dev/null 2>&1 || true

  # The shipped eggs are data of the archive: start from an empty folder so a removed or renamed file does not stay behind.
  rm -rf "$PANEL_DIR/database/Seeders/eggs"
  if ! out="$(tar -xzf "$tarball" -C "$PANEL_DIR" 2>&1)"; then
    tar -xzf "$backup" -C "$PANEL_DIR" 2> /dev/null || true
    chown -R "$WEB_USER": "$PANEL_DIR"
    php artisan up > /dev/null 2>&1 || true
    note panel failed "could not extract the archive, the previous files were put back ($out)"
    return 1
  fi

  chown -R "$WEB_USER": "$PANEL_DIR"
  if ! out="$(as_web composer install --no-dev --optimize-autoloader --no-interaction --working-dir="$PANEL_DIR" 2>&1)"; then
    tar -xzf "$backup" -C "$PANEL_DIR" 2> /dev/null || true
    chown -R "$WEB_USER": "$PANEL_DIR"
    php artisan up > /dev/null 2>&1 || true
    note panel failed "composer install failed, the previous files were put back ($(printf '%s' "$out" | tail -n 3))"
    return 1
  fi

  local failed=""
  if ! out="$(php artisan migrate --force 2>&1)"; then
    failed="the database migration failed: $(printf '%s' "$out" | tail -n 3)"
  fi
  local warn=""
  if ! php artisan db:seed --force > /dev/null 2>&1; then
    warn=" (the eggs were not updated)"
  fi
  for c in view:clear config:clear route:clear cache:clear; do php artisan "$c" > /dev/null 2>&1 || true; done
  chown -R "$WEB_USER": "$PANEL_DIR"
  systemctl restart "$QUEUE_SERVICE" > /dev/null 2>&1 || warn="$warn (could not restart $QUEUE_SERVICE)"
  php artisan up > /dev/null 2>&1 || true

  if [ -n "$failed" ]; then
    note panel failed "$failed. The new code is in place, the backup is $backup"
    return 1
  fi
  note panel updated "updated$warn, backup: $backup"

  # The updater itself, from the archive (a new file and a rename: this script keeps running from the old one).
  if [ -f "$TMP/x/tools/updater/stratosphere-updater.sh" ] && ! cmp -s "$TMP/x/tools/updater/stratosphere-updater.sh" "$BIN_DIR/stratosphere-updater"; then
    if cp "$TMP/x/tools/updater/stratosphere-updater.sh" "$BIN_DIR/stratosphere-updater.new" && chmod 755 "$BIN_DIR/stratosphere-updater.new" \
      && mv "$BIN_DIR/stratosphere-updater.new" "$BIN_DIR/stratosphere-updater"; then
      note updater updated "the updater itself was updated"
    fi
  fi
  return 0
}

case "$ACTION" in
  panel | panel-nightly)
    if ! update_panel; then
      exit 0
    fi
    ;;
esac

update mc-router
update panel-edge
exit 0
