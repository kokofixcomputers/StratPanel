#!/usr/bin/env bash
# Builds panel.tar.gz in the repository root. Expects the frontend to be built already (yarn build:production).
#   .github/scripts/package.sh [version]
set -euo pipefail

VERSION="${1:-}"

echo "Building the Minecraft router..."
(
  cd tools/mc-router
  go test ./...
  for arch in amd64 arm64; do
    CGO_ENABLED=0 GOOS=linux GOARCH="$arch" go build -trimpath -ldflags "-s -w" -o "dist/mc-router-linux-$arch" .
  done
)

echo "Building the helper plugin..."
(
  cd helper-plugin
  # The plugin version follows the panel version when there is one, otherwise it gets a timestamped snapshot version.
  GRADLE_ARGS=()
  if [ -n "$VERSION" ]; then GRADLE_ARGS+=("-Pver=${VERSION}"); fi
  chmod +x gradlew
  ./gradlew --no-daemon test shadowJar ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"}
)
JAR="$(ls -t helper-plugin/build/libs/*.jar 2>/dev/null | head -n 1 || true)"
if [ -z "$JAR" ]; then
  echo "The helper plugin did not build, there is no jar in helper-plugin/build/libs" >&2
  exit 1
fi
# The panel installs this jar on new Paper and Spigot servers (see resources/scripts/lib/helperPlugin.ts).
mkdir -p public/helper
cp "$JAR" public/helper/StratPanel.jar
PLUGIN_VERSION="$(unzip -p public/helper/StratPanel.jar plugin.yml | sed -n 's/^version: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p' | head -n 1)"
printf '{\n  "version": "%s",\n  "file": "StratPanel.jar",\n  "platforms": ["paper", "spigot", "purpur"]\n}\n' "$PLUGIN_VERSION" > public/helper/version.json
echo "Helper plugin ${PLUGIN_VERSION} bundled."

if [ -n "$VERSION" ]; then
  sed -i.bak "s/'canary'/'${VERSION}'/" config/app.php && rm -f config/app.php.bak
fi

# Things that are not needed on a server.
rm -rf node_modules tests preview helper-plugin docs CONTRIBUTING.md flake.lock flake.nix phpunit.xml shell.nix .serena

# Same layout as the official Pterodactyl release archive, plus the router, the egg and the bundled helper plugin.
tar -czf panel.tar.gz * .editorconfig .env.example .eslintignore .eslintrc.js .gitignore .prettierrc.json
ls -lh panel.tar.gz
