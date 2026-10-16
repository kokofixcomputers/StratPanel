#!/usr/bin/env bash
# Runs as root when the panel asks for it (see stratosphere-updater.path): puts the newest router (mc-router) and edge (panel-edge) in
# place and restarts them. The panel can ask for exactly two things, written as one word in $PANEL_DIR/storage/app/updates/request:
#   local     use the binaries in $PANEL_DIR/tools/*/dist
#   download          fetch the panel.tar.gz of the latest release first and use the binaries in it
#   download-nightly  the same with the nightly build
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
  RESULTS+=("{\"name\":\"$1\",\"status\":\"$2\",\"detail\":\"${3//\"/\'}\"}")
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
  download | download-nightly)
    URL="$PANEL_TAR_URL"
    [ "$ACTION" = download-nightly ] && URL="$PANEL_TAR_NIGHTLY_URL"
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
    FOUND="$(find "$TMP/x" -type d -path '*tools/*/dist' | head -n1)"
    if [ -z "$FOUND" ]; then
      note download failed "the archive has no router or edge binaries"
      exit 0
    fi
    SRC="$(dirname "$(dirname "$FOUND")")"
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

update mc-router
update panel-edge
exit 0
