package cc.kokodev.stratpanel.core;

/**
 * Which build of the Minecraft-facing code fits the running game. The code that touches the game's classes is built once for each
 * stretch of versions in which the classes it uses stay the same: 1.21.1, 1.21.2 to 1.21.4 (armor trims moved), 1.21.5 to 1.21.10
 * (the way items and components are read changed), 1.21.11 (permissions and identifiers changed) and 26.1 and newer (Minecraft
 * stopped obfuscating its code there and renamed some classes). The jar holds all of them and the entry point picks one. Other
 * versions are not supported, saying so is better than failing one command at a time.
 */
public final class Generation {

  public static final String OLD = "g121";
  public static final String V1214 = "g1214";
  public static final String V1218 = "g1218";
  public static final String V12111 = "g12111";
  public static final String NEW = "g26";

  private Generation() {}

  /** The build for a version of Minecraft such as {@code 1.21.1}, {@code 26.3} or {@code 26.4-snapshot-4}, null if none fits. */
  public static String forMinecraft(String version) {
    if (version == null) {
      return null;
    }
    String[] parts = version.split("[.\\-+ ]");
    try {
      int major = Integer.parseInt(parts[0]);
      if (major >= 26) {
        return NEW;
      }
      if (major == 1 && parts.length >= 3 && parts[1].equals("21")) {
        int patch = Integer.parseInt(parts[2]);
        if (patch == 1) {
          return OLD;
        }
        if (patch >= 2 && patch <= 4) {
          return V1214;
        }
        if (patch >= 5 && patch <= 10) {
          return V1218;
        }
        if (patch == 11) {
          return V12111;
        }
      }
    } catch (NumberFormatException e) {
      // Not a version number.
    }
    return null;
  }
}
