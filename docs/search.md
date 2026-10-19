# Search box, player counts and player actions

**The search box** is in the top bar of every page except sign in and sign up (and, with the same list, in the admin pages). Open it by clicking, with
`Ctrl`/`Cmd` + `K`, or with `/` when not typing. It finds:

* **Servers** by name, description, address or node. Admins also find servers of other users and get the admin page of each one.
* **Actions of the server that is open**: start, restart, stop, kill, "Back up now" and all its pages (Files, Players, Backups, ...), as far as the
  person's permissions go.
* **Power by name from anywhere**: `restart survival`, `stop lobby`, `start creative` offer the servers that match.
* **Admin pages and actions** (Updates, Update the panel, Restore a panel backup, Create a server, Settings pages, ...), only the ones the person may open.
  The list is made on the panel (`App\\Services\\Palette\\AdminDestinations`, `GET /api/client/palette`) with the same permissions as the routes.
* Account pages, and switching the theme.

The dashboard version is React (`components/palette`, `lib/palette.ts`); the admin pages are not part of the React app, so they use a plain script
(`public/js/admin-palette.js`). A test (`adminPalette.spec.ts`) keeps their matching identical.

**Player counts** on the server list come from the servers themselves: the panel sends each running server the "server list ping" every Minecraft
client sends (`App\\Services\\Minecraft\\ServerListPing`, `GET /api/client/dashboard/players`). Nothing needs to be installed on the server, but **the
panel has to be able to reach the game port** (the address of the default allocation, or the node when that is 0.0.0.0). A server that does not answer
simply shows no number. Answers are kept for 15 seconds; at most 100 servers per request.

**Whisper, kick and ban** are buttons in the player window. They send `msg`, `kick` and `ban` on the console of the server (so the server has to be
running and the person needs the console permission). A reason or message is made one line, and a name that could carry a second command is refused.
