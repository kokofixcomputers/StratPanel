package cc.kokodev.stratpanel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

class WorldSampleTest {

  @Test
  void theTimeOfDayIsWhatIsLeftAfterWholeDays() {
    Map<String, Object> fields = WorldSample.fields(24000L * 12 + 6000, false, false);
    assertEquals(6000L, fields.get("time"));
    assertEquals(13L, fields.get("day"));
  }

  @Test
  void theFirstDayIsDayOne() {
    assertEquals(1L, WorldSample.fields(0, false, false).get("day"));
    assertEquals(1L, WorldSample.fields(23999, false, false).get("day"));
    assertEquals(2L, WorldSample.fields(24000, false, false).get("day"));
  }

  @Test
  void aTimeBelowZeroIsZero() {
    assertEquals(0L, WorldSample.fields(-5, false, false).get("time"));
  }

  @Test
  void thunderIsRainToo() {
    Map<String, Object> storm = WorldSample.fields(100, false, true);
    assertTrue((boolean) storm.get("raining"));
    assertTrue((boolean) storm.get("thundering"));
    assertFalse((boolean) WorldSample.fields(100, false, false).get("raining"));
  }
}
