package cc.kokodev.stratpanel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Finds the subcommands of a plugin command by asking it for completions, the way a console would while typing.
 *
 * <p>Paper puts every Bukkit style command into the Brigadier tree as the command word followed by one argument that
 * takes any text, the subcommands live in the plugin's own tab completer. This asks it: what can follow the command,
 * and for each answer, what can follow that. It knows nothing about Bukkit, so it can be tested without a server.
 */
public final class SubcommandProbe {

  /** What can follow the words typed so far, the plugin's tab completer. May throw, a failure ends that branch. */
  public interface Completer {
    List<String> complete(List<String> typed) throws Exception;
  }

  static final int MAX_DEPTH = 3;
  // A list longer than this is values (homes, warps, worlds) and not subcommands.
  static final int MAX_CHOICES = 40;
  static final int MAX_CALLS = 300;

  private final Set<String> players = new LinkedHashSet<>();
  private final long deadline;
  private int calls;

  /**
   * @param onlinePlayers names that completions are compared to, a command that only suggests those takes a player
   * @param deadlineNanos {@link System#nanoTime()} after which nothing more is asked, so a scan stays short
   */
  public SubcommandProbe(Set<String> onlinePlayers, long deadlineNanos) {
    for (String name : onlinePlayers) {
      players.add(name.toLowerCase(Locale.ROOT));
    }
    this.deadline = deadlineNanos;
  }

  public int calls() {
    return calls;
  }

  /**
   * The nodes that can follow a command: literals for its subcommands, an argument for a player or a hint such as
   * {@code <amount>}. Empty when the command has no completions, or only values.
   */
  public List<Map<String, Object>> probe(Completer completer) {
    return level(completer, new ArrayList<>(), 0);
  }

  private List<Map<String, Object>> level(Completer completer, List<String> typed, int depth) {
    List<String> choices = ask(completer, typed);
    if (choices.isEmpty() || choices.size() > MAX_CHOICES) {
      return List.of();
    }

    List<String> words = new ArrayList<>();
    List<String> hints = new ArrayList<>();
    for (String choice : choices) {
      (isHint(choice) ? hints : words).add(choice);
    }

    List<Map<String, Object>> nodes = new ArrayList<>();

    // Online players are what a command without a completer of its own suggests, that is an argument and not words.
    if (!words.isEmpty() && words.stream().allMatch(w -> players.contains(w.toLowerCase(Locale.ROOT)))) {
      nodes.add(argument("player", "minecraft:game_profile"));
      words.clear();
    }

    for (String word : words) {
      Map<String, Object> node = new LinkedHashMap<>();
      node.put("name", word);
      node.put("type", "literal");
      node.put("executable", true);
      if (depth + 1 < MAX_DEPTH) {
        List<String> next = new ArrayList<>(typed);
        next.add(word);
        List<Map<String, Object>> children = level(completer, next, depth + 1);
        if (!children.isEmpty()) {
          node.put("children", children);
        }
      }
      nodes.add(node);
    }

    for (String hint : hints) {
      nodes.add(argument(hint.substring(1, hint.length() - 1).trim().replace(' ', '_'), "brigadier:string"));
    }
    return nodes;
  }

  private List<String> ask(Completer completer, List<String> typed) {
    if (calls >= MAX_CALLS || System.nanoTime() > deadline) {
      return List.of();
    }
    calls++;
    try {
      List<String> answer = completer.complete(typed);
      if (Boolean.getBoolean("stratpanel.debug")) {
        System.err.println("[StratPanel] " + typed + " -> " + answer);
      }
      if (answer == null) {
        return List.of();
      }
      Set<String> unique = new LinkedHashSet<>();
      for (String choice : answer) {
        // A word with a space in it is not one token, and a namespaced copy only adds noise.
        if (choice != null && !choice.isBlank() && choice.indexOf(' ') < 0 && choice.indexOf(':') < 0) {
          unique.add(choice);
        }
      }
      return new ArrayList<>(unique);
    } catch (Throwable e) {
      // Plugin code, anything can go wrong in it and that must never stop the scan.
      if (Boolean.getBoolean("stratpanel.debug")) {
        System.err.println("[StratPanel] completer failed for " + typed + ": " + e);
      }
      return List.of();
    }
  }

  /** {@code <amount>} and {@code [player]} are hints for a value, not something to type. */
  static boolean isHint(String choice) {
    return choice.length() > 2
        && ((choice.startsWith("<") && choice.endsWith(">")) || (choice.startsWith("[") && choice.endsWith("]")));
  }

  private static Map<String, Object> argument(String name, String parser) {
    Map<String, Object> node = new LinkedHashMap<>();
    node.put("name", name);
    node.put("type", "argument");
    node.put("parser", parser);
    node.put("executable", true);
    return node;
  }
}
