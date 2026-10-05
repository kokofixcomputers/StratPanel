package cc.kokodev.stratpanel;

import com.google.gson.Gson;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Logger;

/**
 * Sends messages to the panel as console lines. The panel reads them from the console it already streams and hides
 * them from what people see. The line has to be printed by the plugin's own logger, so it starts with the log header and
 * "[StratPanel]", that is how the panel knows a player did not type it into chat. See docs/pterodactyl-commands.md in
 * the panel.
 */
public final class Bridge {

  static final String TAG = "::stratpanel::";

  private final Logger logger;
  private final Gson gson = new Gson();

  public Bridge(Logger logger) {
    this.logger = logger;
  }

  /** Prints one message, {@code fields} are added after the event name. */
  public void send(String event, Map<String, Object> fields) {
    Map<String, Object> message = new LinkedHashMap<>();
    message.put("event", event);
    message.putAll(fields);
    logger.info(TAG + " " + gson.toJson(message));
  }

  public void send(String event) {
    send(event, Map.of());
  }
}
