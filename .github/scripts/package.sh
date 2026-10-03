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

if [ -n "$VERSION" ]; then
  sed -i.bak "s/'canary'/'${VERSION}'/" config/app.php && rm -f config/app.php.bak
fi

# Things that are not needed on a server.
rm -rf node_modules tests preview CONTRIBUTING.md flake.lock flake.nix phpunit.xml shell.nix .serena

# Same layout as the official Pterodactyl release archive, plus the router and the egg.
tar -czf panel.tar.gz * .editorconfig .env.example .eslintignore .eslintrc.js .gitignore .prettierrc.json
ls -lh panel.tar.gz
