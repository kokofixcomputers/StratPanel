# Hangar

[Hangar](https://hangar.papermc.io) is the plugin repository of PaperMC. It is a third source on the Content pages of a server, next to Modrinth and CurseForge:
the switch at the top of the sidebar says **Modrinth**, **Hangar** and (when an admin has added a key) **CurseForge**.

* **What it has:** plugins, for Paper (and what is built on it), Velocity and Waterfall. Nothing else, so the other kinds are not offered while Hangar is chosen.
* **No key and no setup:** the browser asks `https://hangar.papermc.io/api/v1` directly, like it asks Modrinth, so nothing goes through the panel and nothing is stored.
* **Everything the Content pages do works with it:** searching (words, category, Minecraft version, Paper / Velocity / Waterfall, sorting by what is popular now, downloads,
  stars, recently updated and newest), the page of a plugin (description, platforms, links, license, members), the versions with their changelogs, installing, dependencies that are
  on Hangar, installed plugins, updates and uninstalling.
* **Ids** from Hangar look like `hg:ViaVersion` (a version: `hg:ViaVersion@5.12.0`), so they never get mixed up with ids of other sites in the address or in `pterodactyl.json`.

## Good to know

* **Hosted elsewhere:** a plugin author may keep the file on GitHub and only list the version on Hangar (EssentialsX does). Those versions show a **Download page** link instead of an
  Install button, like CurseForge files that may not be shared. A plugin whose every version is hosted elsewhere cannot be installed from the panel.
* **Snapshot builds:** many plugins publish every build in a Snapshot channel. What is installed or offered as an update is the newest **release**; a snapshot is only installed when you
  choose that version on the Versions tab. An installed snapshot that is newer than the newest release is not offered a downgrade.
* **Which servers a plugin fits:** a plugin for Hangar's Paper platform is offered to Paper, Purpur, Folia, Spigot and Bukkit servers (most run on all of them, a few use what only Paper has).
  Velocity plugins go to Velocity, Waterfall plugins to Waterfall and BungeeCord.
* **One category at a time:** Hangar filters on a single category.
* **No file hashes:** unlike Modrinth and CurseForge, Hangar cannot say which project a jar belongs to from the file alone, so jars put on a server by hand are not recognised as Hangar plugins
  (plugins installed through the panel are, they are written down in `pterodactyl.json`).
* The code is `resources/scripts/lib/hangar.ts` (the API and how it is made to look like Modrinth), `lib/contentSource.ts` (the choice of source) and `lib/hangar.spec.ts`.
