package cc.kokodev.stratpanel;

import com.google.gson.Gson;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Sends messages to the panel as console lines. The panel reads them from the console it already streams and hides
 * them from what people see. The line has to be printed by the plugin's own logger, so it starts with the log header and
 * "[Stratosphere]", that is how the panel knows a player did not type it into chat. See the commands.json page of the Stratosphere docs.
 */
public final class Bridge {

  static final String TAG = "::stratpanel::";

  private final Consumer<String> out;
  private final Gson gson = new Gson();

  public Bridge(Logger logger) {
    this(logger::info);
  }

  /** For platforms with another logger: {@code out} prints one line with the logger of the plugin. */
  public Bridge(Consumer<String> out) {
    this.out = out;
  }

  /** Prints one message, {@code fields} are added after the event name. */
  public void send(String event, Map<String, Object> fields) {
    Map<String, Object> message = new LinkedHashMap<>();
    message.put("event", event);
    message.putAll(fields);
    out.accept(TAG + " " + gson.toJson(message));
  }

  public void send(String event) {
    send(event, Map.of());
  }
}
