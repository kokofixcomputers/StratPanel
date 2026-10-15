#!/bin/bash
# Updates an installed panel from a panel.tar.gz (the full archive, PHP included), by default the one in your home folder.
#   sudo -v && bash tools/update-panel.sh [path/to/panel.tar.gz]
# For the web interface alone, `php artisan p:update-ui` is enough.
set -euo pipefail

PANEL=/var/www/pterodactyl
WEBUSER=www-data # apache, nginx or www-data, whichever your web server runs as
TARBALL="${1:-$HOME/panel.tar.gz}"

if [ ! -f "$TARBALL" ]; then
  echo "No archive at $TARBALL" >&2
  exit 1
fi

# Back up what is about to be overwritten. Everything the archive can touch except vendor and storage, which are rebuilt
# or never in it. The .env stays where it is, the archive has none.
BACKUP="$HOME/panel-backup-$(date +%F-%H%M).tar.gz"
sudo tar -czf "$BACKUP" -C "$PANEL" .env app bootstrap config database public resources routes composer.json composer.lock tools 2>/dev/null || true
echo "Backup written to $BACKUP"

cd "$PANEL"
sudo php artisan down || true
# Whatever happens below, do not leave the panel in maintenance mode.
trap 'sudo php artisan up || true' EXIT

# The shipped eggs are data of the archive, nobody edits the files. Starting from an empty folder means a file that was
# removed or renamed in a newer release does not stay behind for the seeder to read.
sudo rm -rf "$PANEL/database/Seeders/eggs"

# Extract over the panel. Files that are not in the archive, such as .env, storage/ and public/branding (uploaded
# favicons), are left alone.
sudo tar -xzf "$TARBALL" -C "$PANEL"

# PHP dependencies, in case composer.lock changed. Runs as the web user so the files keep the right owner.
sudo chown -R "$WEBUSER":"$WEBUSER" "$PANEL"
sudo -u "$WEBUSER" composer install --no-dev --optimize-autoloader --no-interaction

# Apply new database migrations
sudo php artisan migrate --force
# Eggs can be seeded again later with: php artisan db:seed --class=EggSeeder --force
sudo php artisan db:seed --force || echo "WARNING: seeding failed, see above. The panel works, the eggs were not updated." >&2

# Clear caches
sudo php artisan view:clear
sudo php artisan config:clear
sudo php artisan route:clear
sudo php artisan cache:clear

# Fix ownership again, the migrations and caches above ran as root
sudo chown -R "$WEBUSER":"$WEBUSER" "$PANEL"

# Restart the queue worker so it picks up new code
sudo systemctl restart pteroq

echo "Done. Hard-refresh the browser (Ctrl/Cmd+Shift+R)."
