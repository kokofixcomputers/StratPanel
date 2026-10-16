#!/usr/bin/env bash
# Builds the Fabric and NeoForge mods and puts them into public/helper next to the plugin, with their version in
# public/helper/version.json (the panel compares it with the version the mod reports to know when to offer an update).
#   helper-mod/scripts/bundle.sh [version]
# Without a version the mods get a timestamped snapshot version. The game is built for Java 25 from 26.1 on, so Gradle has to
# run on Java 25 (HELPER_MOD_JAVA_HOME, JAVA_HOME_25_X64 in CI, or the one macOS finds), the mods are Java 21 bytecode.
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)
PUBLIC="$HERE/../public/helper"
VERSION="${1:-$(date -u +%y%m%d-%H%M)-SNAPSHOT}"

# The major version of the java in a given home (empty home: the one on the PATH).
java_major() {
  local java="java"
  if [ -n "${1:-}" ]; then java="$1/bin/java"; fi
  "$java" -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p'
}

FOUND=""
for home in "${HELPER_MOD_JAVA_HOME:-}" "${JAVA_HOME_25_X64:-}" "${JAVA_HOME:-}" "PATH"; do
  if [ "$home" = "PATH" ]; then
    MAJOR=$(java_major "" || true)
  elif [ -n "$home" ] && [ -x "$home/bin/java" ]; then
    MAJOR=$(java_major "$home" || true)
  else
    continue
  fi
  if [ -n "$MAJOR" ] && [ "$MAJOR" -ge 25 ]; then
    FOUND="$home"
    break
  fi
done
if [ -z "$FOUND" ]; then
  echo "Gradle has to run on Java 25 to build the mods. Set HELPER_MOD_JAVA_HOME to a JDK 25." >&2
  exit 1
fi
if [ "$FOUND" = "PATH" ]; then unset JAVA_HOME; else export JAVA_HOME="$FOUND"; fi

cd "$HERE"
chmod +x gradlew
./gradlew --no-daemon test mods "-Pmod_version=$VERSION"

mkdir -p "$PUBLIC"
cp "build/libs/stratosphere-fabric-$VERSION.jar" "$PUBLIC/Stratosphere-fabric.jar"
cp "build/libs/stratosphere-neoforge-$VERSION.jar" "$PUBLIC/Stratosphere-neoforge.jar"

# Adds the mods to version.json and keeps what the plugin build wrote there.
python3 - "$PUBLIC/version.json" "$VERSION" <<'PY'
import json, os, sys

path, version = sys.argv[1], sys.argv[2]
info = json.load(open(path)) if os.path.exists(path) else {}
info["mods"] = {
    "fabric": {"version": version, "file": "Stratosphere-fabric.jar"},
    "neoforge": {"version": version, "file": "Stratosphere-neoforge.jar"},
}
with open(path, "w") as out:
    json.dump(info, out, indent=2)
    out.write("\n")
PY
echo "Helper mods $VERSION bundled in $PUBLIC."
