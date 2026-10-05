package cc.kokodev.stratpanel;

import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.tree.ArgumentCommandNode;
import com.mojang.brigadier.tree.CommandNode;
import com.mojang.brigadier.tree.LiteralCommandNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Turns a Brigadier command tree into the nodes of pterodactyl.commands.json. It only knows Brigadier, so it can be
 * tested without a server. See docs/pterodactyl-commands.md in the panel for the format.
 */
public final class CommandTreeBuilder {

  /** What the server knows about a top level command besides its Brigadier nodes. */
  public interface Meta {
    String description();

    String permission();

    String plugin();

    List<String> aliases();
  }

  static final int MAX_NODES = 100_000;
  static final int MAX_DEPTH = 32;

  // Argument types are matched by class name so this works with the server's own (Mojang named) classes
  // without having to compile against them.
  private static final Map<String, String> PARSERS = new HashMap<>();

  static {
    PARSERS.put("StringArgumentType", "brigadier:string");
    PARSERS.put("IntegerArgumentType", "brigadier:integer");
    PARSERS.put("LongArgumentType", "brigadier:long");
    PARSERS.put("DoubleArgumentType", "brigadier:double");
    PARSERS.put("FloatArgumentType", "brigadier:float");
    PARSERS.put("BoolArgumentType", "brigadier:bool");
    PARSERS.put("EntityArgument", "minecraft:entity");
    PARSERS.put("GameProfileArgument", "minecraft:game_profile");
    PARSERS.put("ScoreHolderArgument", "minecraft:score_holder");
    PARSERS.put("GameModeArgument", "minecraft:gamemode");
    PARSERS.put("Vec3Argument", "minecraft:vec3");
    PARSERS.put("Vec2Argument", "minecraft:vec2");
    PARSERS.put("BlockPosArgument", "minecraft:block_pos");
    PARSERS.put("ColumnPosArgument", "minecraft:column_pos");
    PARSERS.put("RotationArgument", "minecraft:rotation");
    PARSERS.put("AngleArgument", "minecraft:angle");
    PARSERS.put("DimensionArgument", "minecraft:dimension");
    PARSERS.put("ColorArgument", "minecraft:color");
  }

  private final Function<String, Meta> metaOf;
  // The path of literal names to every node that can be reached through literals only, which is what a redirect
  // needs to point at.
  private final IdentityHashMap<CommandNode<?>, List<String>> paths = new IdentityHashMap<>();
  private int count;

  public CommandTreeBuilder(Function<String, Meta> metaOf) {
    this.metaOf = metaOf;
  }

  /** The top level commands under the given root. */
  public List<Map<String, Object>> build(CommandNode<?> root) {
    paths.clear();
    count = 0;
    paths.put(root, List.of());
    index(root, List.of(), 0);

    List<Map<String, Object>> result = new ArrayList<>();
    for (CommandNode<?> child : sorted(root.getChildren())) {
      // Namespaced copies such as "minecraft:gamemode" only add noise to tab completion.
      if (child.getName().indexOf(':') >= 0) {
        continue;
      }
      Map<String, Object> node = node(child, true, 0);
      if (node != null) {
        result.add(node);
      }
    }
    return result;
  }

  public int nodeCount() {
    return count;
  }

  private void index(CommandNode<?> node, List<String> path, int depth) {
    if (depth > MAX_DEPTH) {
      return;
    }
    for (CommandNode<?> child : node.getChildren()) {
      if (child instanceof LiteralCommandNode && !paths.containsKey(child)) {
        List<String> childPath = new ArrayList<>(path);
        childPath.add(child.getName());
        paths.put(child, childPath);
        index(child, childPath, depth + 1);
      }
    }
  }

  private Map<String, Object> node(CommandNode<?> node, boolean topLevel, int depth) {
    if (count >= MAX_NODES || depth > MAX_DEPTH) {
      return null;
    }
    count++;

    Map<String, Object> map = new LinkedHashMap<>();
    map.put("name", node.getName());

    if (node instanceof ArgumentCommandNode) {
      map.put("type", "argument");
      String parser = parserOf(((ArgumentCommandNode<?, ?>) node).getType());
      if (parser != null) {
        map.put("parser", parser);
      }
    } else {
      map.put("type", "literal");
    }

    if (topLevel) {
      Meta meta = metaOf.apply(node.getName());
      if (meta != null) {
        putIfText(map, "description", meta.description());
        putIfText(map, "permission", meta.permission());
        putIfText(map, "plugin", meta.plugin());
        List<String> aliases = new ArrayList<>();
        for (String alias : meta.aliases()) {
          if (alias != null && !alias.isEmpty() && !alias.equals(node.getName()) && alias.indexOf(':') < 0) {
            aliases.add(alias);
          }
        }
        if (!aliases.isEmpty() && node instanceof LiteralCommandNode) {
          map.put("aliases", aliases);
        }
      }
    }

    map.put("executable", node.getCommand() != null);

    // Shared and looping parts of the tree (execute, aliases) are pointed at, not copied.
    CommandNode<?> target = node.getRedirect();
    if (target != null) {
      List<String> path = paths.get(target);
      if (path != null) {
        map.put("redirect", path);
      }
    }

    List<Map<String, Object>> children = new ArrayList<>();
    for (CommandNode<?> child : sorted(node.getChildren())) {
      Map<String, Object> built = node(child, false, depth + 1);
      if (built != null) {
        children.add(built);
      }
    }
    if (!children.isEmpty()) {
      map.put("children", children);
    }
    return map;
  }

  /** The parser id of an argument type, or null when the panel has nothing to suggest for it. */
  static String parserOf(ArgumentType<?> type) {
    return PARSERS.get(type.getClass().getSimpleName());
  }

  private static List<CommandNode<?>> sorted(java.util.Collection<? extends CommandNode<?>> nodes) {
    List<CommandNode<?>> list = new ArrayList<>(nodes);
    list.sort(Comparator.comparing(CommandNode::getName));
    return list;
  }

  private static void putIfText(Map<String, Object> map, String key, String value) {
    if (value != null && !value.isEmpty()) {
      map.put(key, value.length() > 200 ? value.substring(0, 200) : value);
    }
  }
}
