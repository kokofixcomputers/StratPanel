# File manager: editor view

The file manager has two views, chosen with the **List | Editor** buttons at its top (remembered in your browser). The **Editor** view
looks like the explorer of a code editor:

- **Explorer on the left.** The folders of the server as a tree: click a folder to open or close it (what is inside is read when it is
  opened), click a file to open it. Drag the edge to resize it (double click resets it). Right click (or `F2` to rename, `Delete` to
  delete) for New file, New folder, Rename, Download, Copy path and Delete. Deletes go to the trash bin when an admin turned it on.
- **Tabs above the editor.** Every file you open gets a tab; click to switch, the cross or a middle click closes, drag to reorder. A dot
  on a tab means unsaved changes, closing it asks first. Each tab keeps its own undo history, cursor and scroll position.
- **Monaco**, the editor of VS Code, with the language of the file (changeable at the bottom right), `Ctrl/Cmd+S` to save, **Save &
  Restart** for config files.
- What was open (tabs, folders, width) is remembered per server in your browser. Closing the page with unsaved changes is warned about.

Permissions are the same as in the list: `file.read-content` to open files, `file.update` to save (without it files open read only),
`file.create`, `file.delete`. Files over 4 MB and binary files are not opened, they offer a download. On a narrow screen (a phone) the list
is shown, whatever view was chosen.
