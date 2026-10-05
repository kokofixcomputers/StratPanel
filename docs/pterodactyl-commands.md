# `pterodactyl.commands.json`

The command tree of a Minecraft server, written by a plugin or mod into the **server root** (the folder that holds
`server.properties`), next to `pterodactyl.json`. The panel reads it for **console tab completion**, so every command
of every plugin and mod, with its sub commands and arguments, can be completed. It is a file on purpose: the panel can
use it while the server is stopped and the plugin is not running.

- Path: `<server root>/pterodactyl.commands.json`
- Written by: the plugin/mod (the panel never writes it).
- Read by: the panel, through the normal file API, so it must be a regular UTF-8 JSON file.
- Machine readable schema: [`pterodactyl.commands.schema.json`](pterodactyl.commands.schema.json)
- Example: [`examples/pterodactyl.commands.json`](examples/pterodactyl.commands.json)

## When to write it

1. On server start, once all plugins/mods have registered their commands (on Paper after `ServerLoadEvent`, so
   commands registered late are included).
2. Again when the set of commands changes (plugin enabled/disabled, `/reload`, datapack reload), debounced by a few
   seconds.
3. Skip the write when the generated content is identical, so the file's modification time only changes when the
   commands did.

Write **atomically** (write `pterodactyl.commands.json.tmp`, then move it over the target) so the panel never reads
half a file. Keep it under about 2 MB. Do not write secrets, the file is readable by everyone with file access.

## Top level

```json
{
  "version": 1,
  "generatedAt": "2026-10-05T12:00:00Z",
  "generator": { "name": "StratPanel Bridge", "version": "1.0.0", "platform": "paper", "minecraft": "1.21.4" },
  "plugins": [{ "name": "EssentialsX", "version": "2.20.1" }],
  "root": { "children": [ /* nodes */ ] }
}
```

| Field | Required | Meaning |
|---|---|---|
| `version` | yes | Always `1`. The panel ignores files with another version. Unknown extra fields are ignored, so adding fields never needs a new version. |
| `generatedAt` | yes | ISO 8601 UTC time the file was generated. The panel compares it with the modification time of the jars in `plugins/` and `mods/` and shows "may be out of date" when a jar is newer. |
| `generator` | no | Who wrote it. `platform` is one of `paper, spigot, folia, fabric, quilt, forge, neoforge, velocity, other`. |
| `plugins` | no | Informational list of the plugins/mods the tree was built from. |
| `root.children` | yes | The top level commands, without the leading `/`. |

## Nodes

The tree mirrors Brigadier: a command is a chain of **literal** words and **argument** slots.

```json
{
  "name": "warp",
  "type": "literal",
  "aliases": ["w"],
  "description": "Teleports you to a warp",
  "permission": "essentials.warp",
  "plugin": "EssentialsX",
  "executable": true,
  "children": [ ... ]
}
```

| Field | Applies to | Meaning |
|---|---|---|
| `name` | all (required) | For a literal the word that is typed (**no spaces**). For an argument the name shown as a hint, such as `target`. |
| `type` | all | `"literal"` (default) or `"argument"`. |
| `parser` | argument | The argument type, as the vanilla command tree names it (see below). Optional, an unknown or missing parser only means no built in suggestions. |
| `suggestions` | argument | A fixed list of values to suggest (at most 500, each under 200 characters). Use it for enums, static tab completers, warp names and so on. |
| `aliases` | literal | Other words that lead to the same node. Put them here instead of duplicating the node. |
| `description` | all | Short text, 200 characters at most. Shown as a tooltip. |
| `permission` | all | Permission node. Informational, the panel does not enforce it. |
| `plugin` | top level | Name of the plugin/mod that owns the command (`minecraft` for vanilla). |
| `executable` | all | `true` when the command can end at this node. Informational. |
| `redirect` | all | See below. |
| `children` | all | The next possible nodes. |

Nodes with a bad `name` (empty, or containing whitespace for a literal) are skipped by the panel, and so is anything
that is not an object, so one broken node never hides the other commands.

### Redirects (loops and shared sub trees)

Brigadier shares nodes: `execute as @a at @s run ...` loops back to `execute`, and `run` continues with the whole
command tree. Do not expand these, point at them with `redirect`, a **path of literal names from the root** to the node
to continue from:

```json
{ "name": "targets", "type": "argument", "parser": "minecraft:entity", "redirect": ["execute"] }
{ "name": "run", "type": "literal", "redirect": [] }
```

`["execute"]` continues like the `execute` command, `[]` continues like the root (any command). A node with a
`redirect` may also have its own `children`, which are added to the ones it inherits. Expanding a shared sub tree
instead would make the file explode in size.

### Argument parsers

Use the parser identifiers of the vanilla "declare commands" packet. The panel gives suggestions for these, everything
else just shows the argument name as a hint:

| Parser | Suggestions in the panel |
|---|---|
| `minecraft:entity`, `minecraft:score_holder`, `minecraft:game_profile` | `@a @e @p @r @s @n` |
| `brigadier:bool` | `true`, `false` |
| `minecraft:gamemode` | `survival creative adventure spectator` |
| `minecraft:vec3`, `minecraft:vec2`, `minecraft:block_pos`, `minecraft:column_pos`, `minecraft:rotation` | `~`, `^` |
| `minecraft:dimension` | the three vanilla dimensions |
| `minecraft:mob_effect` | all effects |
| `minecraft:enchantment` | all enchantments |
| `minecraft:color` | the chat colours |
| anything else (`brigadier:string`, `brigadier:integer`, `minecraft:item_stack`, ...) | none (the name is shown) |

Online player names are not part of the file, it is static. A plugin that wants them completed should leave the
argument as `minecraft:game_profile`/`minecraft:entity`, the panel adds the selectors.

## Building it

- **Paper/Folia (1.20.6+)**: walk the Brigadier `CommandDispatcher` root (`Bukkit.getCommandMap()` plus the
  Brigadier dispatcher) and map each `ArgumentType` to its parser id. Commands that only exist in the Bukkit
  `CommandMap` (from `plugin.yml`, no Brigadier tree) become a literal with their `aliases`, `description`, `usage`
  derived hint and, if the command has a `TabCompleter`, call it once with an empty argument to fill `suggestions` of a
  single `brigadier:string` argument child named after the usage.
- **Spigot/older Paper**: only the `CommandMap` path above is available.
- **Fabric/Quilt/NeoForge/Forge**: walk `server.getCommands().getDispatcher().getRoot()`, mapping argument types with
  the registry id of the argument type.
- **Velocity**: walk the `CommandManager` (`getAliases()` and the registered Brigadier nodes).
- Collect commands **regardless of who asks**: ignore `requires` predicates and permissions so the file is complete,
  store the permission in `permission` instead.
- Deduplicate, sort children by name for a stable file, and stop at about 100 000 nodes (the panel stops reading there).

## Telling the panel the list changed (live refresh)

While someone has the console open, the panel can refresh the list the moment it changes, without a page reload. The
plugin announces it by printing **one console line** after it has written the file:

```
::stratpanel:: {"event":"commands-updated","generatedAt":"2026-10-05T12:00:00Z"}
```

- Print it with the normal logger (`getLogger().info(...)`, so the server adds its own timestamp prefix). The panel looks
  for the `::stratpanel::` tag anywhere in the line and parses the JSON after it, so any prefix is fine.
- **Write the file first, then print the line**, so the panel finds the new content when it reacts.
- `generatedAt` must be the same value as in the file. The panel ignores an announcement it already has, which matters
  because the console replays old lines when someone connects.
- The panel waits about 1.5 seconds and then reads the file again, so several announcements in a row cost one read.
- The panel **hides every line containing the tag** from the console it shows, so announcements never clutter it. Keep the
  line on one line, and keep other output out of it.
- Other events can use the same format later (`{"event":"…"}`), the panel ignores events it does not know. Treat the
  channel as untrusted on the panel side: players can type the tag into chat, so an event only ever makes the panel look
  something up again, it never carries data the panel believes.

## Players (join, leave and the full list)

The plugin also tells the panel who is online, which keeps working whatever other plugins do to join and quit messages.
Same channel, same rules as above (one console line, printed by the plugin's own logger):

```
::stratpanel:: {"event":"player-join","name":"Steve","uuid":"13bc7d5e-f906-41ff-a949-6c1eb677fe03"}
::stratpanel:: {"event":"player-leave","name":"Steve","uuid":"13bc7d5e-f906-41ff-a949-6c1eb677fe03"}
::stratpanel:: {"event":"players","players":[{"name":"Steve","uuid":"…"},{"name":"Alex","uuid":"…"}]}
```

- Send `player-join` and `player-leave` from the join and quit events at **MONITOR** priority, so the result is final.
- `players` is the complete list and **replaces** what the panel has. Send it when the plugin enables (players may already
  be online) and whenever the panel asks, see the command below.
- `uuid` is optional, `name` is required (letters, digits, `_ . - space`, at most 32 characters).
- **These events are trusted only when the line starts with the log header followed by `[StratPanel]`**, for example
  `[17:23:31 INFO]: [StratPanel] ::stratpanel:: {...}`. Chat cannot begin a new line, so a player cannot forge one. Always
  use the plugin logger, and on platforms whose log lines look different, keep the prefix `[StratPanel]` directly after the
  header. A tagged line that does not start like that is hidden but ignored.
- The panel still understands the server's own log lines (`logged in with entity id`, `lost connection`) when the plugin is
  not installed.

## The command the panel uses to ask

The panel talks to the plugin with the console command `stratpanelhidepanellogs <subcommand>` (console only, ignore any
other sender). **Every console line that mentions `stratpanelhidepanellogs` or the `::stratpanel::` tag is hidden by the
panel**, that is why the name is so long. Register it in `plugin.yml`.

| Subcommand | The plugin answers with |
|---|---|
| `handshake` | `{"event":"handshake","version":"1.0.0","platform":"paper","minecraft":"1.21.4","protocol":1}`, then a `players` event. The panel sends it when it connects to a running server that has `pterodactyl.commands.json` in its root, and shows a green check when the answer arrives (a red cross when it does not within 5 seconds). |
| `refresh` | A `players` event, then it writes `pterodactyl.commands.json` again **even when nothing changed** (new `generatedAt`) and announces `commands-updated`, then `{"event":"refreshed","generatedAt":"…"}` as the "done" message. The panel's status button sends it; on `refreshed` the panel reloads the command list. |
| `sync` | A `players` event only. |
| `scan` | Rescans the commands (debounced), announces `commands-updated` when the content changed. |

## What the panel does with it

1. Opens the console, lists the server root, and finds the file (one cheap request, the file is only downloaded
   again when its size or modification time changed, otherwise a browser cached copy is used).
2. Builds a completion tree from it. When the file is missing or invalid, the panel's built in list of vanilla and Paper
   commands is used instead.
3. Compares `generatedAt` with the newest jar in `plugins/` and `mods/` and shows a note when it looks out of date.
4. Reads the file again when it sees a `commands-updated` announcement (see above).
