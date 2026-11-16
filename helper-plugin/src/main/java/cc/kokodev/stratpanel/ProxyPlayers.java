package cc.kokodev.stratpanel;

import java.util.LinkedHashMap;
import java.util.Map;

/** The fields of a player of a proxy as the panel gets them. Free of the Velocity classes so it can be tested without a proxy. */
public final class ProxyPlayers {

  private ProxyPlayers() {}

  /**
   * @param server the name of the backend server the player is on, null while they are still connecting to one
   */
  public static Map<String, Object> fields(String name, String uuid, String server) {
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("name", name);
    fields.put("uuid", uuid);
    if (server != null && !server.isEmpty()) {
      fields.put("server", server);
    }
    return fields;
  }

  /** A command name the proxy can list for tab completion: a literal that can be run. */
  public static Map<String, Object> commandNode(String name, String plugin) {
    Map<String, Object> node = new LinkedHashMap<>();
    node.put("name", name);
    node.put("type", "literal");
    if (plugin != null && !plugin.isEmpty()) {
      node.put("plugin", plugin);
    }
    node.put("executable", true);
    return node;
  }
}
