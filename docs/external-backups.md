# Backups outside the node

By default a backup stays on the node of its server. **Admin > Settings > Backups** adds places where copies are kept as well: S3 (Amazon, Backblaze B2,
Wasabi, MinIO, Cloudflare R2, ...), WebDAV (Nextcloud, ownCloud, a NAS) or a folder on the machine of the panel (a second disk, a mounted share).
Any number of destinations can be added.

## How it works

1. The node makes the backup like it always did (the "local" backup, or the S3 adapter set in `.env`).
2. When it is complete, the panel copies it to every destination that is on and takes every backup. The panel reads the file from the node (the
   same link a download uses) and streams it to the destination, so nothing is held in memory. It is a queued job (`CopyBackupToDestination`): the
   queue worker has to run, and the panel machine carries the traffic. A copy shows as *copying*, *stored* or *failed* (with the reason) on the
   Backups tab of the server and on the destination.
3. **Remove the file from the node once it is stored here** (per destination) frees the disk of the node: the destination is then the only place with
   the backup (it shows *Only in copies*). Only for backups made on the node itself.
4. **Test it** writes a small file, reads it back and deletes it, before or after saving. **Copy the existing backups** copies what was made before the
   destination was added.

## How much is kept

Each destination has limits, for each server: the newest N copies, no copies older than N days, and no more than N GB together (empty = no limit).
Whatever goes over a limit is deleted from the destination, oldest first, after every copy and every hour (`p:backup:prune-external`, or **Apply the
limits now**). A locked backup is never deleted. A backup that is only in copies and loses its last copy is removed from the panel too.

The backup limit of a server (how many backups it may have) is unchanged, and so is deleting: deleting a backup deletes its copies in every destination.

## Getting it back

* **Download**: with several places to read from the menu gives a choice (the node, or each destination). S3 gives a direct, short lived link; WebDAV and
  folders go through the panel with a signed link (`/backup-copies/{id}/download`, valid 15 minutes).
* **Restore**: the same choice. A copy is restored by giving Wings a download link, the way S3 backups always were, so Wings has to be able to reach the
  panel (Wings refuses links to private addresses). When the node does not have the file any more the restore uses a copy by itself.

## Notes

* Keys and passwords are stored encrypted in the database and never shown again; leaving them empty when editing keeps them.
* A destination can not be deleted while it holds the only copy of a backup. Deleting one deletes its copies (not the backups on the nodes).
* Nothing changes for the S3 adapter of `.env` (`APP_BACKUP_DRIVER=s3`): it still makes the backup in S3 itself. Destinations here are copies.
* Code: `app/Services/Backups/External`, `BackupsController`, `BackupsPage.tsx`; tests in `tests/Integration/Backups`.
