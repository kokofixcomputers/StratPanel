#!/usr/bin/env bash
# Moves a machine that runs the two old programs (mc-router and panel-edge, each its own service) to stratosphere-net, which is both in
# one. It is what the installer and the updater do when they find the old services. The settings are carried over (the names that were
# the same for the two get their prefix: ROUTER_LISTEN, EDGE_LISTEN, ...) and when the new service does not stay up the old ones are
# started again, so nothing is lost.
#
#   migrate-legacy.sh BINARY SERVICE_FILE
#
# Run as root. The old env files and service files are kept in $LEGACY_BACKUP_DIR (/var/backups/stratosphere/legacy).
set -uo pipefail

BINARY="${1:?the stratosphere-net binary}"
UNIT="${2:?the stratosphere-net.service file}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
ETC="${ETC:-/etc}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
LEGACY_BACKUP_DIR="${LEGACY_BACKUP_DIR:-/var/backups/stratosphere/legacy}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
SETTLE="${SETTLE:-3}"

ROUTER_ENV="$ETC/mc-router.env"
EDGE_ENV="$ETC/panel-edge.env"
NEW_ENV="$ETC/stratosphere-net.env"

if [ -f "$NEW_ENV" ]; then
  echo "stratosphere-net is installed already, nothing to move."
  exit 0
fi
if [ ! -f "$ROUTER_ENV" ] && [ ! -f "$EDGE_ENV" ]; then
  echo "Neither mc-router nor panel-edge is installed, nothing to move."
  exit 0
fi

# The names that both programs had get a prefix for the one they belong to.
prefixed() { # prefix file
  sed -E "s/^(PANEL_URL|LISTEN|REFRESH)=/$1\1=/" "$2"
}

umask 077
TMP="$NEW_ENV.new"
{
  echo "# Made from the settings of mc-router and panel-edge, see tools/stratnet/stratosphere-net.env.example."
  if [ -f "$ROUTER_ENV" ]; then
    echo "ENABLE_ROUTER=1"
    prefixed ROUTER_ "$ROUTER_ENV"
  else
    echo "ENABLE_ROUTER=0"
  fi
  echo
  if [ -f "$EDGE_ENV" ]; then
    echo "ENABLE_EDGE=1"
    prefixed EDGE_ "$EDGE_ENV"
  else
    echo "ENABLE_EDGE=0"
  fi
} > "$TMP"
umask 022

had_router=0
had_edge=0
[ -f "$ROUTER_ENV" ] && had_router=1
[ -f "$EDGE_ENV" ] && had_edge=1

# The old ones give up their ports first, the new one needs them.
[ "$had_router" = 1 ] && $SYSTEMCTL stop mc-router > /dev/null 2>&1
[ "$had_edge" = 1 ] && $SYSTEMCTL stop panel-edge > /dev/null 2>&1

install -m 755 "$BINARY" "$BIN_DIR/stratosphere-net.new" && mv "$BIN_DIR/stratosphere-net.new" "$BIN_DIR/stratosphere-net"
install -m 644 "$UNIT" "$UNIT_DIR/stratosphere-net.service"
mv "$TMP" "$NEW_ENV"
$SYSTEMCTL daemon-reload
$SYSTEMCTL enable stratosphere-net > /dev/null 2>&1
$SYSTEMCTL restart stratosphere-net

sleep "$SETTLE"
if $SYSTEMCTL is-active --quiet stratosphere-net; then
  mkdir -p "$LEGACY_BACKUP_DIR"
  for name in mc-router panel-edge; do
    $SYSTEMCTL disable "$name" > /dev/null 2>&1
    [ -f "$UNIT_DIR/$name.service" ] && mv "$UNIT_DIR/$name.service" "$LEGACY_BACKUP_DIR/$name.service"
    [ -f "$ETC/$name.env" ] && mv "$ETC/$name.env" "$LEGACY_BACKUP_DIR/$name.env"
    [ -f "$BIN_DIR/$name" ] && mv "$BIN_DIR/$name" "$LEGACY_BACKUP_DIR/$name"
  done
  $SYSTEMCTL daemon-reload
  echo "Moved to stratosphere-net. The old settings and programs are in $LEGACY_BACKUP_DIR."
  exit 0
fi

# The new one does not stay up: put it away and start the old ones again.
$SYSTEMCTL stop stratosphere-net > /dev/null 2>&1
$SYSTEMCTL disable stratosphere-net > /dev/null 2>&1
rm -f "$NEW_ENV" "$UNIT_DIR/stratosphere-net.service"
$SYSTEMCTL daemon-reload
[ "$had_router" = 1 ] && $SYSTEMCTL start mc-router > /dev/null 2>&1
[ "$had_edge" = 1 ] && $SYSTEMCTL start panel-edge > /dev/null 2>&1
echo "stratosphere-net did not start, the old programs were started again." >&2
exit 1
