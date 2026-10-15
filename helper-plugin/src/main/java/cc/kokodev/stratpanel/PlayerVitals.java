package cc.kokodev.stratpanel;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The health bar, hunger bar and experience of one player as the panel draws them. Kept free of the Bukkit classes so it can
 * be tested without a server.
 */
final class PlayerVitals {

  private PlayerVitals() {}

  /**
   * The fields of one entry of a {@code vitals} message.
   *
   * @param health hit points, 20 is ten hearts
   * @param maxHealth the most hit points the player can have
   * @param absorption the extra yellow hearts, 0 for none
   * @param food the hunger bar, 0 to 20
   * @param saturation what keeps the hunger bar from falling, never more than food
   * @param level the experience level
   * @param exp progress to the next level, 0 to 1
   */
  static Map<String, Object> fields(
      String name,
      String uuid,
      double health,
      double maxHealth,
      double absorption,
      int food,
      double saturation,
      int level,
      double exp) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", name);
    fields.put("uuid", uuid);
    fields.put("health", round(clamp(health, 0.0, 2048.0)));
    fields.put("maxHealth", round(clamp(maxHealth, 1.0, 2048.0)));
    fields.put("absorption", round(clamp(absorption, 0.0, 2048.0)));
    int hunger = Math.min(Math.max(food, 0), 20);
    fields.put("food", hunger);
    fields.put("saturation", round(clamp(saturation, 0.0, hunger)));
    fields.put("level", Math.max(level, 0));
    fields.put("exp", round(clamp(exp, 0.0, 1.0)));
    return fields;
  }

  private static double clamp(double value, double min, double max) {
    if (Double.isNaN(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private static double round(double value) {
    return Math.round(value * 100.0) / 100.0;
  }
}
