package cc.kokodev.stratpanel.core;

import java.util.Map;

/**
 * What the panel shows of an item stack. {@code damage} and {@code maxDamage} are 0 for an item that does not wear.
 * {@code trim} is the armor trim on a piece of armor, null for anything else.
 */
public record ItemInfo(
    String id,
    int count,
    int damage,
    int maxDamage,
    String name,
    Map<String, Integer> enchants,
    Trim trim) {

  /** The material and pattern of an armor trim, such as {@code gold} and {@code coast} (with the namespace for a modded one). */
  public record Trim(String material, String pattern) {}

  /** An item without a trim. */
  public ItemInfo(
      String id, int count, int damage, int maxDamage, String name, Map<String, Integer> enchants) {
    this(id, count, damage, maxDamage, name, enchants, null);
  }
}
