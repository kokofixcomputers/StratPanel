package cc.kokodev.stratpanel;

import java.util.Locale;

/**
 * The slots of a player inventory as the Bukkit API numbers them, and what may be put in the ones that are picky. Kept free
 * of the Bukkit classes so it can be tested without a server.
 *
 * <p>0 to 8 is the hotbar, 9 to 35 the rest of the inventory, 36 to 39 the boots, leggings, chestplate and helmet, 40 the
 * off hand.
 */
final class InventorySlots {

  static final int BOOTS = 36;
  static final int LEGGINGS = 37;
  static final int CHESTPLATE = 38;
  static final int HELMET = 39;
  static final int OFF_HAND = 40;
  static final int COUNT = 41;
  /** An ender chest has 3 rows of 9. */
  static final int ENDER_COUNT = 27;

  private InventorySlots() {}

  static boolean isValid(int slot) {
    return isValidIn(slot, COUNT);
  }

  /** Whether a slot exists in an inventory of that many slots. */
  static boolean isValidIn(int slot, int size) {
    return slot >= 0 && slot < size;
  }

  /**
   * Whether an item can be worn or held in a slot. Everything fits in the normal slots and the off hand, an armor slot only
   * takes what the game lets a player put on there. Nothing at all (air) always fits.
   *
   * @param material the name of the material, such as {@code DIAMOND_HELMET}
   */
  static boolean accepts(int slot, String material) {
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
