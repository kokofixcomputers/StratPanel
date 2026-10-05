package cc.kokodev.stratpanel;

import static com.mojang.brigadier.arguments.BoolArgumentType.bool;
import static com.mojang.brigadier.arguments.StringArgumentType.word;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.builder.RequiredArgumentBuilder;
import com.mojang.brigadier.tree.LiteralCommandNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Tests the conversion of a Brigadier tree, which needs no server. */
public class CommandTreeBuilderTest {

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> children(Map<String, Object> node) {
    return (List<Map<String, Object>>) node.get("children");
  }

  private static Map<String, Object> find(List<Map<String, Object>> nodes, String name) {
    return nodes.stream().filter(n -> name.equals(n.get("name"))).findFirst().orElseThrow();
  }

  @Test
  public void convertsLiteralsArgumentsAndMetadata() {
    CommandDispatcher<Object> dispatcher = new CommandDispatcher<>();
    dispatcher.register(LiteralArgumentBuilder.<Object>literal("warp")
        .then(RequiredArgumentBuilder.<Object, String>argument("name", word()).executes(c -> 1))
        .then(LiteralArgumentBuilder.<Object>literal("set")
            .then(RequiredArgumentBuilder.<Object, Boolean>argument("flag", bool()).executes(c -> 1))));

    List<Map<String, Object>> tree = new CommandTreeBuilder(name -> "warp".equals(name) ? new CommandTreeBuilder.Meta() {
      public String description() {
        return "Go to a warp";
      }

      public String permission() {
        return "essentials.warp";
      }

      public String plugin() {
        return "Essentials";
      }

      public List<String> aliases() {
        return List.of("w", "warp", "e:warp");
      }
    } : null).build(dispatcher.getRoot());

    Map<String, Object> warp = find(tree, "warp");
    assertEquals("literal", warp.get("type"));
    assertEquals("Go to a warp", warp.get("description"));
    assertEquals("Essentials", warp.get("plugin"));
    // The name itself and namespaced names are not aliases.
    assertEquals(List.of("w"), warp.get("aliases"));

    Map<String, Object> name = find(children(warp), "name");
    assertEquals("argument", name.get("type"));
    assertEquals("brigadier:string", name.get("parser"));
    assertEquals(true, name.get("executable"));
    assertEquals("brigadier:bool", find(children(find(children(warp), "set")), "flag").get("parser"));
  }

  @Test
  public void pointsAtLoopsInsteadOfCopyingThem() {
    CommandDispatcher<Object> dispatcher = new CommandDispatcher<>();
    LiteralCommandNode<Object> execute = dispatcher.register(LiteralArgumentBuilder.<Object>literal("execute"));
    execute.addChild(LiteralArgumentBuilder.<Object>literal("as")
        .then(RequiredArgumentBuilder.<Object, String>argument("targets", word()).redirect(execute))
        .build());
    dispatcher.register(LiteralArgumentBuilder.<Object>literal("run").redirect(execute));
    dispatcher.register(LiteralArgumentBuilder.<Object>literal("loop")
        .then(LiteralArgumentBuilder.<Object>literal("again").redirect(execute)));

    List<Map<String, Object>> tree = new CommandTreeBuilder(name -> null).build(dispatcher.getRoot());

    Map<String, Object> as = find(children(find(tree, "execute")), "as");
    assertEquals(List.of("execute"), find(children(as), "targets").get("redirect"));
    // An alias is a node of its own that continues like the command it redirects to.
    assertEquals(List.of("execute"), find(tree, "run").get("redirect"));
    assertEquals(List.of("execute"), find(children(find(tree, "loop")), "again").get("redirect"));
  }

  @Test
  public void leavesOutNamespacedCommandsAndUnknownParsers() {
    CommandDispatcher<Object> dispatcher = new CommandDispatcher<>();
    dispatcher.register(LiteralArgumentBuilder.<Object>literal("minecraft:gamemode"));
    dispatcher.register(LiteralArgumentBuilder.<Object>literal("gamemode")
        .then(RequiredArgumentBuilder.<Object, String>argument("mode", word())));

    CommandTreeBuilder builder = new CommandTreeBuilder(name -> null);
    List<Map<String, Object>> tree = builder.build(dispatcher.getRoot());

    assertEquals(1, tree.size());
    assertEquals("gamemode", tree.get(0).get("name"));
    assertFalse(tree.get(0).containsKey("description"));
    assertNull(tree.get(0).get("redirect"));
    assertTrue(builder.nodeCount() >= 2);
  }
}
