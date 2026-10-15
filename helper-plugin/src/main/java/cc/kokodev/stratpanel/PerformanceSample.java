package cc.kokodev.stratpanel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the panel shows as TPS and MSPT, built from the numbers the server API gives. Kept free of the Bukkit classes so it
 * can be tested without a server.
 */
final class PerformanceSample {

  /** A server never ticks faster than this, a value above it is an artefact of how it is measured. */
  static final double MAX_TPS = 20.0;

  private PerformanceSample() {}

  /**
   * The fields of a {@code performance} message.
   *
   * @param tps ticks per second averaged over the last 1, 5 and 15 minutes, null when the server cannot tell
   * @param tickNanos the duration of the most recent ticks in nanoseconds, null when the server cannot tell
   * @param averageMs the server's own average tick time in milliseconds, NaN when it cannot tell
   */
  static Map<String, Object> fields(double[] tps, long[] tickNanos, double averageMs) {
    Map<String, Object> fields = new LinkedHashMap<>();

    if (tps != null && tps.length > 0) {
      List<Double> values = new ArrayList<>();
      for (double value : tps) {
        values.add(round(Math.min(Math.max(value, 0.0), MAX_TPS)));
      }
      fields.put("tps", values);
    }

    double min = Double.POSITIVE_INFINITY;
    double max = 0.0;
    double sum = 0.0;
    int count = 0;
    if (tickNanos != null) {
      for (long nanos : tickNanos) {
        // The history starts out with zeros until it has filled.
        if (nanos <= 0) {
          continue;
        }
        double ms = nanos / 1_000_000.0;
        min = Math.min(min, ms);
        max = Math.max(max, ms);
        sum += ms;
        count++;
      }
    }

    Map<String, Object> mspt = new LinkedHashMap<>();
    if (count > 0) {
      mspt.put("avg", round(sum / count));
      mspt.put("min", round(min));
      mspt.put("max", round(max));
    } else if (!Double.isNaN(averageMs) && !Double.isInfinite(averageMs) && averageMs >= 0) {
      mspt.put("avg", round(averageMs));
    }
    if (!mspt.isEmpty()) {
      fields.put("mspt", mspt);
    }

    fields.put("supported", fields.containsKey("tps") || fields.containsKey("mspt"));
    return fields;
  }

  private static double round(double value) {
    return Math.round(value * 100.0) / 100.0;
  }
}
