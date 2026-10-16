package cc.kokodev.stratpanel.core;

/**
 * Which build of the Minecraft-facing code fits the running game. The code that touches the game's classes is built once for
 * 1.21.1 and once for 26.1 and newer (Minecraft stopped obfuscating its code there and renamed some classes), the jar holds both
 * and the entry point picks one. Other versions are not supported, saying so is better than failing one command at a time.
 */
public final class Generation {

  public static final String OLD = "g121";
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
      if (major == 1 && parts.length >= 3 && parts[1].equals("21") && parts[2].equals("1")) {
        return OLD;
      }
    } catch (NumberFormatException e) {
      // Not a version number.
    }
    return null;
  }
}
