# Splitting a server

The owner of a server can split it into several servers that share its memory, disk space and CPU: **Split** under *More* in the server menu.

* Every part is a server of its own, on the same node, with its own port, files, console and power buttons. It starts with the same software
  (egg, image, startup command and variables) as the first server, and it appears on the dashboard like any server.
* The parts share one total. The first server keeps what the others do not have, so moving a slider on a part takes from (or gives to) the
  first server. Moving resources from one part to another is lowering one and raising the other. **Save** applies it; the new limits are sent
  to Wings straight away, a running server picks them up on its next start where Wings needs that.
* A part gets at least 512 MB memory, 1 GB disk and 50% CPU, and the first server keeps at least that too. Up to nine parts per server.
* Deleting a part gives its share back to the first server. Deleting the first server frees what it had; the parts stay as servers of their own.
* A part is not split again; open the split page of any part to manage the whole group.
* Only a server with limits can be split: 0 (no limit) on memory, disk or CPU leaves nothing to divide.
* Resource pools: the total does not change, so the pool is not used up by splitting, except that each part needs a port (an allocation of the pool).
  A part has no backups and no databases; the allocation and backup limits of a part are set by an admin if it needs more.

Admins who may update servers can split any server. The API is `GET/POST/PUT /api/client/servers/{server}/split` and `DELETE .../split/{part}`.
Code: `app/Services/Servers/ServerSplitService.php`, `resources/scripts/components/server/split`. Tests: `tests/Integration/Split`.
