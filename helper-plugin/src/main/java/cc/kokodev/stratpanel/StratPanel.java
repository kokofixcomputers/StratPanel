package cc.kokodev.stratpanel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.server.PluginDisableEvent;
import org.bukkit.event.server.PluginEnableEvent;
import org.bukkit.event.server.ServerLoadEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

/**
 * Tells the panel what it cannot read reliably from the log: the commands of the server (stratosphere.commands.json) and
 * who is online. Everything goes to the panel as bridge lines on the console, see {@link Bridge}.
 */
public class StratPanel extends JavaPlugin implements Listener {

  // Ticks to wait after the last change, plugins often register their commands in the same moment.
  private static final long DEBOUNCE_TICKS = 40L;

  private Bridge bridge;
  private PlayerTools tools;
  private CommandScanner scanner;
  private BukkitTask pending;

  @Override
  public void onEnable() {
    bridge = new Bridge(getLogger());
    tools = new PlayerTools(bridge);
    scanner = new CommandScanner(this);
    getServer().getPluginManager().registerEvents(this, this);

    // When the server is already running (the plugin was loaded later) there will be no load event.
    scheduleScan();
    // The panel learns who is online even when the plugin was loaded while players were playing.
    getServer().getScheduler().runTaskLater(this, this::sendPlayers, 20L);
  }

  @Override
  public void onDisable() {
    if (pending != null) {
      pending.cancel();
    }
    scanner.cancel();
  }

  public Bridge getBridge() {
    return bridge;
  }

  /** The server finished starting, or reloaded: every plugin has registered its commands by now. */
  @EventHandler
  public void onServerLoad(ServerLoadEvent event) {
    scheduleScan();
  }

  @EventHandler
  public void onPluginEnable(PluginEnableEvent event) {
    scheduleScan();
  }

  @EventHandler
  public void onPluginDisable(PluginDisableEvent event) {
    if (event.getPlugin() != this) {
      scheduleScan();
    }
  }

  // MONITOR so the event is final: whatever other plugins did to the join and quit messages, the player did join.
  @EventHandler(priority = EventPriority.MONITOR)
  public void onJoin(PlayerJoinEvent event) {
    bridge.send("player-join", playerFields(event.getPlayer()));
  }

  @EventHandler(priority = EventPriority.MONITOR)
  public void onQuit(PlayerQuitEvent event) {
    bridge.send("player-leave", playerFields(event.getPlayer()));
  }

  /**
   * The console command the panel uses to talk to the plugin. The panel hides every console line that mentions its name,
   * which is why it is so long. Subcommands: {@code handshake} (who am I, and who is online), {@code refresh} (send the
   * players again, write the command list again and say when that is done), {@code sync}, {@code scan}, {@code perf}
   * (TPS and MSPT) and {@code vitals} (health and hunger of the players).
   */
  @Override
  public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    // Only the console may use it, the panel talks to the server through the console.
    if (!(sender instanceof ConsoleCommandSender) || args.length < 1) {
      return true;
    }
    if (args.length > 1) {
      playerCommand(args);
      return true;
    }

    switch (args[0].toLowerCase()) {
      case "handshake":
        sendHandshake();
        sendPlayers();
        break;
      case "refresh":
        sendPlayers();
        if (pending != null) {
          pending.cancel();
          pending = null;
        }
        // The file is written first, then the panel is told it is done and can read it.
        scanner.scan(true, generatedAt -> bridge.send("refreshed", Map.of("generatedAt", generatedAt)));
        break;
      case "sync":
        sendPlayers();
        break;
      case "perf":
        sendPerformance();
        break;
      case "vitals":
        sendVitals();
        break;
      case "scan":
        scheduleScan();
        break;
      default:
        break;
    }
    return true;
  }

  /**
   * The subcommands that are about one player: {@code inventory <name>}, {@code heal <name>}, {@code feed <name>}, {@code
   * swap <name> <from> <to>}, {@code delete <name> <slot>} and the same for the ender chest as {@code ender <name>}, {@code
   * enderswap} and {@code enderdelete}. The answer is the player's new inventory, or the vitals of
   * everybody after a heal or a meal.
   */
  private void playerCommand(String[] args) {
    String action = args[0].toLowerCase();
    Player player = tools.find(action, args[1]);
    if (player == null) {
      return;
    }

    switch (action) {
      case "inventory":
        tools.sendInventory(player);
        break;
      case "heal":
        tools.heal(player);
        sendVitals();
        break;
      case "feed":
        tools.feed(player);
        sendVitals();
        break;
      case "swap":
        if (args.length == 4 && isNumber(args[2]) && isNumber(args[3])) {
          tools.swap(player, Integer.parseInt(args[2]), Integer.parseInt(args[3]));
          tools.sendInventory(player);
        }
        break;
      case "delete":
        if (args.length == 3 && isNumber(args[2])) {
          tools.delete(player, Integer.parseInt(args[2]));
          tools.sendInventory(player);
        }
        break;
      case "health":
      case "hunger":
      case "levels":
        if (args.length == 3 && isSigned(args[2])) {
          int delta = Integer.parseInt(args[2]);
          if (action.equals("health")) {
            tools.changeHealth(player, delta);
          } else if (action.equals("hunger")) {
            tools.changeHunger(player, delta);
          } else {
            tools.changeLevels(player, delta);
          }
          sendVitals();
        }
        break;
      case "gamemode":
        if (args.length == 3 && PlayerVitals.parseGameMode(args[2]) != null) {
          tools.setGameMode(player, PlayerVitals.parseGameMode(args[2]));
          sendVitals();
        }
        break;
      case "ender":
        tools.sendEnderChest(player);
        break;
      case "enderswap":
        if (args.length == 4 && isNumber(args[2]) && isNumber(args[3])) {
          tools.swapEnder(player, Integer.parseInt(args[2]), Integer.parseInt(args[3]));
          tools.sendEnderChest(player);
        }
        break;
      case "enderdelete":
        if (args.length == 3 && isNumber(args[2])) {
          tools.deleteEnder(player, Integer.parseInt(args[2]));
          tools.sendEnderChest(player);
        }
        break;
      default:
        break;
    }
  }

  /** A whole number that may have a minus in front, of a size no one asks for more than a few thousand. */
  private static boolean isSigned(String text) {
    return text.length() <= 5 && text.matches("-?\\d+");
  }

  private static boolean isNumber(String text) {
    return text.length() <= 3 && text.matches("\\d+");
  }

  private void sendHandshake() {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("version", getPluginMeta().getVersion());
    fields.put("platform", Bukkit.getName().toLowerCase());
    fields.put("minecraft", Bukkit.getMinecraftVersion());
    // 2: the "perf" subcommand and the "performance" message. 3: "vitals". 4: the player commands (inventory, heal,
    // feed, swap, delete). 5: the same for the ender chest. 6: health, hunger
    // and levels can be changed. 7: the game mode is sent and can be changed. 8: the "performance" message carries the time
    // and the weather of the main world.
    fields.put("protocol", 8);
    bridge.send("handshake", fields);
  }

  /** Health, hunger and experience of everybody who is online, for the player list of the panel. */
  @SuppressWarnings("deprecation")
  private void sendVitals() {
    List<Map<String, Object>> players = new ArrayList<>();
    for (Player player : Bukkit.getOnlinePlayers()) {
      players.add(
          PlayerVitals.fields(
              player.getName(),
              player.getUniqueId().toString(),
              player.getHealth(),
              // The attribute's name changed between versions, this method exists in all of them.
              player.getMaxHealth(),
              player.getAbsorptionAmount(),
              player.getFoodLevel(),
              player.getSaturation(),
              player.getLevel(),
              player.getExp(),
              player.getGameMode().name().toLowerCase(java.util.Locale.ROOT)));
    }
    bridge.send("vitals", Map.of("players", players));
  }

  /** TPS and MSPT, as far as the server software can tell. Paper has both, Spigot only the TPS, Folia neither. */
  private void sendPerformance() {
    Map<String, Object> fields =
        PerformanceSample.fields(readTps(), readTickTimes(), readAverageTickTime());
    // The first world is the main one (the overworld). The weather is what it is set to, the game fades the rain in slowly.
    List<World> worlds = Bukkit.getWorlds();
    if (!worlds.isEmpty()) {
      World world = worlds.get(0);
      fields.put("world", WorldSample.fields(world.getFullTime(), world.hasStorm(), world.isThundering()));
    }
    bridge.send("performance", fields);
  }

  private static double[] readTps() {
    try {
      return Bukkit.getTPS();
    } catch (UnsupportedOperationException | LinkageError e) {
      // Folia has no single server tick, Spigot has the method elsewhere.
    }
    try {
      // Spigot has it on its own object, which the Paper API this is built against does not declare.
      Object spigot = Bukkit.class.getMethod("spigot").invoke(null);
      return (double[]) spigot.getClass().getMethod("getTPS").invoke(spigot);
    } catch (ReflectiveOperationException | ClassCastException | UnsupportedOperationException e) {
      return null;
    }
  }

  private static long[] readTickTimes() {
    try {
      return Bukkit.getTickTimes();
    } catch (UnsupportedOperationException | LinkageError e) {
      return null;
    }
  }

  private static double readAverageTickTime() {
    try {
      return Bukkit.getAverageTickTime();
    } catch (UnsupportedOperationException | LinkageError e) {
      return Double.NaN;
    }
  }

  private void sendPlayers() {
    List<Map<String, Object>> players = new ArrayList<>();
    for (Player player : Bukkit.getOnlinePlayers()) {
      players.add(playerFields(player));
    }
    bridge.send("players", Map.of("players", players));
  }

  private static Map<String, Object> playerFields(Player player) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", player.getName());
    fields.put("uuid", player.getUniqueId().toString());
    return fields;
  }

  /** Waits for things to settle, a burst of changes causes one scan. */
  private void scheduleScan() {
    if (pending != null) {
      pending.cancel();
    }
    pending = getServer().getScheduler().runTaskLater(this, () -> {
      pending = null;
      scanner.scan();
    }, DEBOUNCE_TICKS);
  }
}
