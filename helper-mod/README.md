# Stratosphere helper mod (Fabric and NeoForge)

The mod version of the [helper plugin](../helper-plugin). It speaks the same protocol, see
[`docs/stratosphere-commands.md`](../docs/stratosphere-commands.md), so the panel treats it like the plugin: tab completion
from the command tree of the server, the list of players, their vitals, inventory and ender chest, TPS and MSPT.

There is **one jar per loader** and each works on **Minecraft 1.21.1, 26.2 and 26.3** (26.1 and newer in general):

| Jar | Loader | Needs |
|---|---|---|
| `Stratosphere-fabric.jar` | Fabric Loader 0.16+ and Fabric API | Java 21 on 1.21.1, Java 25 on 26.x |
| `Stratosphere-neoforge.jar` | NeoForge 21.1+ | Java 21 on 1.21.1, Java 25 on 26.x |

Put it in the `mods` folder. The panel does that itself when it installs Fabric or NeoForge, and offers to update it when the
version differs from the one it ships with. Other versions of Minecraft are not supported, the mod says so in the log and
leaves the server alone.

## How one jar covers two very different games

Minecraft 26.1 removed the obfuscation and renamed some classes, and Fabric runs 1.21.1 under *intermediary* names (`class_1234`)
while 26.x has the real ones. Reflection would work around that but would not be checked by the compiler, so instead the code
that touches the game is written once and **compiled twice**:

```
core/            Plain Java, no Minecraft classes: the protocol, TPS tracking, the command tree, the player tools. Unit tested.
mc/              Templates for the code that talks to the game (Mojang names): McGame, McPlayer, McContainer, ConsoleCommand.
mc-121/, mc-26/  The few things that differ between the generations (Compat.java).
fabric-hooks/    Templates for the Fabric events, neoforge-hooks/ the same for NeoForge.
fabric-121/ fabric-26/ neoforge-121/ neoforge-26/
                 One Gradle project per loader and generation. Each stamps the templates with its package (g121 or g26),
                 compiles them against that game, and fabric-121 remaps the result to intermediary names.
fabric-26/, neoforge-26/ also hold the entry point, which knows no Minecraft classes: it reads the version of the game and
                 loads the package of the right generation.
```

`./gradlew mods` merges the pieces into `build/libs/stratosphere-fabric-<version>.jar` and `stratosphere-neoforge-<version>.jar`.
Everything is Java 21 bytecode so the jar loads on Java 21 as well as 25. Gradle itself has to run on Java 25, because the 26.x
game classes are Java 25 class files.

## Building

```bash
cd helper-mod
./gradlew test mods            # the jars end up in build/libs
scripts/bundle.sh [version]    # the same, and copies them into ../public/helper for the panel
```

`scripts/bundle.sh` is also what `.github/scripts/package.sh` runs.

## Testing on real servers

`scripts/test-server.sh <fabric|neoforge> <1.21.1|26.2|26.3>` downloads the server and the loader, installs the jar, starts it
and sends the panel's commands to the console. The server runs with `-Dstratosphere.selftest=true`, which adds a player that is
not connected, `TestBot`, with an enchanted sword, stone, boots and an ender chest item, so the player tools can be tried without
a game client. The script prints what the mod answered. This is how all six combinations were checked; changing the game
mode (`gamemode`) needs a real connection and is not covered.

## Adding support for another version of Minecraft

Add a generation: a `mc-<name>` folder with its `Compat.java`, two Gradle projects like `fabric-26` and `neoforge-26`, an entry
in `Generation.forMinecraft` and in the root `fabricJar` and `neoforgeJar` tasks. Versions in between that share their code with
a neighbour (1.21.1 and 26.x do not) need no new generation.
