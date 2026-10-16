package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PerformanceSampleTest {

  @Test
  void roundsAndCapsTps() {
    Map<String, Object> fields = PerformanceSample.fields(new double[] {19.98765, 20.4, -1}, null, Double.NaN);

    assertEquals(List.of(19.99, 20.0, 0.0), fields.get("tps"));
    assertTrue((Boolean) fields.get("supported"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void worksOutMsptFromTheRecentTicksAndIgnoresUnfilledSlots() {
    long[] ticks = {0, 0, 10_000_000L, 20_000_000L, 45_500_000L};

    Map<String, Object> mspt = (Map<String, Object>) PerformanceSample.fields(null, ticks, Double.NaN).get("mspt");

    assertEquals(25.17, mspt.get("avg"));
    assertEquals(10.0, mspt.get("min"));
    assertEquals(45.5, mspt.get("max"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void fallsBackToTheServersAverage() {
    Map<String, Object> mspt =
        (Map<String, Object>) PerformanceSample.fields(null, new long[] {0, 0}, 12.3456).get("mspt");

    assertEquals(Map.of("avg", 12.35), mspt);
  }

  @Test
  void saysWhenTheServerCannotTell() {
    Map<String, Object> fields = PerformanceSample.fields(null, null, Double.NaN);

    assertFalse((Boolean) fields.get("supported"));
    assertNull(fields.get("tps"));
    assertNull(fields.get("mspt"));
  }
}
