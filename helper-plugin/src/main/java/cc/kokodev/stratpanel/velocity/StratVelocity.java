package cc.kokodev.stratpanel.velocity;

import cc.kokodev.stratpanel.Bridge;
import cc.kokodev.stratpanel.ProxyPlayers;
import com.google.gson.GsonBuilder;
import com.google.inject.Inject;
import com.velocitypowered.api.command.CommandManager;
import com.velocitypowered.api.command.CommandMeta;
import com.velocitypowered.api.command.CommandSource;
import com.velocitypowered.api.command.RawCommand;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.connection.PostLoginEvent;
import com.velocitypowered.api.event.player.ServerConnectedEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.proxy.ConsoleCommandSource;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.ServerConnection;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;

/**
 * Stratosphere on a Velocity proxy: tells the panel who is connected and which backend server each player is on, and lists the
 * commands of the proxy for the tab completion of the console. A proxy has no inventories, health or world, so that is all. The
 * messages are the ones of the Paper plugin (see {@link Bridge}), the panel cannot tell the two apart.
 */
public class StratVelocity {

  private static final String COMMAND = "stratpanelhidepanellogs";
  private static final String COMMANDS_FILE = "stratosphere.commands.json";

  private final ProxyServer proxy;
  private final Logger logger;
  private final Bridge bridge;

  @Inject
  public StratVelocity(ProxyServer proxy, Logger logger) {
    this.proxy = proxy;
    this.logger = logger;
    this.bridge = new Bridge(logger::info);
  }

  @Subscribe
  public void onInitialize(ProxyInitializeEvent event) {
    CommandManager commands = proxy.getCommandManager();
    CommandMeta meta = commands.metaBuilder(COMMAND).plugin(this).build();
    commands.register(meta, (RawCommand) invocation -> run(invocation.source(), invocation.arguments()));

    // Plugins register their commands while the proxy starts, give them a moment. The players are told in case the panel was
    // opened while the proxy was running already.
    proxy.getScheduler().buildTask(this, this::writeCommands).delay(3, TimeUnit.SECONDS).schedule();
    proxy.getScheduler().buildTask(this, this::sendPlayers).delay(1, TimeUnit.SECONDS).schedule();
  }

  @Subscribe
  public void onLogin(PostLoginEvent event) {
    Player player = event.getPlayer();
    // The backend server comes a moment later (player-server), the panel shows the player as connecting until then.
    bridge.send("player-join", ProxyPlayers.fields(player.getUsername(), player.getUniqueId().toString(), null));
  }

  @Subscribe
  public void onServerConnected(ServerConnectedEvent event) {
    Player player = event.getPlayer();
    bridge.send(
        "player-server",
        ProxyPlayers.fields(
            player.getUsername(),
            player.getUniqueId().toString(),
            event.getServer().getServerInfo().getName()));
  }

  @Subscribe
  public void onDisconnect(DisconnectEvent event) {
    // A second login with the same name replaces the first one, the player is still there.
    if (event.getLoginStatus() == DisconnectEvent.LoginStatus.CONFLICTING_LOGIN) {
      return;
    }
    Player player = event.getPlayer();
    bridge.send("player-leave", ProxyPlayers.fields(player.getUsername(), player.getUniqueId().toString(), null));
  }

  /** The console command the panel uses to talk to the plugin, only the console may use it. */
  private void run(CommandSource source, String arguments) {
    if (!(source instanceof ConsoleCommandSource)) {
      return;
    }
    String action = arguments.trim().split("\\s+")[0].toLowerCase(java.util.Locale.ROOT);
    switch (action) {
      case "handshake":
        sendHandshake();
        sendPlayers();
        break;
      case "refresh":
        sendPlayers();
        // The file is written first, then the panel is told it is done.
        String generatedAt = writeCommands();
        if (generatedAt != null) {
          bridge.send("refreshed", Map.of("generatedAt", generatedAt));
        } else {
          bridge.send("refreshed");
        }
        break;
      case "sync":
        sendPlayers();
        break;
      case "scan":
        writeCommands();
        break;
      case "perf":
        // A proxy does not tick, there is no TPS to tell.
        bridge.send("performance", Map.of("supported", false));
        break;
      default:
        break;
    }
  }

  private void sendHandshake() {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put(
        "version",
        proxy
            .getPluginManager()
            .fromInstance(this)
            .flatMap(container -> container.getDescription().getVersion())
            .orElse("unknown"));
    fields.put("platform", "velocity");
    fields.put("minecraft", proxy.getVersion().getVersion());
    fields.put("proxy", true);
    // The protocol of the Paper plugin, a proxy only answers the players and the commands.
    fields.put("protocol", 9);
    bridge.send("handshake", fields);
  }

  private void sendPlayers() {
    List<Map<String, Object>> players = new ArrayList<>();
    for (Player player : proxy.getAllPlayers()) {
      String server =
          player.getCurrentServer().map(ServerConnection::getServerInfo).map(info -> info.getName()).orElse(null);
      players.add(ProxyPlayers.fields(player.getUsername(), player.getUniqueId().toString(), server));
    }
    bridge.send("players", Map.of("players", players));
  }

  /** Writes the names of the commands of the proxy where the panel looks for them. Returns when it was generated, null on failure. */
  private String writeCommands() {
    try {
      List<Map<String, Object>> children = new ArrayList<>();
      for (String alias : proxy.getCommandManager().getAliases()) {
        if (!alias.equals(COMMAND) && !alias.contains(":")) {
          children.add(ProxyPlayers.commandNode(alias, null));
        }
      }
      String generatedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS).toString();
      Map<String, Object> generator = new LinkedHashMap<>();
      generator.put("name", "Stratosphere");
      generator.put("platform", "velocity");
      generator.put("minecraft", proxy.getVersion().getVersion());
      Map<String, Object> root = new LinkedHashMap<>();
      root.put("children", children);
      Map<String, Object> document = new LinkedHashMap<>();
      document.put("version", 1);
      document.put("generatedAt", generatedAt);
      document.put("generator", generator);
      document.put("root", root);

      Path target = Path.of("").toAbsolutePath().resolve(COMMANDS_FILE);
      Path temporary = target.resolveSibling(COMMANDS_FILE + ".tmp");
      Files.write(temporary, new GsonBuilder().disableHtmlEscaping().create().toJson(document).getBytes(StandardCharsets.UTF_8));
      Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
      bridge.send("commands-updated", Map.of("generatedAt", generatedAt));

      return generatedAt;
    } catch (IOException | RuntimeException e) {
      logger.warn("Could not write {}: {}", COMMANDS_FILE, e.toString());

      return null;
    }
  }
}
