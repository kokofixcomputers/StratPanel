package cc.kokodev.stratpanel.core;

import java.util.Locale;

/**
 * The slots of a player inventory as the Bukkit API numbers them, and what may be put in the ones that are picky. Kept free
 * of the Bukkit classes so it can be tested without a server.
 *
 * <p>0 to 8 is the hotbar, 9 to 35 the rest of the inventory, 36 to 39 the boots, leggings, chestplate and helmet, 40 the
 * off hand.
 */
public final class InventorySlots {

  public static final int BOOTS = 36;
  public static final int LEGGINGS = 37;
  public static final int CHESTPLATE = 38;
  public static final int HELMET = 39;
  public static final int OFF_HAND = 40;
  public static final int COUNT = 41;
  /** An ender chest has 3 rows of 9. */
  public static final int ENDER_COUNT = 27;
  /** A shulker box has 3 rows of 9, the same as an ender chest. */
  public static final int SHULKER_COUNT = 27;

  private InventorySlots() {}

  /** Whether an item id (such as {@code minecraft:red_shulker_box}) is a shulker box, of any colour. */
  public static boolean isShulkerBox(String id) {
    return id != null && id.toLowerCase(Locale.ROOT).endsWith("shulker_box");
  }

  public static boolean isValid(int slot) {
    return isValidIn(slot, COUNT);
  }

  /** Whether a slot exists in an inventory of that many slots. */
  public static boolean isValidIn(int slot, int size) {
    return slot >= 0 && slot < size;
  }

  /**
   * Whether an item can be worn or held in a slot. Everything fits in the normal slots and the off hand, an armor slot only
   * takes what the game lets a player put on there. Nothing at all (air) always fits.
   *
   * @param material the name of the material, such as {@code DIAMOND_HELMET}
   */
  public static boolean accepts(int slot, String material) {
    String name = material.toUpperCase(Locale.ROOT);
    if (name.equals("AIR") || name.equals("CAVE_AIR") || name.equals("VOID_AIR")) {
      return true;
    }
    switch (slot) {
      case HELMET:
        return name.endsWith("_HELMET")
            || name.equals("CARVED_PUMPKIN")
            || name.endsWith("_HEAD")
            || name.endsWith("_SKULL");
      case CHESTPLATE:
        return name.endsWith("_CHESTPLATE") || name.equals("ELYTRA");
      case LEGGINGS:
        return name.endsWith("_LEGGINGS");
      case BOOTS:
        return name.endsWith("_BOOTS");
      default:
        return true;
    }
  }
}
