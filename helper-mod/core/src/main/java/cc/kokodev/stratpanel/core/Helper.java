package cc.kokodev.stratpanel.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The helper itself: answers the panel's console command and reports who is online. The loader code calls the {@code on...}
 * methods from the server thread, this class does not know Fabric, NeoForge or Minecraft's classes.
 */
public final class Helper {

  /** The console command the panel uses to talk to the helper. The panel hides every line that mentions it. */
  public static final String COMMAND = "stratpanelhidepanellogs";

  // 2: the "perf" subcommand and the "performance" message. 3: "vitals". 4: the player commands (inventory, heal,
  // feed, swap, delete). 5: the same for the ender chest. 6: health, hunger and levels can be changed. 7: the game mode is
  // sent and can be changed. 8: the "performance" message carries the time and the weather of the world. 9: shulker boxes can be
  // opened and changed (the "shulkerbox" message).
  public static final int PROTOCOL = 9;

  // Ticks to wait after the last change, mods often register their commands in the same moment.
  private static final long DEBOUNCE_TICKS = 40L;

  private final Game game;
  private final Platform platform;
  private final Bridge bridge;
  private final PlayerTools tools;
  private final CommandScanner scanner;
  private final TickTracker ticks = new TickTracker();

  private long tick;
  // The tick on which the commands are scanned, -1 for never.
  private long scanAt = -1;
  // Whoever is online, to notice players that come and go without the loader telling us.
  private final Map<String, String> online = new LinkedHashMap<>();

  public Helper(Game game, Platform platform) {
    this.game = game;
    this.platform = platform;
    this.bridge = new Bridge(platform::log);
    this.tools = new PlayerTools(game, bridge);
    this.scanner = new CommandScanner(game, platform, bridge);
  }

  public Bridge bridge() {
    return bridge;
  }

  public TickTracker ticks() {
    return ticks;
  }

  /** The server is up: tell the panel who is there and write the commands. */
  public void onStarted() {
    for (PlayerHandle player : game.players()) {
      online.put(player.uuid(), player.name());
    }
    scheduleScan();
    // Anybody who was already there (the helper was loaded later) is told to the panel soon, like the plugin does.
    sendPlayers();
  }

  public void onStopping() {
    scanner.close();
  }

  /** The command tree was (re)built, so every mod has registered its commands. */
  public void onCommandsRegistered() {
    scheduleScan();
  }

  public void onTickStart() {
    ticks.start(System.nanoTime());
  }

  public void onTickEnd() {
    ticks.end(System.nanoTime());
    tick++;
    if (scanAt >= 0 && tick >= scanAt) {
      scanAt = -1;
      scanner.scan(false, null);
    }
    // Joins and leaves are found by comparing the list, which is cheap once every few ticks and does not depend on an event
    // that has a different name or timing in every version.
    if (tick % 5 == 0) {
      watchPlayers();
    }
  }

  /** Waits for things to settle, a burst of changes causes one scan. */
  private void scheduleScan() {
    scanAt = tick + DEBOUNCE_TICKS;
  }

  private void watchPlayers() {
    List<PlayerHandle> players = game.players();
    Map<String, String> now = new LinkedHashMap<>();
    for (PlayerHandle player : players) {
      now.put(player.uuid(), player.name());
    }
    for (Map.Entry<String, String> entry : now.entrySet()) {
      if (!online.containsKey(entry.getKey())) {
        bridge.send("player-join", fields(entry.getValue(), entry.getKey()));
      }
    }
    for (Map.Entry<String, String> entry : online.entrySet()) {
      if (!now.containsKey(entry.getKey())) {
        bridge.send("player-leave", fields(entry.getValue(), entry.getKey()));
      }
    }
    online.clear();
    online.putAll(now);
  }

  /**
   * The subcommands of {@link #COMMAND}: {@code handshake} (who am I, and who is online), {@code refresh} (send the players
   * again, write the command list again and say when that is done), {@code sync}, {@code scan}, {@code perf} (TPS and MSPT)
   * and {@code vitals}. With a player: {@code inventory <name>}, {@code heal <name>}, {@code feed <name>}, {@code swap <name>
   * <from> <to>}, {@code delete <name> <slot>}, the same for the ender chest as {@code ender <name>}, {@code enderswap} and
   * {@code enderdelete}, and {@code health}, {@code hunger}, {@code levels} and {@code gamemode} with a value.
   */
  public void execute(String[] args) {
    if (args.length < 1) {
      return;
    }
    if (args.length > 1) {
      playerCommand(args);
      return;
    }
    switch (args[0].toLowerCase(Locale.ROOT)) {
      case "handshake":
        sendHandshake();
        sendPlayers();
        break;
      case "refresh":
        sendPlayers();
        scanAt = -1;
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
  }

  private void playerCommand(String[] args) {
    String action = args[0].toLowerCase(Locale.ROOT);
    PlayerHandle player = tools.find(action, args[1]);
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
      case "shulker":
        // shulker <name> <inv|ender> <slot of the box>
        if (args.length == 4 && isWhere(args[2]) && isNumber(args[3])) {
          tools.sendShulker(player, args[2].equals("ender"), Integer.parseInt(args[3]));
        }
        break;
      case "shulkerswap":
        // shulkerswap <name> <inv|ender> <slot of the box> <from> <to>
        if (args.length == 6
            && isWhere(args[2])
            && isNumber(args[3])
            && isNumber(args[4])
            && isNumber(args[5])) {
          boolean ender = args[2].equals("ender");
          int box = Integer.parseInt(args[3]);
          if (tools.swapShulker(player, ender, box, Integer.parseInt(args[4]), Integer.parseInt(args[5]))) {
            tools.sendShulker(player, ender, box);
          }
        }
        break;
      case "shulkerdelete":
        // shulkerdelete <name> <inv|ender> <slot of the box> <slot in the box>
        if (args.length == 5 && isWhere(args[2]) && isNumber(args[3]) && isNumber(args[4])) {
          boolean ender = args[2].equals("ender");
          int box = Integer.parseInt(args[3]);
          if (tools.deleteShulker(player, ender, box, Integer.parseInt(args[4]))) {
            tools.sendShulker(player, ender, box);
          }
        }
        break;
      default:
        break;
    }
  }

  /** Where a shulker box is: in the inventory of the player or in the ender chest. */
  private static boolean isWhere(String text) {
    return text.equals("inv") || text.equals("ender");
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
    fields.put("version", platform.version());
    fields.put("platform", platform.name());
    fields.put("minecraft", game.minecraftVersion());
    fields.put("protocol", PROTOCOL);
    bridge.send("handshake", fields);
  }

  /** Health, hunger and experience of everybody who is online, for the player list of the panel. */
  private void sendVitals() {
    List<Map<String, Object>> players = new ArrayList<>();
    for (PlayerHandle player : game.players()) {
      players.add(
          PlayerVitals.fields(
              player.name(),
              player.uuid(),
              player.health(),
              player.maxHealth(),
              player.absorption(),
              player.food(),
              player.saturation(),
              player.level(),
              player.exp(),
              player.gameMode()));
    }
    bridge.send("vitals", Map.of("players", players));
  }

  private void sendPerformance() {
    Map<String, Object> fields =
        PerformanceSample.fields(ticks.tps(System.nanoTime()), ticks.tickNanos(), Double.NaN);
    WorldInfo world = game.world();
    if (world != null) {
      fields.put("world", WorldSample.fields(world.time(), world.raining(), world.thundering()));
    }
    bridge.send("performance", fields);
  }

  private void sendPlayers() {
    List<Map<String, Object>> players = new ArrayList<>();
    for (PlayerHandle player : game.players()) {
      players.add(fields(player.name(), player.uuid()));
    }
    bridge.send("players", Map.of("players", players));
  }

  private static Map<String, Object> fields(String name, String uuid) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", name);
    fields.put("uuid", uuid);
    return fields;
  }
}
