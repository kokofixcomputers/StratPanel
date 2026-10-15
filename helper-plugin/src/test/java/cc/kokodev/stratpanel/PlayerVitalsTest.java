package cc.kokodev.stratpanel;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;

class PlayerVitalsTest {

  @Test
  void roundsWhatTheServerReports() {
    Map<String, Object> fields =
        PlayerVitals.fields("Steve", "u", 18.456, 20.0, 0.0, 17, 5.2345, 12, 0.3333);

    assertEquals(18.46, fields.get("health"));
    assertEquals(20.0, fields.get("maxHealth"));
    assertEquals(17, fields.get("food"));
    assertEquals(5.23, fields.get("saturation"));
    assertEquals(12, fields.get("level"));
    assertEquals(0.33, fields.get("exp"));
  }

  @Test
  void keepsNumbersInTheirRange() {
    Map<String, Object> fields =
        PlayerVitals.fields("Steve", "u", -5.0, 0.0, Double.NaN, 99, 50.0, -3, 7.0);

    assertEquals(0.0, fields.get("health"));
    assertEquals(1.0, fields.get("maxHealth"));
    assertEquals(0.0, fields.get("absorption"));
    assertEquals(20, fields.get("food"));
    // Saturation cannot be above the hunger bar.
    assertEquals(20.0, fields.get("saturation"));
    assertEquals(0, fields.get("level"));
    assertEquals(1.0, fields.get("exp"));
  }
}
