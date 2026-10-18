package cc.kokodev.stratpanel;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
   * @param gameMode survival, creative, adventure or spectator
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
      double exp,
      String gameMode) {
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
    fields.put("gameMode", GAME_MODES.contains(gameMode) ? gameMode : "survival");
    return fields;
  }

  /** The game modes a player can be in, as the panel names them. */
  static final List<String> GAME_MODES = List.of("survival", "creative", "adventure", "spectator");

  /** The game mode for what was typed, null when it is not one. Names are written in small letters. */
  static String parseGameMode(String text) {
    String mode = text.toLowerCase(Locale.ROOT);
    return GAME_MODES.contains(mode) ? mode : null;
  }

  /** The highest level a player can be given from the panel, the game itself stops far beyond. */
  static final int MAX_LEVEL = 100000;

  /**
   * The health after adding or taking some. It never goes below 1 (half a heart), so a click on the panel cannot kill a player,
   * and never above the most the player can have.
   */
  static double adjustedHealth(double current, double delta, double max) {
    return clamp(current + delta, Math.min(1.0, max), Math.max(max, 1.0));
  }

  /** The hunger bar after adding or taking some, between empty and full. */
  static int adjustedFood(int current, int delta) {
    return (int) clamp((double) current + delta, 0.0, 20.0);
  }

  /**
   * The experience level after adding or taking some, never below 0 and not above {@link #MAX_LEVEL}. A level that is above that
   * already (a player can have billions, the game allows up to the largest int) is never lowered by a click on "+", it only stops
   * growing.
   */
  static int adjustedLevel(int current, int delta) {
    return (int) clamp((double) current + delta, 0.0, Math.max(MAX_LEVEL, current));
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
