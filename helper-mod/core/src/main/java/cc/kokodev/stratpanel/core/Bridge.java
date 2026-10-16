package cc.kokodev.stratpanel.core;

import com.google.gson.Gson;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Sends messages to the panel as console lines. The panel reads them from the console it already streams and hides them from
 * what people see. The line starts with {@code [Stratosphere]} directly after the log header, that is how the panel knows a
 * player did not type it into chat. See docs/stratosphere-commands.md in the panel.
 */
public final class Bridge {

  public static final String TAG = "::stratpanel::";
  public static final String PREFIX = "[Stratosphere]";

  private final Consumer<String> sink;
  private final Gson gson = new Gson();

  /** @param sink prints one line to the server log, the header is added by the log. */
  public Bridge(Consumer<String> sink) {
    this.sink = sink;
  }

  /** Prints one message, {@code fields} are added after the event name. */
  public void send(String event, Map<String, Object> fields) {
    Map<String, Object> message = new LinkedHashMap<>();
    message.put("event", event);
    message.putAll(fields);
    sink.accept(PREFIX + " " + TAG + " " + gson.toJson(message));
  }

  public void send(String event) {
    send(event, Map.of());
  }
}
