package cc.kokodev.stratpanel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bukkit.Bukkit;
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
 * Tells the panel what it cannot read reliably from the log: the commands of the server (pterodactyl.commands.json) and
 * who is online. Everything goes to the panel as bridge lines on the console, see {@link Bridge}.
 */
public class StratPanel extends JavaPlugin implements Listener {

  // Ticks to wait after the last change, plugins often register their commands in the same moment.
  private static final long DEBOUNCE_TICKS = 40L;

  private Bridge bridge;
  private CommandScanner scanner;
  private BukkitTask pending;

  @Override
  public void onEnable() {
    bridge = new Bridge(getLogger());
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
   * players again, write the command list again and say when that is done), {@code sync} and {@code scan}.
   */
  @Override
  public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    // Only the console may use it, the panel talks to the server through the console.
    if (!(sender instanceof ConsoleCommandSender) || args.length != 1) {
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
      case "scan":
        scheduleScan();
        break;
      default:
        break;
    }
    return true;
  }

  private void sendHandshake() {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("version", getPluginMeta().getVersion());
    fields.put("platform", Bukkit.getName().toLowerCase());
    fields.put("minecraft", Bukkit.getMinecraftVersion());
    fields.put("protocol", 1);
    bridge.send("handshake", fields);
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
