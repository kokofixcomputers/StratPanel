package cc.kokodev.stratpanel.core;

/** One player who is online. Valid for the moment it was handed out, do not keep it. */
public interface PlayerHandle {

  String name();

  String uuid();

  double health();

  double maxHealth();

  double absorption();

  int food();

  double saturation();

  int level();

  /** Progress to the next level, 0 to 1. */
  double exp();

  /** survival, creative, adventure or spectator. */
  String gameMode();

  void setHealth(double health);

  void setFood(int food);

  void setSaturation(float saturation);

  void setExhaustion(float exhaustion);

  void setLevel(int level);

  /** One of {@link PlayerVitals#GAME_MODES}. */
  void setGameMode(String mode);

  /** The inventory with the slots numbered as in {@link InventorySlots}. */
  ItemContainer inventory();

  ItemContainer enderChest();

  /**
   * What is in the shulker box in a slot of the inventory (or, with {@code ender}, of the ender chest): a container of
   * {@link InventorySlots#SHULKER_COUNT} slots that writes every change back to the item. Null when the slot does not hold a
   * shulker box.
   */
  default ItemContainer shulkerBox(boolean ender, int slot) {
    return null;
  }
}
