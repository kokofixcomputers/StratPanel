#!/usr/bin/env bash
# Builds panel.tar.gz (and panel-ui.tar.gz) in the repository root from this checkout, with the same contents as
# .github/scripts/package.sh. That script deletes directories in place and is meant for CI, this one only reads.
# Run it after the frontend is built (webpack --mode production) and, if the helper plugin or the tools changed,
# after they were built too: public/helper, public/tools and tools/mc-router/dist are taken as they are.
set -euo pipefail
cd "$(dirname "$0")/.."

LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT

# Tracked files the CI archive has: every top level path that is not a dotfile, plus a few dotfiles, minus what is not
# needed on a server.
{
  git ls-files --cached --others --exclude-standard
  find public/assets public/themes public/helper public/tools tools/mc-router/dist dist/extensions -type f 2>/dev/null
} | sort -u | grep -v -E '^(node_modules|tests|preview|helper-plugin|helper-mod|docs|\.serena|CONTRIBUTING\.md|flake\.lock|flake\.nix|phpunit\.xml|shell\.nix|panel(-ui)?\.tar\.gz)(/|$)' \
  | grep -v -E '(^|/)(\._[^/]*|\.DS_Store)$' \
  | grep -E '^([^.]|\.editorconfig$|\.env\.example$|\.eslintignore$|\.eslintrc\.js$|\.gitignore$|\.prettierrc\.json$)' \
  | while IFS= read -r file; do [ -e "$file" ] && printf '%s\n' "$file"; done > "$LIST"

# No macOS extended attributes or ._ files in the archives, they are junk on a Linux server.
export COPYFILE_DISABLE=1
tar -czf panel.tar.gz -T "$LIST"
grep -E '^public/(assets|themes|helper|tools)/' "$LIST" | tar -czf panel-ui.tar.gz -T -

# macOS leaves ._ files and .DS_Store behind, and the seeder reads every file of an egg folder. Fail instead of shipping one.
for archive in panel.tar.gz panel-ui.tar.gz; do
  if tar -tzf "$archive" | grep -E '(^|/)(\._[^/]*|\.DS_Store)$'; then
    echo "$archive contains macOS junk files (listed above)" >&2
    exit 1
  fi
done

ls -lh panel.tar.gz panel-ui.tar.gz
