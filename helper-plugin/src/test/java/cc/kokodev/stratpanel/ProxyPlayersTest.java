package cc.kokodev.stratpanel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Map;
import org.junit.jupiter.api.Test;

class ProxyPlayersTest {

  @Test
  void aPlayerOnABackendServerSaysWhichOne() {
    Map<String, Object> fields = ProxyPlayers.fields("Steve", "069a79f4-44e9-4726-a5be-fca90e38aaf5", "lobby");

    assertEquals("lobby", fields.get("server"));
    assertEquals("Steve", fields.get("name"));
  }

  @Test
  void aPlayerStillConnectingHasNoServer() {
    assertFalse(ProxyPlayers.fields("Steve", "069a79f4-44e9-4726-a5be-fca90e38aaf5", null).containsKey("server"));
    assertFalse(ProxyPlayers.fields("Steve", "069a79f4-44e9-4726-a5be-fca90e38aaf5", "").containsKey("server"));
  }

  @Test
  void aCommandIsALiteralThatCanBeRun() {
    Map<String, Object> node = ProxyPlayers.commandNode("glist", null);

    assertEquals("literal", node.get("type"));
    assertEquals(true, node.get("executable"));
    assertFalse(node.containsKey("plugin"));
  }
}
