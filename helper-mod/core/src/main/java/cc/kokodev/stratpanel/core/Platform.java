package cc.kokodev.stratpanel.core;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** What the loader (Fabric, NeoForge) tells the helper about itself. */
public interface Platform {

  /** {@code fabric} or {@code neoforge}, as the panel names the platform. */
  String name();

  /** The version of this helper. */
  String version();

  /** Name and version of every mod, for the file with the commands. */
  List<Map<String, String>> mods();

  /** Prints a line to the server log, with the log's own header in front. Info level. */
  void log(String line);

  /** Prints a warning to the server log. */
  void warn(String line, Throwable error);

  /** The folder with server.properties. */
  default java.nio.file.Path serverRoot() {
    return java.nio.file.Path.of(System.getProperty("user.dir"));
  }

  static Consumer<String> sinkOf(Platform platform) {
    return platform::log;
  }
}
