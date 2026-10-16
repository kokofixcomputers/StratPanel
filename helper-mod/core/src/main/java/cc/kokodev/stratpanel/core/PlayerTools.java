package cc.kokodev.stratpanel.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** What the panel can do to a player who is online: look into the inventory, move and delete items, heal and feed. */
public final class PlayerTools {

  // The names of Java players, and of Bedrock players behind Geyser, which start with a dot.
  private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9_.\\-]{1,32}$");
  private static final int MAX_TEXT = 80;

  private final Game game;
  private final Bridge bridge;

  public PlayerTools(Game game, Bridge bridge) {
    this.game = game;
    this.bridge = bridge;
  }

  /** The player with that name, or null after telling the panel there is none. */
  public PlayerHandle find(String action, String name) {
    PlayerHandle player = NAME.matcher(name).matches() ? game.player(name) : null;
    if (player == null) {
      Map<String, Object> fields = new LinkedHashMap<>();
      fields.put("name", name.length() > 32 ? name.substring(0, 32) : name);
      fields.put("action", action);
      fields.put("error", "That player is not online.");
      bridge.send("player-error", fields);
    }
    return player;
  }

  public void heal(PlayerHandle player) {
    player.setHealth(player.maxHealth());
  }

  /** Adds to or takes from the health, in hit points (2 is a heart). The numbers are worked out in PlayerVitals. */
  public void changeHealth(PlayerHandle player, int delta) {
    player.setHealth(PlayerVitals.adjustedHealth(player.health(), delta, player.maxHealth()));
  }

  /** Adds to or takes from the hunger bar, and keeps the saturation from being more than what is left of it. */
  public void changeHunger(PlayerHandle player, int delta) {
    int food = PlayerVitals.adjustedFood(player.food(), delta);
    player.setFood(food);
    player.setSaturation((float) Math.min(player.saturation(), food));
  }

  /** Adds to or takes from the experience level, the progress to the next level stays as it is. */
  public void changeLevels(PlayerHandle player, int delta) {
    player.setLevel(PlayerVitals.adjustedLevel(player.level(), delta));
  }

  /** Puts the player in a game mode. The name is checked by the caller with PlayerVitals.parseGameMode. */
  public void setGameMode(PlayerHandle player, String mode) {
    player.setGameMode(mode);
  }

  public void feed(PlayerHandle player) {
    player.setFood(20);
    player.setSaturation(20f);
    player.setExhaustion(0f);
  }

  /** Puts the item of one slot in the other and the other's in the first, or adds to a stack of the same item. */
  public void swap(PlayerHandle player, int from, int to) {
    swapIn(player, player.inventory(), InventorySlots.COUNT, true, from, to);
  }

  public void swapEnder(PlayerHandle player, int from, int to) {
    swapIn(player, player.enderChest(), InventorySlots.ENDER_COUNT, false, from, to);
  }

  private void swapIn(
      PlayerHandle player, ItemContainer container, int size, boolean worn, int from, int to) {
    if (!InventorySlots.isValidIn(from, size) || !InventorySlots.isValidIn(to, size) || from == to) {
      error(player, "swap", "That is not a slot of the inventory.");
      return;
    }
    if (container.canMerge(from, to)) {
      // The same item: fill the stack, what does not fit stays where it was.
      container.merge(from, to);
      return;
    }
    // Only the slots for armor are picky, the ender chest takes everything.
    if (worn && (!container.accepts(to, from) || !container.accepts(from, to))) {
      error(player, "swap", "That item can not go in that slot.");
      return;
    }
    container.exchange(from, to);
  }

  public void delete(PlayerHandle player, int slot) {
    deleteIn(player, player.inventory(), InventorySlots.COUNT, slot);
  }

  public void deleteEnder(PlayerHandle player, int slot) {
    deleteIn(player, player.enderChest(), InventorySlots.ENDER_COUNT, slot);
  }

  private void deleteIn(PlayerHandle player, ItemContainer container, int size, int slot) {
    if (!InventorySlots.isValidIn(slot, size)) {
      error(player, "delete", "That is not a slot of the inventory.");
      return;
    }
    container.clear(slot);
  }

  /** Sends the whole inventory: every slot that is not empty. */
  public void sendInventory(PlayerHandle player) {
    send(player, player.inventory(), InventorySlots.COUNT, "inventory");
  }

  /** Sends what is in the ender chest of the player, which is the same chest wherever they open it. */
  public void sendEnderChest(PlayerHandle player) {
    send(player, player.enderChest(), InventorySlots.ENDER_COUNT, "enderchest");
  }

  private void send(PlayerHandle player, ItemContainer container, int size, String event) {
    List<Map<String, Object>> items = new ArrayList<>();
    for (int slot = 0; slot < size; slot++) {
      ItemInfo item = container.describe(slot);
      if (item != null) {
        items.add(snapshot(slot, item));
      }
    }
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", player.name());
    fields.put("uuid", player.uuid());
    fields.put("items", items);
    bridge.send(event, fields);
  }

  private void error(PlayerHandle player, String action, String message) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", player.name());
    fields.put("action", action);
    fields.put("error", message);
    bridge.send("player-error", fields);
  }

  static Map<String, Object> snapshot(int slot, ItemInfo item) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("slot", slot);
    fields.put("id", item.id());
    fields.put("count", item.count());
    if (item.maxDamage() > 0 && item.damage() > 0) {
      fields.put("damage", item.damage());
      fields.put("maxDamage", item.maxDamage());
    }
    if (item.name() != null && !item.name().isBlank()) {
      fields.put("name", clean(item.name()));
    }
    if (item.enchants() != null && !item.enchants().isEmpty()) {
      fields.put("enchants", item.enchants());
    }
    return fields;
  }

  /** Text a player chose, without anything that could break a console line. */
  public static String clean(String text) {
    String plain = text.replaceAll("\\p{Cntrl}", " ").trim();
    return plain.length() > MAX_TEXT ? plain.substring(0, MAX_TEXT) : plain;
  }
}
