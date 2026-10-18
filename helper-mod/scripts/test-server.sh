#!/usr/bin/env bash
# Starts a real server with the helper installed, sends the panel's commands to it and prints what came back.
#   [FABRIC_LOADER=0.20.0] scripts/test-server.sh <fabric|neoforge> <1.21.1|26.2|26.3> [work dir]
# (use another work dir for another loader version: the downloaded server launcher is cached by Minecraft version)
# Needs the jars from `./gradlew mods`, Java 21 for 1.21.1 and Java 25 for 26.x (JAVA21 / JAVA25 override the defaults).
# The server runs with -Dstratosphere.selftest=true, which adds an unconnected player "TestBot" with a few items.
set -euo pipefail

LOADER=${1:?loader}
MC=${2:?minecraft version}
WORK=${3:-${TMPDIR:-/tmp}/stratosphere-servers}
HERE=$(cd "$(dirname "$0")/.." && pwd)
JAVA21=${JAVA21:-/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java}
JAVA25=${JAVA25:-$(ls -d "$HOME"/.gradle/jdks/*25*/*/Contents/Home/bin/java | head -1)}
JAVA=$JAVA25
case "$MC" in 1.*) JAVA=$JAVA21 ;; esac

case "$MC" in
  1.21.1) FABRIC_API_VERSION="0.116.17+1.21.1"; NEOFORGE_VERSION="21.1.262" ;;
  26.2) FABRIC_API_VERSION="0.161.0+26.2"; NEOFORGE_VERSION="26.2.0.93" ;;
  26.3) FABRIC_API_VERSION="0.163.0+26.3"; NEOFORGE_VERSION="26.3.0.84" ;;
  1.21.4) FABRIC_API_VERSION="0.119.4+1.21.4"; NEOFORGE_VERSION="21.4.161" ;; # not supported: checks that the helper steps aside
  *) echo "unknown Minecraft version $MC" >&2; exit 1 ;;
esac
FABRIC_LOADER=${FABRIC_LOADER:-0.19.5}
FABRIC_INSTALLER=${FABRIC_INSTALLER:-1.1.2}

DIR="$WORK/$LOADER-$MC"
CACHE="$WORK/cache"
mkdir -p "$DIR/mods" "$CACHE"
cd "$DIR"

fetch() { [ -s "$CACHE/$2" ] || curl -fsSL "$1" -o "$CACHE/$2"; }

if [ "$LOADER" = fabric ]; then
  fetch "https://meta.fabricmc.net/v2/versions/loader/$MC/$FABRIC_LOADER/$FABRIC_INSTALLER/server/jar" "fabric-server-$MC.jar"
  cp "$CACHE/fabric-server-$MC.jar" server.jar
  API=$FABRIC_API_VERSION
  fetch "https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/$API/fabric-api-$API.jar" "fabric-api-$API.jar"
  cp "$CACHE/fabric-api-$API.jar" mods/
  rm -f mods/stratosphere-*.jar
  cp "$(ls -t "$HERE"/build/libs/stratosphere-fabric-*.jar | head -1)" mods/
  START=("$JAVA" -Dstratosphere.selftest=true -Xmx1G -jar server.jar nogui)
else
  V=$NEOFORGE_VERSION
  fetch "https://maven.neoforged.net/releases/net/neoforged/neoforge/$V/neoforge-$V-installer.jar" "neoforge-$V-installer.jar"
  if [ ! -d libraries ]; then "$JAVA" -jar "$CACHE/neoforge-$V-installer.jar" --installServer . >install.log 2>&1; fi
  rm -f mods/stratosphere-*.jar
  cp "$(ls -t "$HERE"/build/libs/stratosphere-neoforge-*.jar | head -1)" mods/
  echo "-Dstratosphere.selftest=true -Xmx1G" > user_jvm_args.txt
  START=("$JAVA" @user_jvm_args.txt "@libraries/net/neoforged/neoforge/$V/unix_args.txt" nogui)
fi

echo "eula=true" > eula.txt
cat > server.properties <<PROPS
online-mode=false
level-type=minecraft\:flat
view-distance=2
simulation-distance=2
spawn-protection=0
server-port=0
PROPS
rm -f stratosphere.commands.json logs/latest.log

COMMANDS=(
  "stratpanelhidepanellogs handshake"
  "stratpanelhidepanellogs perf"
  "stratpanelhidepanellogs vitals"
  "stratpanelhidepanellogs inventory TestBot"
  "stratpanelhidepanellogs swap TestBot 2 3"
  "stratpanelhidepanellogs swap TestBot 0 36"
  "stratpanelhidepanellogs swap TestBot 36 5"
  "stratpanelhidepanellogs swap TestBot 5 36"
  "stratpanelhidepanellogs delete TestBot 1"
  "stratpanelhidepanellogs inventory TestBot"
  "stratpanelhidepanellogs ender TestBot"
  "stratpanelhidepanellogs enderswap TestBot 0 5"
  "stratpanelhidepanellogs enderdelete TestBot 5"
  "stratpanelhidepanellogs ender TestBot"
  "stratpanelhidepanellogs shulker TestBot inv 4"
  "stratpanelhidepanellogs shulkerswap TestBot inv 4 0 5"
  "stratpanelhidepanellogs shulkerswap TestBot inv 4 1 26"
  "stratpanelhidepanellogs shulkerdelete TestBot inv 4 5"
  "stratpanelhidepanellogs shulker TestBot ender 10"
  "stratpanelhidepanellogs shulker TestBot inv 5"
  "stratpanelhidepanellogs shulkerswap TestBot inv 4 0 99"
  "stratpanelhidepanellogs inventory TestBot"
  "stratpanelhidepanellogs heal TestBot"
  "stratpanelhidepanellogs health TestBot -5"
  "stratpanelhidepanellogs hunger TestBot -7"
  "stratpanelhidepanellogs levels TestBot 12"
  "stratpanelhidepanellogs feed TestBot"
  "stratpanelhidepanellogs nosuch Nobody"
  "time set 13000"
  "weather thunder"
  "stratpanelhidepanellogs perf"
  "weather rain"
  "stratpanelhidepanellogs perf"
  "time set 6000"
  "weather clear"
  "stratpanelhidepanellogs perf"
  "stratpanelhidepanellogs refresh"
)

{
  # Wait until the world is loaded (at most 4 minutes), then give the helper a few seconds (it scans the commands after 40
  # ticks).
  for _ in $(seq 240); do
    grep -q 'Done (' logs/latest.log 2>/dev/null && break
    sleep 1
  done
  sleep 4
  for c in "${COMMANDS[@]}"; do echo "$c"; sleep 0.7; done
  sleep 2
  echo stop
} | "${START[@]}" > console.log 2>&1 &
SERVER=$!
# A server that does not stop is killed after 6 minutes.
( sleep 360; kill "$SERVER" 2>/dev/null ) &
WATCHDOG=$!
wait "$SERVER" || true
kill "$WATCHDOG" 2>/dev/null || true

echo "=== $LOADER $MC: lines from the helper"
grep -E "::stratpanel::" console.log | sed -E 's/^(.{0,60}).*(::stratpanel:: )/\1 ... \2/' | cut -c1-330 || true
echo "=== problems"
grep -E "Exception|ERROR|WARN.*Stratosphere|could not start" console.log | head -20 || true
echo "=== commands file"
if [ -s stratosphere.commands.json ]; then head -c 400 stratosphere.commands.json; echo; else echo "(none)"; fi
