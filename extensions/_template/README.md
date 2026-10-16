# Extension template

Start a new extension from this folder:

```bash
npm run ext:new -- my-cool-extension          # makes extensions/my-cool-extension from this template
npm run ext:build -- extensions/my-cool-extension   # makes dist/extensions/my-cool-extension-1.0.0.stratext
php artisan p:extension:install dist/extensions/my-cool-extension-1.0.0.stratext --enable
```

A `.stratext` is a zip file with `extension.json` at its top. `ext:build` checks the manifest, minifies the JavaScript and CSS under `web/`
(`--no-minify` leaves them as they are), and zips the folder. You could also zip it yourself.

## What is in it

| File | What it is |
|---|---|
| `extension.json` | The manifest: who it is, what it adds and which settings an admin can set. |
| `src/` | PHP. `php.main` is the class the panel starts, it extends `Pterodactyl\Extensions\Extension`. |
| `web/` | What runs in the browser. Only what is listed in `web.scripts` and `web.styles` is loaded. |
| `database/migrations/` | Optional. Migrations the installer runs, name the folder in `"migrations"`. |

### extension.json

```json
{
  "api": 1,                                   // the version of the extension API (1)
  "id": "my-extension",                       // a-z, 0-9 and -, 3 to 48 characters. Never changes.
  "name": "My Extension", "version": "1.0.0", // the version is x.y.z
  "description": "...", "author": "...", "homepage": "https://...", "license": "MIT",
  "php": { "main": "Vendor\\Name\\Main", "autoload": { "Vendor\\Name\\": "src/" } },
  "web": { "scripts": ["web/index.js"], "styles": ["web/style.css"] },
  "migrations": "database/migrations",
  "settings": [ { "key": "x", "label": "X", "type": "text|textarea|number|boolean|select|password", "default": "", "help": "..." } ]
}
```

Settings are stored for you and get a form under Admin > Extensions. `select` takes `"options": ["a", "b"]` or
`{"a": "Label A"}`, `number` takes `min` and `max`, `textarea` takes `rows`, text and textarea take `max_length`.
Read them with `$this->context->setting('key')`.

## The PHP side (`$this->context`)

| | |
|---|---|
| `filter($hook, fn)` / `on($hook, fn)` | Change a value of the panel / be told that something happened. |
| `clientRoutes(fn)` | Routes for logged in people at `/api/client/extensions/<id>/`. |
| `adminRoutes(fn)` | Pages for admins at `/admin/extensions/<id>/x/`. |
| `publicRoutes(fn)` | No login, at `/api/extensions/<id>/`. Rate limited, check what comes in. |
| `setting($key)`, `settings()` | What the admin set. |
| `store()` | A key value store of your own (`get`, `put`, `forget`, `all`, `has`), no migration needed. |
| `path($file)`, `log()`, `manifest()` | Your folder, the logger, your manifest. |

The hooks (see `app/Extensions/Hooks.php`):

| Hook | Value | What it is for |
|---|---|---|
| `router.state` | array, with the `Server` and `ServerDomain` | What the Minecraft router is told about a server. Add `notice => [label, message]` to change what players see while the server cannot be joined. |
| `router.domains` | array | The list of domains the router is given. |
| `server.attributes` | array, with the `Server` and the `User` | What the client API tells about a server. |
| `site.configuration` | array | What the pages get in `window.SiteConfiguration`. |

In `clientRoutes`, `{server}` is already the `Server` model (found by uuid, like everywhere in the client API), so type the argument as
`Server $server`. Check what the user may do yourself, for example `$request->user()->can(Permission::ACTION_SETTINGS_RENAME, $server)`.
Routes are added while the panel starts, so they are not there when Laravel's route cache is used (`php artisan route:cache`): do not use
it on a panel with extensions that add routes.

A filter has to return the same kind of value it was given (an array stays an array), anything else is ignored and written down.
You can use the rest of the panel too, it is PHP in the panel: models, services, events, the `Route` facade.

## The browser side (`window.Stratosphere`)

```js
Stratosphere.register({ id: 'my-extension', setup(api) { ... } })
```

`api` has `React` and `http` (the panel's own, so hooks work and requests carry the login), and:

- `api.slot(name, Component, { order })` puts a component on a page. The slots: `server.console` and `server.settings` (props: `{ server: { id, uuid } }`)
  and `dashboard.top`.
- `api.serverPage({ path, label, component, permission })` adds a page to the menu of every server, at `/server/<id>/ext/<extension>/<path>`.

## When something goes wrong

An error in `register()`, `boot()`, a hook or a route is caught and the extension is left out. Mistakes PHP can not catch (a class that
breaks the rules of its parent, for example) kill the request they happen in; the panel notices that the extension never finished starting
and turns it off, so the next request works.

The panel never stops for an extension. A failure (starting, a hook, a route, a component, a script that does not load) is caught, the
extension is left out of that request, and the reason is on the Extensions page (and in `storage/logs`). If an extension keeps the
panel from working at all, set `STRATOSPHERE_EXTENSIONS=false` in `.env`, or `php artisan p:extension:disable <id>`.
