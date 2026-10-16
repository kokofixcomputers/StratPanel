package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class GenerationTest {

  @Test
  void oneTwentyOneOneUsesTheOldBuild() {
    assertEquals(Generation.OLD, Generation.forMinecraft("1.21.1"));
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
    assertNull(Generation.forMinecraft("1.21.4"));
    assertNull(Generation.forMinecraft("1.20.1"));
    assertNull(Generation.forMinecraft("1.21.11"));
    assertNull(Generation.forMinecraft("1.21.10"));
    assertNull(Generation.forMinecraft("nonsense"));
    assertNull(Generation.forMinecraft(""));
    assertNull(Generation.forMinecraft(null));
  }
}
