# Jobs

Work that takes a while runs as a **job** on the node, not in the browser or in a request: **imports** from another server, **archives** (compress),
**extractions** (decompress) and **downloads** (mods, plugins, worlds, modpacks, "pull" in the file manager). A small box in the bottom right corner of a server's pages shows
them while they run and afterwards (it only appears when there is a job, finished ones included, can be folded away, and has **Clear all completed**), so you can close the page, reload it or come back the next day: the node goes on, and what it did is
still there.

* Each job shows a bar (files or bytes), the numbers, the file it is on, what it made (the name of an archive), and a list of the files that
  could not be done and why. **Cancel** stops one that is going, **Remove** forgets one that is over. What was done before a cancel is kept.
* **Imports** (`docs/importer.md`) start from the Importer page and show up in that box. One import at a time per server.
* **Archives and extractions** started in the file manager are jobs too (one of the two at a time per server). The file manager follows the job
  and shows the new archive when it is done, like before, but it no longer matters whether the page stays open. The progress is the bytes of
  the files archived, or of the archive read.
* **Downloads**: everything that downloads a file to a server (installing a mod, a world, a server jar, a modpack with hundreds of mods) is a job. A
  list is one job: three files at a time for the whole server (the limit of a node), a failed file is tried again twice, files that still fail
  are listed and do not hold up the others. Quick downloads that went well disappear from the list after 10 minutes so they do not push the
  interesting jobs out. Things that happen after the download (a modpack's own steps after its files are in) still run in the page.
* Jobs are kept on the node (`<root_directory>/.jobs`): the last 20 of a server for 14 days. A job that was going when the node
  restarted shows as **Interrupted**, with what had been done. Running an import again with *Replace files* off continues with what is missing.
* Permissions: seeing the jobs needs `file.read`; stopping one needs `file.create`, `file.archive` or `file.update`; starting needs the permission of
  the action as before (`file.create` for downloads and imports, `file.archive` for archives).
* Needs the Wings of Stratosphere (`docs/updates.md`); a node without jobs says so and asks to update Wings.

API (client): `GET/DELETE /api/client/servers/{uuid}/jobs[/{id}]`, `POST .../jobs/import`, `POST .../jobs/pull`; compress and extract keep their
`files/compress`, `files/decompress` and `files/task/{id}` routes, which now start and follow jobs.
