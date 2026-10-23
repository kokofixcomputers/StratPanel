# Stratosphere helper mod (Fabric and NeoForge)

The mod version of the [helper plugin](../helper-plugin). It speaks the same protocol, see
[`docs/stratosphere-commands.md`](../docs/stratosphere-commands.md), so the panel treats it like the plugin: tab completion
from the command tree of the server, the list of players, their vitals, inventory, ender chest and the shulker boxes in them, TPS and MSPT.

There is **one jar, `Stratosphere-mod.jar`, for both loaders**:

- **Fabric:** Minecraft **1.20 to 1.21.11 and 26.1 and newer**.
- **NeoForge:** Minecraft **1.20.2 to 1.21.11 and 26.1 and newer**. (NeoForge for 1.20 and 1.20.1 is Forge's API under another name, it
  would need a mod of its own, which this is not.)

Every one of these versions and loaders was tried on a real server (and 26.3 for the 26.x ones), see below.


| Loader | Needs | Java |
|---|---|---|
| Fabric | Fabric Loader 0.16+ and Fabric API | 17 on 1.20 to 1.20.4, 21 from 1.20.5, 25 on 26.x |
| NeoForge | NeoForge 20.2+ | the same |

Put it in the `mods` folder. The panel does that itself when it installs Fabric or NeoForge, and offers to update it when the
version differs from the one it ships with. Other versions of Minecraft are not supported, the mod says so in the log and
leaves the server alone.

## How one jar covers both loaders

Fabric reads `fabric.mod.json` and starts `StratFabric`, which it names there. NeoForge reads `neoforge.mods.toml` (`mods.toml` on 20.2
to 20.4) and finds `StratNeo` by its `@Mod` annotation. Each ignores what is meant for the other, and the classes of the other are never
loaded (NeoForge only reads `StratFabric` as bytes while it scans for annotations). The code that talks to the game is in the jar once
for each loader, `g121fabric`, `g121neoforge` and so on, because the Fabric version for 1.20 and 1.21 is renamed to the names Fabric
uses when running and the NeoForge one is not: the two would otherwise have the same class names with different bytes. Put the jar on
a Forge server and Forge will refuse the mod (no `@Mod` of Forge), the panel does not install it there.

## How one jar covers all of these versions

Minecraft 26.1 removed the obfuscation and renamed some classes, Fabric runs 1.21.x under *intermediary* names (`class_1234`)
while 26.x has the real ones, and inside 1.21.x a few things the helper uses changed (armor trims moved in 1.21.2, the way item
components are read in 1.21.5, permissions and identifiers in 1.21.11). Reflection would work around that but would not be checked by
the compiler, so instead the code that touches the game is written once and **compiled for each stretch of versions in which it
keeps working**:

| Generation | Games | Built against |
|---|---|---|
| `g120` | 1.20 to 1.20.1 (Fabric only) | 1.20.1 |
| `g1204` | 1.20.2 to 1.20.4 | 1.20.4 |
| `g1206` | 1.20.5 to 1.20.6 | 1.20.6 |
| `g121` | 1.21.1 | 1.21.1 |
| `g1214` | 1.21.2 to 1.21.4 | 1.21.4 |
| `g1218` | 1.21.5 to 1.21.10 | 1.21.8 |
| `g12111` | 1.21.11 | 1.21.11 |
| `g26` | 26.1 and newer | 26.3 |


```
core/            Plain Java, no Minecraft classes: the protocol, TPS tracking, the command tree, the player tools. Unit tested.
mc/              Templates for the code that talks to the game (Mojang names): McGame, McPlayer, McContainer, ConsoleCommand.
mc-<generation>/ The few things that differ between the generations (Compat.java), one folder for each.
fabric-hooks/    Templates for the Fabric events, neoforge-hooks/ the same for NeoForge.
fabric-<generation>/ neoforge-<generation>/
                 One Gradle project per loader and generation. Each stamps the templates with its package (g121fabric, g1214neoforge, ...),
                 compiles them against that game, and the Fabric ones for 1.21.x remap the result to intermediary names.
fabric-26/, neoforge-26/ also hold the entry point, which knows no Minecraft classes: it reads the version of the game and
                 loads the package of the right generation.
```

The older generations (`g120`, `g1204`) keep what an item carries in NBT, the newer ones in components (1.20.5), which is the main
thing `Compat` has to know about: names, enchantments, trims, what is in a shulker box, and how a test player is made. NeoForge 20.2 to
20.4 also have another tick event (`neoforge-hooks-20`) and read `META-INF/mods.toml`, which the jar carries next to
`neoforge.mods.toml`.

`./gradlew mods` merges the pieces into `build/libs/stratosphere-mod-<version>.jar`.
Everything is Java 17 bytecode so the jar loads on Java 17 (1.20 to 1.20.4) as well as 21 and 25. Gradle itself has to run on Java 25, because the 26.x
game classes are Java 25 class files.

## Building

```bash
cd helper-mod
./gradlew test mods            # the jars end up in build/libs
scripts/bundle.sh [version]    # the same, and copies them into ../public/helper for the panel
```

`scripts/bundle.sh` is also what `.github/scripts/package.sh` runs.

## Testing on real servers

`scripts/test-server.sh <fabric|neoforge> <1.20 to 1.21.11|26.2|26.3>` downloads the server and the loader, installs the jar, starts it
and sends the panel's commands to the console. The server runs with `-Dstratosphere.selftest=true`, which adds a player that is
not connected, `TestBot`, with an enchanted sword, stone, boots, an ender chest item and shulker boxes (one with items in it), so the player tools can be tried without
a game client. The script prints what the mod answered. This is how every combination was checked (1.20 to 1.21.11 and 26.3, both loaders where there is one); changing the game
mode (`gamemode`) needs a real connection and is not covered.

## A version of the game that lacks something

The helper keeps the server alive when the game does not have a method it calls: every command, the start and the ticks are guarded
(`Helper.guard`), the failure is written to the log once ("Stratosphere: the command "inventory" does not work here ...") and the rest
keeps working, TPS and MSPT included. A `NoSuchMethodError` would otherwise end the server's tick loop.

## Adding support for another version of Minecraft

Try it first: put the version in the table of `scripts/test-server.sh` and run it. When a generation does not fit, the log says which
call is missing. Then add a generation: copy a `mc-<name>` folder (its `Compat.java`) and the two Gradle projects of the nearest one
(`fabric-1218`, `neoforge-1218`), point them at the new game version in `gradle.properties`, and add them to `settings.gradle`, the root
`fabricJar` / `neoforgeJar` tasks and `Generation.forMinecraft`. The compiler lists what changed; the differences go into `Compat`
(in 1.21.2 to 1.21.11 that was five lines; 1.20.x also needed the NBT version of the item code). A version that shares everything with a neighbour needs no generation of its own, only an
entry in `Generation.forMinecraft`.
