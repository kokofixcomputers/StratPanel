package cc.kokodev.stratpanel.core;

/** A list of item slots: the inventory of a player or an ender chest. */
public interface ItemContainer {

  int size();

  /** What is in the slot, null when it is empty. */
  ItemInfo describe(int slot);

  /** Whether the item in {@code from} is the same item as the one in {@code to} and {@code to} has room for more. */
  boolean canMerge(int from, int to);

  /** Moves as much of the stack in {@code from} onto the one in {@code to} as fits. */
  void merge(int from, int to);

  /** Puts the item of one slot in the other and the other's in the first. */
  void exchange(int a, int b);

  void clear(int slot);

  /** Whether the item that is in {@code from} may be put in {@code to} (armor slots only take armor). */
  boolean accepts(int to, int from);
}
