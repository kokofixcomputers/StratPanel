# Moving a server to another panel

* **Export with files:** the server's Settings page (owner and admins) > *Move to another panel*. It writes `stratserver.json` (the
  settings, owner email, limits, egg uuid + name, image, startup, variables, schedules and tasks; `GET /api/client/servers/{server}/settings/export`)
  into the server, compresses everything into `<name>.stratserver.tar.gz` with the normal archive, downloads it and deletes the json again.
  The archive stays in the server's files. *Settings only* downloads just the json (admin > server > Manage has the same button).
* **Import:** admin > Servers > Create New has an *Import a Server* box. It takes the `.json` or the `.tar.gz`; for the archive the browser
  unzips the stream and keeps only `stratserver.json` (`public/themes/pterodactyl/js/admin/stratserver-file.js`, it has to read through the
  whole archive because Wings does not put that file first). The form is filled in (egg by uuid, then name; owner by email), the admin picks
  node and allocation. The schedules are made right after the server (`ServerImportService`; a cron that does not parse or an action that
  is not power/command/backup is skipped).
* **Files:** once the new server has installed, Settings > *Import files from an export* uploads the same `.tar.gz` and extracts it in
  the root (files with the same name are replaced), then deletes the archive and `stratserver.json`.
* Needs no new Wings: it uses the usual file write, compress, upload and decompress calls.
* Not in the export: subusers, database contents, backups.
* The code is `Services/Servers/ServerExportService.php`, `ServerImportService.php`, `Api/Client/Servers/ExportController.php`,
  `Admin/Servers/ServerExportController.php`, `components/server/settings/MoveServerBox.tsx`, the box in
  `resources/views/admin/servers/new.blade.php` and `tests/Integration/Servers/ServerExportTest.php`.
