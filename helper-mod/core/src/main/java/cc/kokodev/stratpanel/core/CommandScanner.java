package cc.kokodev.stratpanel.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.brigadier.tree.CommandNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Reads every command of the server and writes it to stratosphere.commands.json in the server root, for the panel's tab
 * completion. See docs/stratosphere-commands.md in the panel for the format.
 */
public final class CommandScanner {

  public static final String FILE_NAME = "stratosphere.commands.json";
  private static final int WARN_BYTES = 2 * 1024 * 1024;

  // The commands of the game itself, everything else is added by a mod.
  static final Set<String> VANILLA =
      Set.of(
          "advancement", "attribute", "ban", "ban-ip", "banlist", "bossbar", "clear", "clone", "damage", "data",
          "datapack", "debug", "defaultgamemode", "deop", "difficulty", "effect", "enchant", "execute", "experience",
          "xp", "fill", "fillbiome", "forceload", "function", "gamemode", "gamerule", "give", "help", "item",
          "jfr", "kick", "kill", "list", "locate", "loot", "me", "msg", "tell", "w", "op", "pardon", "pardon-ip",
          "particle", "perf", "place", "playsound", "publish", "random", "recipe", "reload", "return", "ride",
          "rotate", "save-all", "save-off", "save-on", "say", "schedule", "scoreboard", "seed", "setblock",
          "setidletimeout", "setworldspawn", "spawnpoint", "spectate", "spreadplayers", "stop", "stopsound", "summon",
          "tag", "team", "teammsg", "tm", "teleport", "tp", "tellraw", "test", "tick", "time", "title", "transfer",
          "trigger", "version", "waypoint", "weather", "whitelist", "worldborder", "dialog",
          "stratpanelhidepanellogs");

  private final Game game;
  private final Platform platform;
  private final Bridge bridge;
  private final Gson gson = new GsonBuilder().disableHtmlEscaping().create();
  // What was written last, without its timestamp, so an unchanged tree is not announced again.
  private volatile String lastContent = "";
  // One thread writes, the server thread only builds the tree.
  private final ExecutorService writer =
      Executors.newSingleThreadExecutor(
          r -> {
            Thread thread = new Thread(r, "Stratosphere writer");
            thread.setDaemon(true);
            return thread;
          });

  public CommandScanner(Game game, Platform platform, Bridge bridge) {
    this.game = game;
    this.platform = platform;
    this.bridge = bridge;
  }

  /**
   * Builds the tree on the calling (server) thread and hands the writing to another one.
   *
   * @param force write the file even when nothing changed, which is what the panel asks for when it wants fresh data
   * @param done called with the generatedAt of the file once it is written (on another thread), not called when
   *     nothing had to be written or the scan failed
   */
  public void scan(boolean force, Consumer<String> done) {
    try {
      CommandNode<?> root = game.commandRoot();
      if (root == null) {
        platform.warn("Could not read the command tree of the server, no command file is written.", null);
        return;
      }
      List<Map<String, Object>> children =
          new CommandTreeBuilder(this::metaFor, game::parserId).build(root);
      // The command that the panel itself uses is of no use in tab completion.
      children.removeIf(node -> "stratpanelhidepanellogs".equals(node.get("name")));

      Map<String, Object> rootNode = new LinkedHashMap<>();
      rootNode.put("children", children);

      Map<String, Object> generator = new LinkedHashMap<>();
      generator.put("name", "Stratosphere Bridge");
      generator.put("version", platform.version());
      generator.put("platform", platform.name());
      generator.put("minecraft", game.minecraftVersion());

      List<Map<String, String>> mods = platform.mods();

      Map<String, Object> result = new LinkedHashMap<>();
      result.put("version", 1);
      // The panel parses this with a JavaScript date, whole seconds are always understood.
      String generatedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now().truncatedTo(ChronoUnit.SECONDS));
      result.put("generatedAt", generatedAt);
      result.put("generator", generator);
      result.put("plugins", mods);
      result.put("root", rootNode);

      String content = gson.toJson(rootNode) + gson.toJson(mods);
      if (!force && content.equals(lastContent)) {
        return;
      }
      String json = gson.toJson(result);
      writer.execute(() -> write(json, content, generatedAt, done));
    } catch (RuntimeException e) {
      platform.warn("Command scan failed", e);
    }
  }

  private void write(String json, String content, String generatedAt, Consumer<String> done) {
    try {
      Path target = platform.serverRoot().resolve(FILE_NAME);
      Path temp = target.resolveSibling(FILE_NAME + ".tmp");
      Files.writeString(temp, json, StandardCharsets.UTF_8);
      try {
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
      }
      lastContent = content;

      if (json.length() > WARN_BYTES) {
        platform.warn(FILE_NAME + " is larger than 2 MB, the panel may be slow to read it.", null);
      }

      // The file is written first, the announcement tells the panel to read it.
      bridge.send("commands-updated", Map.of("generatedAt", generatedAt));
      if (done != null) {
        done.accept(generatedAt);
      }
    } catch (IOException e) {
      platform.warn("Could not write " + FILE_NAME, e);
    }
  }

  private CommandTreeBuilder.Meta metaFor(String command) {
    if (!VANILLA.contains(command)) {
      return null;
    }
    return new CommandTreeBuilder.Meta() {
      public String description() {
        return null;
      }

      public String permission() {
        return null;
      }

      public String plugin() {
        return "minecraft";
      }

      public List<String> aliases() {
        return List.of();
      }
    };
  }

  /** Lets what is being written finish, then stops the thread. */
  public void close() {
    writer.shutdown();
  }
}
