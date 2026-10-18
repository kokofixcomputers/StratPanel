package cc.kokodev.stratpanel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.block.ShulkerBox;
import org.bukkit.inventory.meta.BlockStateMeta;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.ItemMeta;

/** What the panel can do to a player who is online: look into the inventory, move and delete items, heal and feed. */
final class PlayerTools {

  // The names of Java players, and of Bedrock players behind Geyser, which start with a dot.
  private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9_.\\-]{1,32}$");
  private static final int MAX_TEXT = 80;

  private final Bridge bridge;

  PlayerTools(Bridge bridge) {
    this.bridge = bridge;
  }

  /** The player with that name, or null after telling the panel there is none. */
  Player find(String action, String name) {
    Player player = NAME.matcher(name).matches() ? Bukkit.getPlayerExact(name) : null;
    if (player == null) {
      Map<String, Object> fields = new LinkedHashMap<>();
      fields.put("name", name.length() > 32 ? name.substring(0, 32) : name);
      fields.put("action", action);
      fields.put("error", "That player is not online.");
      bridge.send("player-error", fields);
    }
    return player;
  }

  @SuppressWarnings("deprecation")
  void heal(Player player) {
    // The attribute's name changed between versions, this method exists in all of them.
    player.setHealth(player.getMaxHealth());
  }

  /** Adds to or takes from the health, in hit points (2 is a heart). The numbers are worked out in PlayerVitals. */
  @SuppressWarnings("deprecation")
  void changeHealth(Player player, int delta) {
    player.setHealth(PlayerVitals.adjustedHealth(player.getHealth(), delta, player.getMaxHealth()));
  }

  /** Adds to or takes from the hunger bar, and keeps the saturation from being more than what is left of it. */
  void changeHunger(Player player, int delta) {
    int food = PlayerVitals.adjustedFood(player.getFoodLevel(), delta);
    player.setFoodLevel(food);
    player.setSaturation(Math.min(player.getSaturation(), (float) food));
  }

  /** Adds to or takes from the experience level, the progress to the next level stays as it is. */
  void changeLevels(Player player, int delta) {
    player.setLevel(PlayerVitals.adjustedLevel(player.getLevel(), delta));
  }

  /** Puts the player in a game mode. The name is checked by the caller with PlayerVitals.parseGameMode. */
  void setGameMode(Player player, String mode) {
    player.setGameMode(GameMode.valueOf(mode.toUpperCase(java.util.Locale.ROOT)));
  }

  void feed(Player player) {
    player.setFoodLevel(20);
    player.setSaturation(20f);
    player.setExhaustion(0f);
  }

  /** Puts the item of one slot in the other and the other's in the first, or adds to a stack of the same item. */
  void swap(Player player, int from, int to) {
    swapIn(player, player.getInventory(), InventorySlots.COUNT, true, from, to);
  }

  void swapEnder(Player player, int from, int to) {
    swapIn(player, player.getEnderChest(), InventorySlots.ENDER_COUNT, false, from, to);
  }

  private void swapIn(
      Player player, Inventory inventory, int size, boolean worn, int from, int to) {
    if (!InventorySlots.isValidIn(from, size) || !InventorySlots.isValidIn(to, size) || from == to) {
      error(player, "swap", "That is not a slot of the inventory.");
      return;
    }
    ItemStack a = inventory.getItem(from);
    ItemStack b = inventory.getItem(to);

    if (a != null && b != null && a.isSimilar(b) && b.getAmount() < b.getMaxStackSize()) {
      // The same item: fill the stack, what does not fit stays where it was.
      int moved = Math.min(a.getAmount(), b.getMaxStackSize() - b.getAmount());
      b.setAmount(b.getAmount() + moved);
      a.setAmount(a.getAmount() - moved);
      inventory.setItem(to, b);
      inventory.setItem(from, a.getAmount() <= 0 ? null : a);
      return;
    }

    // Only the slots for armor are picky, the ender chest takes everything.
    if (worn && (!accepts(to, a) || !accepts(from, b))) {
      error(player, "swap", "That item can not go in that slot.");
      return;
    }
    inventory.setItem(from, b);
    inventory.setItem(to, a);
  }

  void delete(Player player, int slot) {
    deleteIn(player, player.getInventory(), InventorySlots.COUNT, slot);
  }

  void deleteEnder(Player player, int slot) {
    deleteIn(player, player.getEnderChest(), InventorySlots.ENDER_COUNT, slot);
  }

  private void deleteIn(Player player, Inventory inventory, int size, int slot) {
    if (!InventorySlots.isValidIn(slot, size)) {
      error(player, "delete", "That is not a slot of the inventory.");
      return;
    }
    inventory.setItem(slot, null);
  }

  private static final String NOT_A_BOX = "That is not a shulker box.";

  /** A shulker box that is an item: what is in it, and how to put a change back in the item. */
  private record Box(Inventory contents, Runnable save, String id) {}

  /**
   * The shulker box in a slot of the inventory or the ender chest, null after telling the panel why not: the slot is not one,
   * or there is no shulker box in it (it was moved since the panel looked).
   */
  private Box openBox(Player player, String action, boolean ender, int slot) {
    Inventory parent = ender ? player.getEnderChest() : player.getInventory();
    int size = ender ? InventorySlots.ENDER_COUNT : InventorySlots.COUNT;
    if (!InventorySlots.isValidIn(slot, size)) {
      error(player, action, "That is not a slot of the inventory.");
      return null;
    }
    ItemStack item = parent.getItem(slot);
    if (item != null
        && InventorySlots.isShulkerBox(item.getType().name())
        && item.getItemMeta() instanceof BlockStateMeta meta
        && meta.getBlockState() instanceof ShulkerBox shulker) {
      // The state is a copy of the box: its inventory is changed and then put back in the item.
      return new Box(
          shulker.getInventory(),
          () -> {
            meta.setBlockState(shulker);
            item.setItemMeta(meta);
            parent.setItem(slot, item);
          },
          item.getType().getKey().toString());
    }
    error(player, action, NOT_A_BOX);
    return null;
  }

  /**
   * Sends what is in a shulker box: the {@code shulkerbox} message with where the box is ({@code inv} or {@code ender}), its
   * slot, its item id and the items by the slots 0 to 26 of the box.
   */
  void sendShulker(Player player, boolean ender, int slot) {
    Box box = openBox(player, "shulker", ender, slot);
    if (box == null) {
      return;
    }
    List<Map<String, Object>> items = new ArrayList<>();
    for (int inner = 0; inner < InventorySlots.SHULKER_COUNT; inner++) {
      ItemStack item = box.contents().getItem(inner);
      if (item != null && !item.getType().isAir()) {
        items.add(snapshot(inner, item));
      }
    }
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", player.getName());
    fields.put("uuid", player.getUniqueId().toString());
    fields.put("where", ender ? "ender" : "inv");
    fields.put("box", slot);
    fields.put("boxId", box.id());
    fields.put("items", items);
    bridge.send("shulkerbox", fields);
  }

  /** Moves items inside a shulker box like in the ender chest. Returns whether the box was found. */
  boolean swapShulker(Player player, boolean ender, int slot, int from, int to) {
    Box box = openBox(player, "swap", ender, slot);
    if (box == null) {
      return false;
    }
    swapIn(player, box.contents(), InventorySlots.SHULKER_COUNT, false, from, to);
    box.save().run();
    return true;
  }

  /** Deletes an item from inside a shulker box. Returns whether the box was found. */
  boolean deleteShulker(Player player, boolean ender, int slot, int inner) {
    Box box = openBox(player, "delete", ender, slot);
    if (box == null) {
      return false;
    }
    deleteIn(player, box.contents(), InventorySlots.SHULKER_COUNT, inner);
    box.save().run();
    return true;
  }

  /** Sends the whole inventory: every slot that is not empty. */
  void sendInventory(Player player) {
    send(player, player.getInventory(), InventorySlots.COUNT, "inventory");
  }

  /** Sends what is in the ender chest of the player, which is the same chest wherever they open it. */
  void sendEnderChest(Player player) {
    send(player, player.getEnderChest(), InventorySlots.ENDER_COUNT, "enderchest");
  }

  private void send(Player player, Inventory inventory, int size, String event) {
    List<Map<String, Object>> items = new ArrayList<>();
    for (int slot = 0; slot < size; slot++) {
      ItemStack item = inventory.getItem(slot);
      if (item != null && !item.getType().isAir()) {
        items.add(snapshot(slot, item));
      }
    }
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", player.getName());
    fields.put("uuid", player.getUniqueId().toString());
    fields.put("items", items);
    bridge.send(event, fields);
  }

  private void error(Player player, String action, String message) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", player.getName());
    fields.put("action", action);
    fields.put("error", message);
    bridge.send("player-error", fields);
  }

  private static boolean accepts(int slot, ItemStack item) {
    return item == null || InventorySlots.accepts(slot, item.getType().name());
  }

  private static Map<String, Object> snapshot(int slot, ItemStack item) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("slot", slot);
    fields.put("id", item.getType().getKey().toString());
    fields.put("count", item.getAmount());

    ItemMeta meta = item.getItemMeta();
    if (meta instanceof Damageable damageable
        && damageable.hasDamage()
        && item.getType().getMaxDurability() > 0) {
      fields.put("damage", damageable.getDamage());
      fields.put("maxDamage", (int) item.getType().getMaxDurability());
    }
    if (meta != null && meta.hasDisplayName()) {
      Component name = meta.displayName();
      if (name != null) {
        fields.put("name", clean(PlainTextComponentSerializer.plainText().serialize(name)));
      }
    }
    Map<Enchantment, Integer> enchantments = item.getEnchantments();
    if (!enchantments.isEmpty()) {
      Map<String, Integer> enchants = new LinkedHashMap<>();
      enchantments.forEach((enchantment, level) -> enchants.put(enchantment.getKey().getKey(), level));
      fields.put("enchants", enchants);
    }
    return fields;
  }

  /** Text a player chose, without anything that could break a console line. */
  static String clean(String text) {
    String plain = text.replaceAll("\\p{Cntrl}", " ").trim();
    return plain.length() > MAX_TEXT ? plain.substring(0, MAX_TEXT) : plain;
  }
}
