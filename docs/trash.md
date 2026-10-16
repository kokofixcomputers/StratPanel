# Trash bin

Off by default. An admin turns it on under **Admin > Settings > Trash** and chooses how many days things are kept (30 by default).
With it on, what people delete from a server is kept in the trash bin of that server instead of being gone:

- **Files and folders** deleted in the file manager (and by the Content, Worlds and other pages that delete on behalf of the user).
  They are moved to a hidden folder, `.stratosphere-trash`, in the root of the server, on the node: nothing is copied, nothing leaves
  the disk. The file manager never shows that folder and refuses to touch it.
- **Schedules** (with their tasks). They are hidden and stop running while they are in the trash bin.

Not kept, because they can not be put back: databases, backups, whole servers, and what is deleted over SFTP or from the console.

## Who can do what

Per server, with subuser permissions (owners and anybody who may open every server have all of them):

| Permission | |
|---|---|
| `trash.read` | See the trash bin (the Trash page on the server's menu, shown while the trash bin is on). |
| `trash.restore` | Recover things. Also needs the permission to make that kind of thing: `file.create` for files, `schedule.create` for schedules. |
| `trash.delete` | Delete things from the trash bin for good, empty it, and delete files without moving them to it. |

Admins use the roles to decide who may change the trash bin settings (`settings.trash.view` / `settings.trash.update`).

## Good to know

- Files in the trash bin **count toward the disk limit** of the server until they are recovered, deleted or expire.
- Recovering puts a file back where it was. If something is there now it gets " (restored)" added to its name, nothing is overwritten, and a
  folder that is gone is made again.
- Every hour the panel (`p:trash:purge`, scheduled by the usual cron) deletes what has been in there for longer than it is kept. A node that is
  down leaves it for the next time. Turning the trash bin off does not empty it: what is in there stays until it expires.
- Changing the number of days applies to what is deleted from then on.
- Deleting a server removes its trash bin records with it.
- Activity log: `server:trash.restore`, `server:trash.delete`, `server:trash.empty`; `server:file.delete` says whether it was trashed.
