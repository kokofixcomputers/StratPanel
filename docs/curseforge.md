# CurseForge

With an API key from [console.curseforge.com](https://console.curseforge.com/), the Content page of every server gets a
**CurseForge** tab next to Modrinth: mods, plugins, data packs, resource packs and **worlds** can be browsed (descriptions,
screenshots, versions with changelogs, CurseForge's own categories, loaders and Minecraft versions) and installed, and the
mods in the file manager get their icons.

## Setting it up

Admin > Settings > **CurseForge**: paste the key and save. The panel checks it with CurseForge right away, and the page has a
button to check it again. The key is stored encrypted in the settings table and is never sent to a browser. Without a key
nothing about CurseForge shows up. A key in the environment (`CURSEFORGE_API_KEY`) is used when no key was saved.

## How it works

CurseForge does not let a browser ask it things, and the key has to stay secret, so the browser asks the panel
(`/api/client/curseforge/...`, see `app/Http/Controllers/Api/Client/CurseForgeController.php`) and the panel asks CurseForge
(`app/Services/CurseForge/CurseForgeService.php`). Only a fixed set of reads is possible and every parameter is checked.
Answers are cached for a few minutes (lists of categories and versions for six hours), so many people looking at the same mod
use up one request of the key. Nothing is ever written at CurseForge.

In the frontend, `resources/scripts/lib/curseforge.ts` turns what CurseForge sends into the shapes the pages already use for
Modrinth, so the list, the page of a project, the install dialog, dependencies and updates are the same code for both. Ids
from CurseForge start with `cf:` (`cf:394468`) so they never mix with Modrinth ids, in the address, in the records of
installed projects (`stratosphere.json`) and in the dependency planner. The address says which site is shown (`?s=curseforge`).

## Things to know

- **Authors can keep their files off other sites.** Those files have no download address; they show a link to CurseForge
  instead of an install button.
- **Dependencies** are installed like on Modrinth: what a file lists as required (relation type 3) is offered with it.
- **Recognising files** (the icons in the file manager, "Detect existing" on the installed tab) uses CurseForge's
  fingerprint: MurmurHash2, seed 1, over the bytes of the file without the tab, line feeds and space. It is computed in the
  browser. Modrinth is asked first, CurseForge only about what Modrinth does not know, and each being out of reach never
  loses what the other found.
- **Worlds** are downloaded and unpacked into their own folder next to the others, the same as a world from a link. The
  archive has to be a .zip or .tar.gz and the server has to be stopped.
- **Modpacks** are not installed from CurseForge (their format is a different one, with a list of files to fetch), those stay
  on Modrinth.
- A search shows at most 10 000 results, which is as far as CurseForge answers.
