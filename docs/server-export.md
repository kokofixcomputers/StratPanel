# Moving a server to another panel

* **Export:** admin > server > Manage > *Export Server* downloads `<name>.stratserver.json`: name, description, owner email, limits,
  egg (uuid + name), image, startup, variables, schedules and tasks, and the SFTP address the files can be pulled from.
* **Import:** admin > Servers > Create New has an *Import a Server* box. Choosing the file fills in the form (the egg is found by uuid,
  then by name; the owner by email). The admin picks the node and allocation and creates it. The schedules from the file are made
  right after the server (`ServerImportService`, a cron that does not parse or an action that is not power/command/backup is skipped).
* **Files** are not in the file. Pull them with the importer in the new server's Jobs tab, from the SFTP address in the file.
* The code is `Services/Servers/ServerExportService.php`, `ServerImportService.php`, `Admin/Servers/ServerExportController.php`,
  the box and script in `resources/views/admin/servers/new.blade.php`, and `tests/Integration/Servers/ServerExportTest.php`.
