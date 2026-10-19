# Dashboard: search, filters, folders and stars

The list of servers on the dashboard can be searched, filtered, sorted and put in folders.

* **Search** looks in the name, description, address and node; every word has to match. `Esc` clears it.
* **Filters**: online / offline / other (starting, stopping, suspended, installing, on a node in maintenance), starred, owned by me or
  shared with me (only shown when there are shared servers) and node (only when there is more than one). The state comes from the same
  numbers the rows show; the dashboard looks at all servers of the person (five at a time, every 30 seconds), not only at the visible ones.
* **Sort**: by name (numbers the way people count: "Lobby 2" before "Lobby 10") or running servers first. Starred servers always come first.
* **Folders** are per person, kept on the panel (`dashboard_folders`, `dashboard_server_prefs`), so they follow the person to another
  browser. A server can be in one folder. Use the folder button of a server, drag a server onto a folder, or make a folder from the menu
  of a server. A folder can be renamed, moved up or down, folded (kept in the browser) and deleted; deleting it keeps its servers.
  At most 50 folders per person. Another user of the same server has their own folders and stars.
* The servers of **other users** (admins, "Others' servers") stay paged and are searched by the panel; they have no folders or stars.
* The servers of the person are loaded 100 at a time, up to 1000.

API (client): `GET /api/client/dashboard` (folders and marked servers), `POST /dashboard/folders`, `PATCH|DELETE /dashboard/folders/{id}`,
`POST /dashboard/folders/order`, `PUT /dashboard/servers/{uuid}` with `folder` (id or null) and/or `starred`. Every call answers with the whole
layout. A server the person cannot reach, or a folder of someone else, is a 404.
