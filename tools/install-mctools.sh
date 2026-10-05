#!/usr/bin/env bash
# Builds the Minecraft tools (https://github.com/kokofixcomputers/mctoolsv3) and puts them into public/tools, where the
# panel's Tools tab shows them in an iframe. Needs git and Node 18+; pnpm is fetched with npx when it is not installed.
#
#   tools/install-mctools.sh [branch-or-tag]
#
#   MCTOOLS_REPO  where to clone from (default: the GitHub repository)
#   MCTOOLS_SRC   build an existing checkout instead of cloning, for working on the tools next to the panel
#   MCTOOLS_BASE  the url path the panel serves them from (default: /tools/, public/tools is what the panel expects)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${MCTOOLS_REPO:-https://github.com/kokofixcomputers/mctoolsv3.git}"
REF="${1:-}"
BASE="${MCTOOLS_BASE:-/tools/}"
SRC="${MCTOOLS_SRC:-$ROOT/.cache/mctoolsv3}"

if [ -z "${MCTOOLS_SRC:-}" ]; then
  if [ -d "$SRC/.git" ]; then
    echo "Updating $SRC"
    git -C "$SRC" fetch --depth 1 origin ${REF:+"$REF"}
    git -C "$SRC" reset --hard FETCH_HEAD
  else
    echo "Cloning $REPO"
    mkdir -p "$(dirname "$SRC")"
    git clone --depth 1 ${REF:+--branch "$REF"} "$REPO" "$SRC"
  fi
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx --yes pnpm@10)
fi

cd "$SRC"
"${PNPM[@]}" install --frozen-lockfile
VITE_BASE="$BASE" "${PNPM[@]}" build

rm -rf "$ROOT/public/tools"
cp -R "$SRC/dist" "$ROOT/public/tools"
echo "Minecraft tools installed in public/tools ($(du -sh "$ROOT/public/tools" | cut -f1))."
