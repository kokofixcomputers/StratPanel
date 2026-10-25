#!/usr/bin/env bash
# Runs as root when the panel asks for it (see stratosphere-updater.path): puts the newest stratosphere-net (the router and the edge in one program) in
# place and restarts it (and moves a machine that still has the old mc-router and panel-edge to it), and can update the panel itself. The panel can ask for exactly these things, written as one word in
# $PANEL_DIR/storage/app/updates/request:
#   local             use the binaries in $PANEL_DIR/tools/*/dist
#   download          fetch the panel.tar.gz of the latest release first and use the binaries in it
#   download-nightly  the same with the nightly build
#   panel             update the panel from the panel.tar.gz of the latest release (the steps of tools/update-panel.sh), then stratosphere-net
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
# "restore:NAME" and "delete-backup:NAME" name one of the backups in BACKUP_DIR. Only a name made by this script is accepted, never a path.
ARG=""
case "$ACTION" in
  restore:* | delete-backup:*)
    ARG="${ACTION#*:}"
    ACTION="${ACTION%%:*}"
    ;;
esac
BACKUP_NAME_RE='^panel-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}(-[a-z]+)?\.tar\.gz$'

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) ARCH="" ;;
esac

# The panel page shows this while the work goes on.
printf '{"running":true,"action":"%s"}\n' "$ACTION" > "$STATUS.tmp" && chmod 644 "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"

# The step the work is at, for the progress bar of the page (the page knows the order of the steps).
progress() {
  printf '{"running":true,"action":"%s","step":"%s"}\n' "$ACTION" "$1" > "$STATUS.tmp" && chmod 644 "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
}

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
# The backups, for the panel page: it cannot read the folder (root's), so the list is written here.
write_backups() {
  local items=() f name size created
  for f in $(ls -1t "$BACKUP_DIR"/panel-backup-*.tar.gz 2> /dev/null); do
    name="$(basename "$f")"
    [[ "$name" =~ $BACKUP_NAME_RE ]] || continue
    size="$(stat -c %s "$f" 2> /dev/null || stat -f %z "$f" 2> /dev/null || echo 0)"
    created="$(stat -c %Y "$f" 2> /dev/null || stat -f %m "$f" 2> /dev/null || echo 0)"
    items+=("{\"name\":\"$name\",\"size\":$size,\"created\":$created}")
  done
  local joined
  joined="$(IFS=,; echo "${items[*]-}")"
  printf '[%s]\n' "$joined" > "$DIR/backups.json.tmp"
  chmod 644 "$DIR/backups.json.tmp"
  chown "$WEB_USER" "$DIR/backups.json.tmp" 2> /dev/null || true
  mv "$DIR/backups.json.tmp" "$DIR/backups.json"
}
finish() {
  write_backups
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
  backups | delete-backup | restore) ;;
  download | download-nightly | panel | panel-nightly)
    URL="$PANEL_TAR_URL"
    case "$ACTION" in *-nightly) URL="$PANEL_TAR_NIGHTLY_URL" ;; esac
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"; finish' EXIT
    progress download
    if ! curl -fsSL --max-time 300 -o "$TMP/panel.tar.gz" "$URL"; then
      note download failed "could not download $URL"
      exit 0
    fi
    mkdir "$TMP/x"
    # Only the binaries are taken out of the archive, nothing else of it is touched. Each one on its own: an older archive may not have
    # all of them, and tar fails when a pattern finds nothing.
    for pattern in "*tools/stratnet/dist/*" "*tools/stratnet/stratosphere-net.service" "*tools/stratnet/migrate-legacy.sh"; do
      tar -xzf "$TMP/panel.tar.gz" -C "$TMP/x" --wildcards "$pattern" 2> /dev/null || true
    done
    tar -xzf "$TMP/panel.tar.gz" -C "$TMP/x" --wildcards "*tools/updater/*" 2> /dev/null || true
    FOUND="$(find "$TMP/x" -type d -path '*tools/*/dist' | head -n1)"
    if [ -n "$FOUND" ]; then
      SRC="$(dirname "$(dirname "$FOUND")")"
    elif [ "${ACTION#panel}" = "$ACTION" ]; then
      note download failed "the archive has no stratosphere-net binary"
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

# Files the panel's own user can replace would let a hacked panel run code as root, so those are only used from the download.
refuse_web_owned() { # file name
  if [ "$ACTION" = local ] && [ "${ALLOW_WEB_OWNED:-0}" != 1 ]; then
    local owner
    owner="$(stat -c %U "$1" 2> /dev/null || stat -f %Su "$1")"
    if [ "$owner" = "$WEB_USER" ]; then
      note "$2" failed "$1 belongs to $WEB_USER. Run: chown -R root: $SRC/stratnet (or use the download)"
      return 0
    fi
  fi

  return 1
}

# Puts the new stratosphere-net in place, or moves the old mc-router and panel-edge to it.
update_net() {
  local name=stratosphere-net built="$SRC/stratnet/dist/stratosphere-net-linux-$ARCH" target="$BIN_DIR/stratosphere-net"
  local legacy=0
  if ! $UNIT_EXISTS "$name" > /dev/null 2>&1; then
    # Machines made before the two were one program: move them to it, with their settings.
    if $UNIT_EXISTS mc-router > /dev/null 2>&1 || $UNIT_EXISTS panel-edge > /dev/null 2>&1; then
      legacy=1
    else
      note "$name" missing "not installed on this machine"
      return
    fi
  fi
  if [ ! -f "$built" ]; then
    if [ "$ACTION" = local ]; then
      note "$name" failed "no build at $built"
    else
      note "$name" failed "this download has no $name build, try the nightly"
    fi
    return
  fi
  refuse_web_owned "$built" "$name" && return

  if [ "$legacy" = 1 ]; then
    local unit="$SRC/stratnet/stratosphere-net.service" script="$SRC/stratnet/migrate-legacy.sh" out
    if [ ! -f "$unit" ] || [ ! -f "$script" ]; then
      note "$name" failed "this download cannot move mc-router and panel-edge to $name (the files for it are missing)"
      return
    fi
    refuse_web_owned "$script" "$name" && return
    if out="$(BIN_DIR="$BIN_DIR" SETTLE="$SETTLE" bash "$script" "$built" "$unit" 2>&1)"; then
      note "$name" updated "mc-router and panel-edge were moved to $name"
    else
      note "$name" failed "the move to $name failed, the old programs run again ($(printf '%s' "$out" | tail -n 1))"
    fi
    return
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

  # The whole listing is read before anything looks at it: `tar | grep -q` stops tar early, and with pipefail that counts as a failure.
  local listing artisan strip=0 prefix
  listing="$(tar -tzf "$tarball" 2> /dev/null)"
  artisan="$(printf '%s\n' "$listing" | grep -E '(^|/)artisan$' | awk '{ print length($0), $0 }' | sort -n | head -n1 | cut -d' ' -f2-)"
  if [ -z "$artisan" ]; then
    local size start
    size="$(wc -c < "$tarball" | tr -d ' ')"
    start="$(head -c 60 "$tarball" 2> /dev/null | tr -c '[:print:]' '.')"
    if [ -z "$listing" ]; then
      note panel failed "the download is not a tar.gz archive ($size bytes, it starts with: $start) from $URL"
    else
      note panel failed "the archive has no artisan, it is not a panel ($(printf '%s\n' "$listing" | head -n3 | tr '\n' ' '))"
    fi
    return 1
  fi
  # A release made with a folder around it (panel/artisan) is extracted without that folder.
  prefix="${artisan%artisan}"
  strip="$(printf '%s' "$prefix" | tr -cd '/' | wc -c | tr -d ' ')"
  [ "$prefix" = "./" ] && strip=0

  progress backup
  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
  backup="$BACKUP_DIR/panel-backup-$(date +%F-%H%M).tar.gz"
  # Everything the archive can touch except vendor and storage. The .env stays where it is, the archive has none.
  tar -czf "$backup" -C "$PANEL_DIR" .env app bootstrap config database public resources routes composer.json composer.lock tools 2> /dev/null || true
  # Keep the last three.
  ls -1t "$BACKUP_DIR"/panel-backup-*.tar.gz 2> /dev/null | tail -n +4 | while read -r old; do rm -f "$old"; done

  cd "$PANEL_DIR" || return 1
  progress install
  php artisan down > /dev/null 2>&1 || true

  # The shipped eggs are data of the archive: start from an empty folder so a removed or renamed file does not stay behind.
  rm -rf "$PANEL_DIR/database/Seeders/eggs"
  if ! out="$(tar -xzf "$tarball" -C "$PANEL_DIR" --strip-components="$strip" 2>&1)"; then
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

  progress migrate
  local failed=""
  if ! out="$(php artisan migrate --force 2>&1)"; then
    failed="the database migration failed: $(printf '%s' "$out" | tail -n 3)"
  fi
  local warn=""
  if ! php artisan db:seed --force > /dev/null 2>&1; then
    warn=" (the eggs were not updated)"
  fi
  progress finish
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

# Puts one of the backups back over the panel. The database is not rolled back (the backup has no database), so the page says so.
restore_backup() {
  local file="$BACKUP_DIR/$ARG" out safety
  if [[ ! "$ARG" =~ $BACKUP_NAME_RE ]] || [ ! -f "$file" ] || [ -L "$file" ]; then
    note restore failed "that backup does not exist"
    return 1
  fi
  cd "$PANEL_DIR" || return 1

  # What is there now is saved first, so a restore can be undone. It is never pruned here (the one restored from must stay).
  progress backup
  safety="$BACKUP_DIR/panel-backup-$(date +%F-%H%M)-before.tar.gz"
  tar -czf "$safety" -C "$PANEL_DIR" .env app bootstrap config database public resources routes composer.json composer.lock tools 2> /dev/null || true

  progress install
  php artisan down > /dev/null 2>&1 || true
  rm -rf "$PANEL_DIR/database/Seeders/eggs"
  if ! out="$(tar -xzf "$file" -C "$PANEL_DIR" 2>&1)"; then
    tar -xzf "$safety" -C "$PANEL_DIR" 2> /dev/null || true
    chown -R "$WEB_USER": "$PANEL_DIR"
    php artisan up > /dev/null 2>&1 || true
    note restore failed "could not extract the backup, the files from before were put back ($out)"
    return 1
  fi
  chown -R "$WEB_USER": "$PANEL_DIR"
  out="$(as_web composer install --no-dev --optimize-autoloader --no-interaction --working-dir="$PANEL_DIR" 2>&1)" \
    || note composer failed "composer install failed: $(printf '%s' "$out" | tail -n 3)"

  progress finish
  for c in view:clear config:clear route:clear cache:clear; do php artisan "$c" > /dev/null 2>&1 || true; done
  chown -R "$WEB_USER": "$PANEL_DIR"
  systemctl restart "$QUEUE_SERVICE" > /dev/null 2>&1 || true
  php artisan up > /dev/null 2>&1 || true
  note restore updated "restored $ARG. The database was not changed; the files from before are in $(basename "$safety")"
  return 0
}

case "$ACTION" in
  backups) exit 0 ;;
  delete-backup)
    if [[ "$ARG" =~ $BACKUP_NAME_RE ]] && [ -f "$BACKUP_DIR/$ARG" ] && [ ! -L "$BACKUP_DIR/$ARG" ]; then
      rm -f "$BACKUP_DIR/$ARG"
      note backup updated "deleted $ARG"
    else
      note backup failed "that backup does not exist"
    fi
    exit 0
    ;;
  restore)
    restore_backup
    exit 0
    ;;
  panel | panel-nightly)
    if ! update_panel; then
      exit 0
    fi
    ;;
esac

progress tools
update_net
exit 0
