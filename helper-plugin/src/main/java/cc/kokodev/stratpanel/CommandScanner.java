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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandMap;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.command.PluginCommand;

/**
 * Reads every command of the server and writes it to stratosphere.commands.json in the server root, for the panel's
 * tab completion. See docs/pterodactyl-commands.md in the panel for the format.
 */
public class CommandScanner {

  static final String FILE_NAME = "stratosphere.commands.json";
  // What earlier versions of the plugin wrote, removed once the new file is there so the panel does not read an old one.
  static final String LEGACY_FILE_NAME = "pterodactyl.commands.json";
  private static final int WARN_BYTES = 2 * 1024 * 1024;
  // How long the main thread may be kept busy asking plugin tab completers in one tick, and how long one command may
  // take at most. A scan that takes longer than the overall limit is written with what it has.
  private static final long TICK_NANOS = 12_000_000L;
  private static final long COMMAND_NANOS = 300_000_000L;
  private static final long OVERALL_NANOS = 90_000_000_000L;

  private final StratPanel plugin;
  private final Gson gson = new GsonBuilder().disableHtmlEscaping().create();
  // What was written last, without its timestamp, so an unchanged tree is not announced again.
  private String lastContent = "";
  private BukkitTask probing;
  // Changes when a scan starts, so work of an older scan notices it has been replaced.
  private int generation;

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
      cancel();

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

      // Asking the plugins for their subcommands takes a while on a server with many commands, so it is done a little
      // on every tick and the file is written when it is finished.
      probeSubcommands(children, known, () -> finish(children, force, done));
    } catch (Exception e) {
      plugin.getLogger().log(Level.SEVERE, "Command scan failed", e);
    }
  }

  /** Stops a scan that is still asking plugins for their subcommands, a newer one replaces it. */
  public void cancel() {
    generation++;
    if (probing != null) {
      probing.cancel();
      probing = null;
    }
  }

  private void finish(List<Map<String, Object>> children, boolean force,
      java.util.function.Consumer<String> done) {
    try {
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
      // The panel reads the new name first, but an old file next to it would only confuse whoever looks in the folder.
      Files.deleteIfExists(target.resolveSibling(LEGACY_FILE_NAME));
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

  /**
   * Paper has a Bukkit style command in the tree as its name and one argument that takes any text, its subcommands are
   * only known to the plugin's tab completer. So the completer is asked, as the console would while typing, and what
   * it answers becomes the nodes after the command. Commands of the game itself are in the tree with all their nodes.
   *
   * <p>Some completers answer with thousands of entries (WorldEdit's block lists), so this works through the commands
   * a few milliseconds per tick and calls {@code finished} on the main thread when it is done.
   */
  private void probeSubcommands(List<Map<String, Object>> children, Map<String, Command> known, Runnable finished) {
    CommandSender sender = Bukkit.getConsoleSender();
    Set<String> players = new HashSet<>();
    for (Player player : Bukkit.getOnlinePlayers()) {
      players.add(player.getName());
    }

    java.util.ArrayDeque<Map<String, Object>> queue = new java.util.ArrayDeque<>();
    for (Map<String, Object> node : children) {
      Command command = known.get((String) node.get("name"));
      if (command != null && !command.getClass().getName().contains("Vanilla") && onlyTakesAnyText(node)) {
        queue.add(node);
      }
    }
    if (queue.isEmpty()) {
      finished.run();
      return;
    }

    boolean debug = Boolean.getBoolean("stratpanel.debug");
    int mine = generation;
    long started = System.nanoTime();
    BukkitTask[] self = new BukkitTask[1];
    self[0] = probing = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
      if (mine != generation) {
        self[0].cancel();
        return;
      }

      long tickEnds = System.nanoTime() + TICK_NANOS;
      while (!queue.isEmpty() && System.nanoTime() < tickEnds && System.nanoTime() - started < OVERALL_NANOS) {
        Map<String, Object> node = queue.poll();
        String name = (String) node.get("name");
        Command command = known.get(name);
        SubcommandProbe probe = new SubcommandProbe(players, System.nanoTime() + COMMAND_NANOS);

        List<Map<String, Object>> found = probe.probe(typed -> {
          List<String> args = new ArrayList<>(typed);
          args.add("");
          return command.tabComplete(sender, name, args.toArray(new String[0]));
        });
        if (debug) {
          System.err.println("[StratPanel] /" + name + " (" + command.getClass().getName() + ") -> " + found.size()
              + " nodes, " + probe.calls() + " calls");
        }
        if (!found.isEmpty()) {
          node.put("children", found);
        }
      }

      if (queue.isEmpty() || System.nanoTime() - started >= OVERALL_NANOS) {
        self[0].cancel();
        probing = null;
        if (!queue.isEmpty()) {
          plugin.getLogger().warning("Asking the plugins for their subcommands took too long, " + queue.size()
              + " commands were left out.");
        }
        finished.run();
      }
    }, 1L, 1L);
  }

  /** True for a command that has one argument below it and nothing else, which is how Bukkit commands show up. */
  @SuppressWarnings("unchecked")
  private static boolean onlyTakesAnyText(Map<String, Object> node) {
    Object children = node.get("children");
    if (!(children instanceof List) || ((List<?>) children).size() != 1) {
      return false;
    }
    Map<String, Object> only = (Map<String, Object>) ((List<?>) children).get(0);
    return "argument".equals(only.get("type")) && only.get("children") == null;
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
    generator.put("name", "Stratosphere Bridge");
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
