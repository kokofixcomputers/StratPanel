package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class GenerationTest {

  @Test
  void eachStretchOfOneTwentyHasItsOwnBuild() {
    assertEquals(Generation.V120, Generation.forMinecraft("1.20"));
    assertEquals(Generation.V120, Generation.forMinecraft("1.20.1"));
    for (int patch = 2; patch <= 4; patch++) {
      assertEquals(Generation.V1204, Generation.forMinecraft("1.20." + patch), "1.20." + patch);
    }
    assertEquals(Generation.V1206, Generation.forMinecraft("1.20.5"));
    assertEquals(Generation.V1206, Generation.forMinecraft("1.20.6"));
    assertEquals(Generation.V1206, Generation.forMinecraft("1.20.6-rc1"));
  }

  @Test
  void eachStretchOfOneTwentyOneHasItsOwnBuild() {
    assertEquals(Generation.OLD, Generation.forMinecraft("1.21.1"));
    for (int patch = 2; patch <= 4; patch++) {
      assertEquals(Generation.V1214, Generation.forMinecraft("1.21." + patch), "1.21." + patch);
    }
    for (int patch = 5; patch <= 10; patch++) {
      assertEquals(Generation.V1218, Generation.forMinecraft("1.21." + patch), "1.21." + patch);
    }
    assertEquals(Generation.V12111, Generation.forMinecraft("1.21.11"));
    assertEquals(Generation.V1214, Generation.forMinecraft("1.21.4-rc1"));
  }

  @Test
  void twentySixAndNewerUseTheNewBuild() {
    assertEquals(Generation.NEW, Generation.forMinecraft("26.1"));
    assertEquals(Generation.NEW, Generation.forMinecraft("26.2.1"));
    assertEquals(Generation.NEW, Generation.forMinecraft("26.3"));
    assertEquals(Generation.NEW, Generation.forMinecraft("26.4-snapshot-4"));
    assertEquals(Generation.NEW, Generation.forMinecraft("27.1"));
  }

  @Test
  void otherVersionsHaveNoBuild() {
    assertNull(Generation.forMinecraft("1.21"));
    assertNull(Generation.forMinecraft("1.20.7"));
    assertNull(Generation.forMinecraft("1.19.4"));
    assertNull(Generation.forMinecraft("1.21.12"));
    assertNull(Generation.forMinecraft("1.21.0"));
    assertNull(Generation.forMinecraft("nonsense"));
    assertNull(Generation.forMinecraft(""));
    assertNull(Generation.forMinecraft(null));
  }
}
