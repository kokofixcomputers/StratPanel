# Extensions

An extension adds to the panel without changing its files: new API routes, admin pages, settings, a card on the Settings page of a
server, a page in the server menu, or a change to what the Minecraft router is told. It is a `.stratext` file (a zip with an
`extension.json`). An extension is PHP and JavaScript that runs as part of the panel with the same access to everything in it, so
install extensions only from people you trust.

## For admins

```bash
php artisan p:extension:install path/to/offline-motd-1.0.0.stratext   # asks first, installs it off; --enable switches it on
php artisan p:extension:list
php artisan p:extension:enable offline-motd
php artisan p:extension:disable offline-motd
php artisan p:extension:remove offline-motd [--purge]                 # --purge also deletes what it stored
```

Installing the same extension again needs `--force`; its settings, on/off state and stored data are kept. The Extensions page in the
admin area switches extensions on and off and has a settings form for each extension that declares settings.

Extensions live in `storage/extensions/`, which stays when the panel is updated. A prebuilt Offline MOTD is in `dist/extensions/` of the
release (or build it, see below).

**When something breaks.** A failing extension is left out and the panel carries on; the reason is on the Extensions page and in
`storage/logs`. An extension that kills PHP outright is turned off by the next request. If the panel does not work at all, set
`STRATOSPHERE_EXTENSIONS=false` in `.env` (nothing is started) or run `php artisan p:extension:disable <id>`.

Do not use `php artisan route:cache` on a panel with extensions that add routes.

## For developers

```bash
npm run ext:new -- my-extension "My Extension"     # copies extensions/_template to extensions/my-extension
npm run ext:build -- extensions/my-extension       # checks it, minifies the browser files, writes dist/extensions/my-extension-1.0.0.stratext
```

`extensions/_template/README.md` documents everything: the manifest, the PHP context, the hooks, the routes, the browser API. 
`extensions/offline-motd/` is a complete small example (a hook that changes what the router says, routes, a stored value per server, a
settings card).

## Offline MOTD

Shows a message instead of the router's own wording when a server is off. The admin sets a general message, a label and whether servers
may set their own; an owner (or anyone who may rename the server) sets it from the Settings page of the server. `{server}` becomes the
server name, `&` colour codes work. Sleeping servers keep the router's "asleep, join to wake it" unless the admin includes them.
