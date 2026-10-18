package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.tree.CommandNode;
import com.mojang.brigadier.tree.RootCommandNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class HelperTest {

  /** A container of items that are only an id and a count, ids that end in "_boots" go in the boots slot. */
  static final class Slots implements ItemContainer {
    final ItemInfo[] items;

    Slots(int size) {
      items = new ItemInfo[size];
    }

    public int size() {
      return items.length;
    }

    public ItemInfo describe(int slot) {
      return items[slot];
    }

    public boolean canMerge(int from, int to) {
      return items[from] != null
          && items[to] != null
          && items[from].id().equals(items[to].id())
          && items[to].count() < 64;
    }

    public void merge(int from, int to) {
      int moved = Math.min(items[from].count(), 64 - items[to].count());
      items[to] = new ItemInfo(items[to].id(), items[to].count() + moved, 0, 0, null, Map.of());
      int left = items[from].count() - moved;
      items[from] = left == 0 ? null : new ItemInfo(items[from].id(), left, 0, 0, null, Map.of());
    }

    public void exchange(int a, int b) {
      ItemInfo first = items[a];
      items[a] = items[b];
      items[b] = first;
    }

    public void clear(int slot) {
      items[slot] = null;
    }

    public boolean accepts(int to, int from) {
      return items[from] == null || InventorySlots.accepts(to, items[from].id().replace("minecraft:", ""));
    }

    Slots with(int slot, String id, int count) {
      items[slot] = new ItemInfo("minecraft:" + id, count, 0, 0, null, Map.of());
      return this;
    }

    Slots withTrim(int slot, String id, String material, String pattern) {
      items[slot] =
          new ItemInfo(
              "minecraft:" + id, 1, 0, 0, null, Map.of(), new ItemInfo.Trim(material, pattern));
      return this;
    }
  }

  static class Steve implements PlayerHandle {
    double health = 12;
    int food = 10;
    double saturation = 4;
    int level = 3;
    String mode = "survival";
    final Slots inventory = new Slots(InventorySlots.COUNT);
    final Slots ender = new Slots(InventorySlots.ENDER_COUNT);

    public String name() {
      return "Steve";
    }

    public String uuid() {
      return "13bc7d5e-f906-41ff-a949-6c1eb677fe03";
    }

    public double health() {
      return health;
    }

    public double maxHealth() {
      return 20;
    }

    public double absorption() {
      return 0;
    }

    public int food() {
      return food;
    }

    public double saturation() {
      return saturation;
    }

    public int level() {
      return level;
    }

    public double exp() {
      return 0.5;
    }

    public String gameMode() {
      return mode;
    }

    public void setHealth(double value) {
      health = value;
    }

    public void setFood(int value) {
      food = value;
    }

    public void setSaturation(float value) {
      saturation = value;
    }

    public void setExhaustion(float value) {}

    public void setLevel(int value) {
      level = value;
    }

    public void setGameMode(String value) {
      mode = value;
    }

    public ItemContainer inventory() {
      return inventory;
    }

    public ItemContainer enderChest() {
      return ender;
    }

    /** The contents of the shulker boxes, by where and slot. */
    final Map<String, Slots> boxes = new java.util.HashMap<>();

    /** Puts a shulker box in a slot of the inventory (or the ender chest) and returns what is in it. */
    Slots box(boolean inEnder, int slot, String id) {
      (inEnder ? ender : inventory).with(slot, id, 1);
      Slots contents = new Slots(InventorySlots.SHULKER_COUNT);
      boxes.put((inEnder ? "ender:" : "inv:") + slot, contents);
      return contents;
    }

    public ItemContainer shulkerBox(boolean inEnder, int slot) {
      return boxes.get((inEnder ? "ender:" : "inv:") + slot);
    }
  }

  private final List<String> log = new ArrayList<>();
  private final List<PlayerHandle> online = new ArrayList<>();
  private final Steve steve = new Steve();
  private Helper helper;
  private WorldInfo worldInfo = new WorldInfo(24000L * 3 + 13000, true, false);
  private Path root;

  @BeforeEach
  void setUp(@TempDir Path temp) {
    root = temp;
    online.add(steve);
    Game game =
        new Game() {
          public String minecraftVersion() {
            return "26.3";
          }

          public List<PlayerHandle> players() {
            return List.copyOf(online);
          }

          public PlayerHandle player(String name) {
            return online.stream().filter(p -> p.name().equalsIgnoreCase(name)).findFirst().orElse(null);
          }

          public CommandNode<?> commandRoot() {
            RootCommandNode<Object> node = new RootCommandNode<>();
            node.addChild(com.mojang.brigadier.builder.LiteralArgumentBuilder.literal("gamemode").build());
            node.addChild(com.mojang.brigadier.builder.LiteralArgumentBuilder.literal("warp").build());
            node.addChild(com.mojang.brigadier.builder.LiteralArgumentBuilder.literal(Helper.COMMAND).build());
            return node;
          }

          public String parserId(ArgumentType<?> type) {
            return null;
          }

          public WorldInfo world() {
            return worldInfo;
          }
        };
    Platform platform =
        new Platform() {
          public String name() {
            return "fabric";
          }

          public String version() {
            return "1.0.0";
          }

          public List<Map<String, String>> mods() {
            return List.of(Map.of("name", "Warps", "version", "2.0"));
          }

          public void log(String line) {
            log.add(line);
          }

          public void warn(String line, Throwable error) {
            log.add("WARN " + line);
          }

          public Path serverRoot() {
            return root;
          }
        };
    helper = new Helper(game, platform);
  }

  /** The messages sent so far as JSON, the header of a line is checked on the way. */
  private List<JsonObject> messages() {
    List<JsonObject> result = new ArrayList<>();
    for (String line : log) {
      assertTrue(line.startsWith("[Stratosphere] ::stratpanel:: {"), line);
      result.add(new Gson().fromJson(line.substring("[Stratosphere] ::stratpanel:: ".length()), JsonObject.class));
    }
    return result;
  }

  private JsonObject last() {
    List<JsonObject> all = messages();
    return all.get(all.size() - 1);
  }

  private void run(String command) {
    helper.execute(command.split(" "));
  }

  /** The error the command caused, null when there was none. The panel gets the inventory again after it either way. */
  private String errorOf(String command) {
    log.clear();
    run(command);
    return messages().stream()
        .filter(m -> m.get("event").getAsString().equals("player-error"))
        .map(m -> m.get("error").getAsString())
        .findFirst()
        .orElse(null);
  }

  @Test
  void handshakeTellsWhoItIsAndWhoIsOnline() {
    run("handshake");
    List<JsonObject> all = messages();
    assertEquals("handshake", all.get(0).get("event").getAsString());
    assertEquals("fabric", all.get(0).get("platform").getAsString());
    assertEquals("26.3", all.get(0).get("minecraft").getAsString());
    assertEquals(9, all.get(0).get("protocol").getAsInt());
    assertEquals("players", all.get(1).get("event").getAsString());
    assertEquals("Steve", all.get(1).getAsJsonArray("players").get(0).getAsJsonObject().get("name").getAsString());
  }

  @Test
  void aPlayerWhoIsNotThereGetsAnError() {
    run("heal Nobody");
    assertEquals("player-error", last().get("event").getAsString());
    assertEquals("That player is not online.", last().get("error").getAsString());
  }

  @Test
  void aBadNameIsNotLookedUp() {
    run("heal St;eve");
    assertEquals("player-error", last().get("event").getAsString());
  }

  @Test
  void healFeedAndTheAdjustersChangeTheVitals() {
    run("heal Steve");
    assertEquals(20, steve.health);
    assertEquals("vitals", last().get("event").getAsString());

    run("health Steve -50");
    assertEquals(1, steve.health, "never kills");
    run("hunger Steve -3");
    assertEquals(7, steve.food);
    assertEquals(4, steve.saturation);
    run("hunger Steve -30");
    assertEquals(0, steve.food);
    assertEquals(0, steve.saturation);
    run("levels Steve 5");
    assertEquals(8, steve.level);
    run("levels Steve -50");
    assertEquals(0, steve.level);
    run("feed Steve");
    assertEquals(20, steve.food);
    run("gamemode Steve creative");
    assertEquals("creative", steve.mode);
    assertEquals("creative", last().getAsJsonArray("players").get(0).getAsJsonObject().get("gameMode").getAsString());
    run("gamemode Steve nonsense");
    assertEquals("creative", steve.mode);
  }

  @Test
  void swapMovesMergesAndRefusesWrongArmor() {
    steve.inventory.with(0, "stone", 40).with(1, "stone", 40).with(2, "diamond_sword", 1).with(3, "iron_boots", 1);

    run("swap Steve 0 1");
    assertEquals(64, steve.inventory.items[1].count());
    assertEquals(16, steve.inventory.items[0].count());
    assertEquals("inventory", last().get("event").getAsString());

    assertEquals("That item can not go in that slot.", errorOf("swap Steve 2 36"));
    assertEquals("minecraft:diamond_sword", steve.inventory.items[2].id());

    run("swap Steve 3 36");
    assertEquals("minecraft:iron_boots", steve.inventory.items[36].id());
    assertEquals("inventory", last().get("event").getAsString());

    assertEquals("That is not a slot of the inventory.", errorOf("swap Steve 3 3"));
    assertEquals("That is not a slot of the inventory.", errorOf("swap Steve 3 99"));
  }

  @Test
  void deleteEmptiesASlotAndTheInventoryListsWhatIsLeft() {
    steve.inventory.with(5, "apple", 3);
    run("delete Steve 5");
    JsonObject message = last();
    assertEquals("inventory", message.get("event").getAsString());
    assertEquals(0, message.getAsJsonArray("items").size());
    assertEquals("That is not a slot of the inventory.", errorOf("delete Steve 70"));
  }

  @Test
  void theEnderChestHasItsOwnCommands() {
    steve.ender.with(0, "diamond", 5);
    run("ender Steve");
    assertEquals("enderchest", last().get("event").getAsString());
    assertEquals(
        "minecraft:diamond",
        last().getAsJsonArray("items").get(0).getAsJsonObject().get("id").getAsString());
    run("enderswap Steve 0 26");
    assertEquals("minecraft:diamond", steve.ender.items[26].id());
    run("enderdelete Steve 26");
    assertEquals(0, last().getAsJsonArray("items").size());
    assertEquals("That is not a slot of the inventory.", errorOf("enderswap Steve 0 27"));
  }

  @Test
  void anArmorTrimIsSentWithTheItem() {
    steve.inventory.withTrim(7, "iron_helmet", "minecraft:gold", "minecraft:coast");
    steve.inventory.withTrim(8, "diamond_boots", "mymod:ruby", "mymod:swirl");
    steve.inventory.with(9, "iron_chestplate", 1);

    run("inventory Steve");

    var items = last().getAsJsonArray("items");
    JsonObject helmet = items.get(0).getAsJsonObject();
    assertEquals(7, helmet.get("slot").getAsInt());
    // Everything the game has is sent without minecraft:, a modded trim keeps its namespace.
    assertEquals("gold", helmet.getAsJsonObject("trim").get("material").getAsString());
    assertEquals("coast", helmet.getAsJsonObject("trim").get("pattern").getAsString());
    JsonObject boots = items.get(1).getAsJsonObject();
    assertEquals("mymod:ruby", boots.getAsJsonObject("trim").get("material").getAsString());
    assertEquals("mymod:swirl", boots.getAsJsonObject("trim").get("pattern").getAsString());
    // Armor without a trim has no trim field.
    assertFalse(items.get(2).getAsJsonObject().has("trim"));
  }

  @Test
  void aTrimedItemInAShulkerBoxIsSentToo() {
    steve.box(false, 4, "shulker_box").withTrim(0, "netherite_leggings", "minecraft:netherite", "minecraft:rib");

    run("shulker Steve inv 4");

    JsonObject item = last().getAsJsonArray("items").get(0).getAsJsonObject();
    assertEquals("netherite", item.getAsJsonObject("trim").get("material").getAsString());
  }

  @Test
  void aShulkerBoxIsOpenedWithItsItemsBySlot() {
    Slots contents = steve.box(false, 4, "red_shulker_box");
    contents.with(0, "diamond", 5).with(26, "apple", 3);

    run("shulker Steve inv 4");

    JsonObject message = last();
    assertEquals("shulkerbox", message.get("event").getAsString());
    assertEquals("Steve", message.get("name").getAsString());
    assertEquals("inv", message.get("where").getAsString());
    assertEquals(4, message.get("box").getAsInt());
    assertEquals("minecraft:red_shulker_box", message.get("boxId").getAsString());
    assertEquals(2, message.getAsJsonArray("items").size());
    JsonObject last = message.getAsJsonArray("items").get(1).getAsJsonObject();
    assertEquals(26, last.get("slot").getAsInt());
    assertEquals("minecraft:apple", last.get("id").getAsString());
  }

  @Test
  void aShulkerBoxInTheEnderChestIsOpenedToo() {
    steve.box(true, 10, "shulker_box").with(3, "gold_ingot", 9);

    run("shulker Steve ender 10");

    assertEquals("shulkerbox", last().get("event").getAsString());
    assertEquals("ender", last().get("where").getAsString());
    assertEquals(10, last().get("box").getAsInt());
    assertEquals(3, last().getAsJsonArray("items").get(0).getAsJsonObject().get("slot").getAsInt());
  }

  @Test
  void itemsAreMovedInsideAShulkerBoxAndTheBoxIsSentAgain() {
    Slots contents = steve.box(false, 4, "blue_shulker_box");
    contents.with(0, "diamond", 5).with(1, "stone", 64);

    run("shulkerswap Steve inv 4 0 20");
    assertEquals("minecraft:diamond", contents.items[20].id());
    assertEquals(null, contents.items[0]);
    assertEquals("shulkerbox", last().get("event").getAsString());

    // The same item is added to the stack, like in the other containers.
    contents.with(21, "diamond", 7);
    run("shulkerswap Steve inv 4 20 21");
    assertEquals(12, contents.items[21].count());

    // Two different items trade places.
    run("shulkerswap Steve inv 4 1 21");
    assertEquals("minecraft:diamond", contents.items[1].id());
    assertEquals("minecraft:stone", contents.items[21].id());
  }

  @Test
  void itemsAreDeletedFromInsideAShulkerBox() {
    Slots contents = steve.box(false, 4, "shulker_box");
    contents.with(7, "tnt", 12).with(8, "apple", 1);

    run("shulkerdelete Steve inv 4 7");

    assertEquals(null, contents.items[7]);
    assertEquals(1, last().getAsJsonArray("items").size());
    assertEquals("shulkerbox", last().get("event").getAsString());
  }

  @Test
  void slotsOutsideTheBoxAreRefused() {
    steve.box(false, 4, "shulker_box");

    assertEquals("That is not a slot of the inventory.", errorOf("shulkerswap Steve inv 4 0 27"));
    assertEquals("That is not a slot of the inventory.", errorOf("shulkerdelete Steve inv 4 27"));
    assertEquals("That is not a slot of the inventory.", errorOf("shulker Steve inv 41"));
    assertEquals("That is not a slot of the inventory.", errorOf("shulker Steve ender 27"));
  }

  @Test
  void somethingThatIsNotAShulkerBoxIsRefusedAndNothingElseIsSent() {
    steve.inventory.with(5, "chest", 1);
    steve.inventory.with(6, "red_shulker_box_fake", 1);

    assertEquals("That is not a shulker box.", errorOf("shulker Steve inv 5"));
    assertEquals("That is not a shulker box.", errorOf("shulker Steve inv 9"));
    assertEquals("That is not a shulker box.", errorOf("shulkerswap Steve inv 5 0 1"));
    // The error is the last thing that was sent, no box and no inventory followed it.
    assertEquals("player-error", last().get("event").getAsString());
    assertEquals("That is not a shulker box.", errorOf("shulkerdelete Steve inv 5 0"));
  }

  @Test
  void aShulkerBoxThatTheGameDoesNotOpenIsRefused() {
    // The item says shulker box but the game has no contents for it (a platform without the support).
    steve.inventory.with(4, "shulker_box", 1);

    assertEquals("That is not a shulker box.", errorOf("shulker Steve inv 4"));
  }

  @Test
  void theShulkerCommandsOnlyTakeWhatTheyExpect() {
    steve.box(false, 4, "shulker_box").with(0, "apple", 1);
    int before = log.size();

    run("shulker Steve elsewhere 4");
    run("shulker Steve inv x");
    run("shulker Steve inv 4 5");
    run("shulkerswap Steve inv 4 0");
    run("shulkerswap Steve inv 4 0 1 2");
    run("shulkerdelete Steve inv 4");
    run("shulkerdelete Steve nowhere 4 0");

    assertEquals(before, log.size(), "nothing was sent for a command that is not well formed");
  }

  @Test
  void performanceUsesTheMeasuredTicks() {
    long now = System.nanoTime();
    for (int i = 0; i < 40; i++) {
      helper.ticks().start(now + i * 50_000_000L);
      helper.ticks().end(now + i * 50_000_000L + 5_000_000L);
    }
    run("perf");
    JsonObject message = last();
    assertEquals("performance", message.get("event").getAsString());
    assertTrue(message.get("supported").getAsBoolean());
    assertEquals(5.0, message.getAsJsonObject("mspt").get("avg").getAsDouble(), 0.001);
  }

  @Test
  void performanceCarriesTheTimeAndTheWeather() {
    run("perf");
    JsonObject world = last().getAsJsonObject("world");
    assertEquals(13000, world.get("time").getAsLong());
    assertEquals(4, world.get("day").getAsLong());
    assertTrue(world.get("raining").getAsBoolean());
    assertFalse(world.get("thundering").getAsBoolean());
  }

  @Test
  void performanceHasNoWorldWhenTheGameCannotTell() {
    worldInfo = null;
    run("perf");
    assertFalse(last().has("world"));
  }

  @Test
  void comingAndGoingIsAnnouncedWithinAFewTicks() {
    helper.onStarted();
    log.clear();
    PlayerHandle alex =
        new Steve() {
          public String name() {
            return "Alex";
          }

          public String uuid() {
            return "uuid-alex";
          }
        };
    online.add(alex);
    for (int i = 0; i < 5; i++) {
      helper.onTickStart();
      helper.onTickEnd();
    }
    assertEquals("player-join", last().get("event").getAsString());
    assertEquals("Alex", last().get("name").getAsString());

    online.remove(alex);
    log.clear();
    for (int i = 0; i < 5; i++) {
      helper.onTickStart();
      helper.onTickEnd();
    }
    assertEquals("player-leave", last().get("event").getAsString());
    assertEquals("Alex", last().get("name").getAsString());
  }

  @Test
  void refreshWritesTheCommandFileThenSaysSo() throws Exception {
    run("refresh");
    Path file = root.resolve(CommandScanner.FILE_NAME);
    for (int i = 0; i < 100 && !log.stream().anyMatch(l -> l.contains("\"refreshed\"")); i++) {
      Thread.sleep(50);
    }
    assertTrue(Files.exists(file));
    JsonObject json = new Gson().fromJson(Files.readString(file), JsonObject.class);
    assertEquals(1, json.get("version").getAsInt());
    assertEquals("fabric", json.getAsJsonObject("generator").get("platform").getAsString());
    assertEquals("Warps", json.getAsJsonArray("plugins").get(0).getAsJsonObject().get("name").getAsString());

    List<String> names = new ArrayList<>();
    json.getAsJsonObject("root")
        .getAsJsonArray("children")
        .forEach(node -> names.add(node.getAsJsonObject().get("name").getAsString()));
    assertEquals(List.of("gamemode", "warp"), names, "the panel's own command is not completed");
    assertEquals(
        "minecraft",
        json.getAsJsonObject("root").getAsJsonArray("children").get(0).getAsJsonObject().get("plugin").getAsString());
    assertFalse(Files.exists(root.resolve(CommandScanner.FILE_NAME + ".tmp")));
    assertNotNull(messagesContaining("commands-updated"));
  }

  private String messagesContaining(String text) {
    return log.stream().filter(l -> l.contains(text)).findFirst().orElse(null);
  }

  @Test
  void aScanAfterTheCommandsChangedIsDebounced() throws Exception {
    helper.onStarted();
    helper.onCommandsRegistered();
    CountDownLatch written = new CountDownLatch(1);
    for (int i = 0; i < 39; i++) {
      helper.onTickStart();
      helper.onTickEnd();
    }
    assertFalse(Files.exists(root.resolve(CommandScanner.FILE_NAME)));
    helper.onTickStart();
    helper.onTickEnd();
    for (int i = 0; i < 100 && !Files.exists(root.resolve(CommandScanner.FILE_NAME)); i++) {
      written.await(50, TimeUnit.MILLISECONDS);
    }
    assertTrue(Files.exists(root.resolve(CommandScanner.FILE_NAME)));
  }
}
