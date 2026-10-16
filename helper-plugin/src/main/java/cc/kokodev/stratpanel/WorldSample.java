package cc.kokodev.stratpanel;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The time and the weather as the panel shows them in the pill on the console. Kept free of the Bukkit classes so it can be
 * tested without a server.
 */
final class WorldSample {

  /** One day of Minecraft in ticks. */
  static final long DAY = 24000L;

  private WorldSample() {}

  /**
   * The fields of the {@code world} entry of a {@code performance} message.
   *
   * @param time the time of the world in ticks, it counts on for ever, so the time of day is what is left after whole days
   */
  static Map<String, Object> fields(long time, boolean raining, boolean thundering) {
    long total = Math.max(time, 0L);
    Map<String, Object> fields = new LinkedHashMap<>();
    // 0 is sunrise (6:00), 6000 noon, 12000 sunset, 18000 midnight.
    fields.put("time", total % DAY);
    fields.put("day", total / DAY + 1);
    // Thunder only comes with rain in the game, the panel draws it as a storm either way.
    fields.put("raining", raining || thundering);
    fields.put("thundering", thundering);
    return fields;
  }
}
