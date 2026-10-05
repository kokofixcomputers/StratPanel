package cc.kokodev.stratpanel;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.tree.CommandNode;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandMap;
import org.bukkit.command.PluginCommand;

/**
 * Reads every command of the server and writes it to pterodactyl.commands.json in the server root, for the panel's
 * tab completion. See docs/pterodactyl-commands.md in the panel for the format.
 */
public class CommandScanner {

  static final String FILE_NAME = "pterodactyl.commands.json";
  private static final int WARN_BYTES = 2 * 1024 * 1024;

  private final StratPanel plugin;
  private final Gson gson = new GsonBuilder().disableHtmlEscaping().create();
  // What was written last, without its timestamp, so an unchanged tree is not announced again.
  private String lastContent = "";

  public CommandScanner(StratPanel plugin) {
    this.plugin = plugin;
  }

  /** Scans, and writes the file only when the commands changed. */
  public void scan() {
    scan(false, null);
  }

  /**
   * Scans on the calling (main) thread and hands the writing to another one.
   *
   * @param force write the file even when nothing changed, which is what the panel asks for when it wants fresh data
   * @param done called with the generatedAt of the file once it is written (on another thread), not called when
   *     nothing had to be written or the scan failed
   */
  public void scan(boolean force, java.util.function.Consumer<String> done) {
    try {
      CommandMap commandMap = Bukkit.getCommandMap();
      Map<String, Command> known = commandMap.getKnownCommands();

      CommandNode<?> root = findRoot();
      List<Map<String, Object>> children;
      if (root != null) {
        children = new CommandTreeBuilder(name -> metaFor(known.get(name))).build(root);
      } else {
        plugin.getLogger().warning("Could not read the Brigadier command tree, only the commands of the "
            + "Bukkit command map are written.");
        children = new ArrayList<>();
      }
      addMissingBukkitCommands(children, known);

      Map<String, Object> rootNode = new LinkedHashMap<>();
      rootNode.put("children", children);

      Map<String, Object> result = new LinkedHashMap<>();
      result.put("version", 1);
      // The panel parses this with a JavaScript date, whole seconds are always understood.
      String generatedAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now().truncatedTo(ChronoUnit.SECONDS));
      result.put("generatedAt", generatedAt);
      result.put("generator", generator());
      result.put("plugins", plugins());
      result.put("root", rootNode);

      String content = gson.toJson(rootNode) + gson.toJson(result.get("plugins"));
      if (!force && content.equals(lastContent)) {
        return;
      }
      String json = gson.toJson(result);
      Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> write(json, content, generatedAt, done));
    } catch (Exception e) {
      plugin.getLogger().log(Level.SEVERE, "Command scan failed", e);
    }
  }

  private void write(String json, String content, String generatedAt, java.util.function.Consumer<String> done) {
    try {
      Path target = serverRoot().toPath().resolve(FILE_NAME);
      Path temp = target.resolveSibling(FILE_NAME + ".tmp");
      Files.writeString(temp, json, StandardCharsets.UTF_8);
      try {
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
      }
      lastContent = content;

      if (json.length() > WARN_BYTES) {
        plugin.getLogger().warning(FILE_NAME + " is larger than 2 MB, the panel may be slow to read it.");
      }

      // The file is written first, the announcement tells the panel to read it.
      plugin.getBridge().send("commands-updated", Map.of("generatedAt", generatedAt));
      if (done != null) {
        done.accept(generatedAt);
      }
    } catch (IOException e) {
      plugin.getLogger().log(Level.SEVERE, "Could not write " + FILE_NAME, e);
    }
  }

  /** The server root is the working directory of the server process, next to server.properties. */
  private File serverRoot() {
    return new File(System.getProperty("user.dir"));
  }

  /**
   * The root of the Brigadier tree of the server: CraftServer.getServer() is the DedicatedServer, its getCommands()
   * is the Commands object and that has the dispatcher. These are public methods with Mojang's names.
   */
  private CommandNode<?> findRoot() {
    try {
      Object craft = Bukkit.getServer();
      Object minecraftServer = craft.getClass().getMethod("getServer").invoke(craft);
      Object commands = minecraftServer.getClass().getMethod("getCommands").invoke(minecraftServer);
      Method getDispatcher = commands.getClass().getMethod("getDispatcher");
      Object dispatcher = getDispatcher.invoke(commands);
      if (dispatcher instanceof CommandDispatcher) {
        return ((CommandDispatcher<?>) dispatcher).getRoot();
      }
    } catch (ReflectiveOperationException | RuntimeException e) {
      plugin.getLogger().log(Level.WARNING, "Could not reach the command dispatcher", e);
    }
    return null;
  }

  /**
   * Bukkit commands that are not part of the Brigadier tree (some platforms do not add all of them) become a command
   * that takes any text, which is still better than not completing the command word.
   */
  private void addMissingBukkitCommands(List<Map<String, Object>> children, Map<String, Command> known) {
    List<String> present = new ArrayList<>();
    for (Map<String, Object> child : children) {
      present.add((String) child.get("name"));
    }

    known.forEach((name, command) -> {
      if (name.indexOf(':') >= 0 || present.contains(name)) {
        return;
      }
      CommandTreeBuilder.Meta meta = metaFor(command);
      Map<String, Object> node = new LinkedHashMap<>();
      node.put("name", name);
      node.put("type", "literal");
      if (meta != null) {
        if (meta.description() != null && !meta.description().isEmpty()) {
          node.put("description", meta.description());
        }
        if (meta.permission() != null && !meta.permission().isEmpty()) {
          node.put("permission", meta.permission());
        }
        node.put("plugin", meta.plugin());
      }
      node.put("executable", true);

      Map<String, Object> args = new LinkedHashMap<>();
      args.put("name", "args");
      args.put("type", "argument");
      args.put("parser", "brigadier:string");
      args.put("executable", true);
      List<Map<String, Object>> argList = new ArrayList<>();
      argList.add(args);
      node.put("children", argList);

      children.add(node);
    });
    children.sort((a, b) -> ((String) a.get("name")).compareTo((String) b.get("name")));
  }

  private CommandTreeBuilder.Meta metaFor(Command command) {
    if (command == null) {
      return null;
    }
    String owner;
    if (command instanceof PluginCommand) {
      owner = ((PluginCommand) command).getPlugin().getName();
    } else if (command.getClass().getName().contains("Vanilla")) {
      owner = "minecraft";
    } else {
      owner = "bukkit";
    }
    return new CommandTreeBuilder.Meta() {
      @Override
      public String description() {
        return command.getDescription();
      }

      @Override
      public String permission() {
        return command.getPermission();
      }

      @Override
      public String plugin() {
        return owner;
      }

      @Override
      public List<String> aliases() {
        return command.getAliases();
      }
    };
  }

  private Map<String, String> generator() {
    Map<String, String> generator = new LinkedHashMap<>();
    generator.put("name", "StratPanel Bridge");
    generator.put("version", plugin.getPluginMeta().getVersion());
    generator.put("platform", Bukkit.getName().toLowerCase());
    generator.put("minecraft", Bukkit.getMinecraftVersion());
    return generator;
  }

  private List<Map<String, String>> plugins() {
    List<Map<String, String>> list = new ArrayList<>();
    for (org.bukkit.plugin.Plugin loaded : Bukkit.getPluginManager().getPlugins()) {
      Map<String, String> entry = new LinkedHashMap<>();
      entry.put("name", loaded.getPluginMeta().getName());
      entry.put("version", loaded.getPluginMeta().getVersion());
      list.add(entry);
    }
    list.sort((a, b) -> a.get("name").compareToIgnoreCase(b.get("name")));
    return list;
  }
}
