package cc.kokodev.stratpanel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import org.junit.jupiter.api.Test;

class PlayerVitalsTest {

  @Test
  void roundsWhatTheServerReports() {
    Map<String, Object> fields =
        PlayerVitals.fields("Steve", "u", 18.456, 20.0, 0.0, 17, 5.2345, 12, 0.3333, "creative");

    assertEquals(18.46, fields.get("health"));
    assertEquals(20.0, fields.get("maxHealth"));
    assertEquals(17, fields.get("food"));
    assertEquals(5.23, fields.get("saturation"));
    assertEquals(12, fields.get("level"));
    assertEquals(0.33, fields.get("exp"));
    assertEquals("creative", fields.get("gameMode"));
  }

  @Test
  void knowsTheFourGameModes() {
    assertEquals("creative", PlayerVitals.parseGameMode("Creative"));
    assertEquals("spectator", PlayerVitals.parseGameMode("SPECTATOR"));
    assertEquals("survival", PlayerVitals.parseGameMode("survival"));
    assertEquals("adventure", PlayerVitals.parseGameMode("adventure"));
    assertNull(PlayerVitals.parseGameMode("hardcore"));
    assertNull(PlayerVitals.parseGameMode(""));
  }

  @Test
  void healthStaysBetweenHalfAHeartAndTheMaximum() {
    assertEquals(12.0, PlayerVitals.adjustedHealth(10.0, 2.0, 20.0));
    assertEquals(20.0, PlayerVitals.adjustedHealth(19.0, 2.0, 20.0));
    assertEquals(8.0, PlayerVitals.adjustedHealth(10.0, -2.0, 20.0));
    // A click cannot kill a player.
    assertEquals(1.0, PlayerVitals.adjustedHealth(2.0, -10.0, 20.0));
    assertEquals(1.0, PlayerVitals.adjustedHealth(1.0, -2.0, 20.0));
  }

  @Test
  void hungerAndLevelsStayInRange() {
    assertEquals(20, PlayerVitals.adjustedFood(19, 2));
    assertEquals(0, PlayerVitals.adjustedFood(1, -2));
    assertEquals(14, PlayerVitals.adjustedFood(12, 2));
    assertEquals(0, PlayerVitals.adjustedLevel(3, -5));
    assertEquals(32, PlayerVitals.adjustedLevel(27, 5));
    assertEquals(PlayerVitals.MAX_LEVEL, PlayerVitals.adjustedLevel(PlayerVitals.MAX_LEVEL, 1000));
    // A level above the limit is not cut down by stepping up, and can still be stepped down, also at the largest int.
    assertEquals(Integer.MAX_VALUE - 96, PlayerVitals.adjustedLevel(Integer.MAX_VALUE - 96, 5));
    assertEquals(Integer.MAX_VALUE - 97, PlayerVitals.adjustedLevel(Integer.MAX_VALUE - 96, -1));
    assertEquals(Integer.MAX_VALUE, PlayerVitals.adjustedLevel(Integer.MAX_VALUE, 1));
    assertEquals(0, PlayerVitals.adjustedLevel(Integer.MAX_VALUE, Integer.MIN_VALUE));
  }

  @Test
  void keepsNumbersInTheirRange() {
    Map<String, Object> fields =
        PlayerVitals.fields("Steve", "u", -5.0, 0.0, Double.NaN, 99, 50.0, -3, 7.0, "nonsense");

    assertEquals(0.0, fields.get("health"));
    assertEquals(1.0, fields.get("maxHealth"));
    assertEquals(0.0, fields.get("absorption"));
    assertEquals(20, fields.get("food"));
    // Saturation cannot be above the hunger bar.
    assertEquals(20.0, fields.get("saturation"));
    assertEquals(0, fields.get("level"));
    assertEquals(1.0, fields.get("exp"));
    // A mode that is not one is shown as survival.
    assertEquals("survival", fields.get("gameMode"));
  }
}
