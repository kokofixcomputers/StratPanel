# Server importer

**Importer** in a server's menu copies everything from another server (SFTP, FTP or FTPS) into this one. It is for moving a server from another
host: type the login, press Connect, check the fingerprint and press Import.

* The **node** connects to the other server and downloads the files itself, nothing goes through the panel or the browser. It needs the Wings of
  Stratosphere (`docs/updates.md`), a node without it says so.
* **Connect** only looks: it logs in, shows the first entries of the folder and the SSH fingerprint of the other server (SFTP). The import
  is then pinned to that fingerprint, so a different server on the same address is refused.
* The import is a **job** on the node (`docs/jobs.md`): after you press Import the box in the bottom right corner shows `37 of 100 files`,
  the bytes, the file it is on and every file that failed, with the reason. You can close the page or reload it, the import goes on. **Cancel**
  there stops it; files that were done stay.
* *Replace files that are already here* is on by default; off keeps the files that exist and skips the ones from the other server. Replacing
  needs the permission `file.update`, importing needs `file.create`.
* The login (password or private key) is used for the one request. It is not saved, not logged and not in the activity log (which has the
  host, protocol and folders).
* Links on the other server are not followed, names that could leave the folder (`..`, with a `/`) are skipped, files count against the
  disk limit of the server and its file denylist applies. A full disk stops the import.
* The node refuses addresses on its own networks (10.x, 192.168.x, 127.x, ...). The operator can allow some in the Wings configuration:
  `api.remote_download_allowlist`. `api.disable_remote_download: true` turns the importer off.
* Stop the server first: files that are in use (a running world) can be damaged when they are replaced. The page warns about it.

One import runs per server at a time. `POST /api/client/servers/{uuid}/files/import/test` is the Connect step and
`POST .../jobs/import` starts the job.
