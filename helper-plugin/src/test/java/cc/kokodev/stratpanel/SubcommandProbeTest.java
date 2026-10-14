package cc.kokodev.stratpanel;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class SubcommandProbeTest {

  private static final long FOREVER = Long.MAX_VALUE;

  private static SubcommandProbe probe(String... players) {
    return new SubcommandProbe(Set.of(players), FOREVER);
  }

  private static List<String> names(List<Map<String, Object>> nodes) {
    return nodes.stream().map(n -> (String) n.get("name")).collect(Collectors.toList());
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> children(Map<String, Object> node) {
    return (List<Map<String, Object>>) node.getOrDefault("children", List.of());
  }

  @Test
  void findsSubcommandsAndTheOnesBelowThem() {
    SubcommandProbe.Completer completer = typed -> {
      if (typed.isEmpty()) return List.of("reload", "give", "help");
      if (typed.equals(List.of("give"))) return List.of("diamond", "stone");
      return List.of();
    };

    List<Map<String, Object>> found = probe().probe(completer);

    assertEquals(List.of("give", "help", "reload"), names(found).stream().sorted().collect(Collectors.toList()));
    Map<String, Object> give = found.stream().filter(n -> n.get("name").equals("give")).findFirst().orElseThrow();
    assertEquals(List.of("diamond", "stone"), names(children(give)));
    assertEquals("literal", give.get("type"));
    assertTrue(children(found.get(0)).isEmpty() || !names(found).isEmpty());
  }

  @Test
  void aCommandThatOnlySuggestsOnlinePlayersTakesAPlayer() {
    List<Map<String, Object>> found = probe("Steve", "Alex").probe(typed -> List.of("Steve", "Alex"));

    assertEquals(1, found.size());
    assertEquals("argument", found.get(0).get("type"));
    assertEquals("minecraft:game_profile", found.get(0).get("parser"));
  }

  @Test
  void longListsAreValuesNotSubcommands() {
    List<String> homes = new java.util.ArrayList<>();
    for (int i = 0; i < 80; i++) homes.add("home" + i);

    assertTrue(probe().probe(typed -> homes).isEmpty());
  }

  @Test
  void hintsBecomeArguments() {
    List<Map<String, Object>> found = probe().probe(typed -> typed.isEmpty() ? List.of("set", "<amount>") : List.of());

    assertEquals(List.of("set", "amount"), names(found));
    assertEquals("argument", found.get(1).get("type"));
  }

  @Test
  void survivesPluginsThatThrowAndBadAnswers() {
    assertTrue(probe().probe(typed -> { throw new IllegalStateException("boom"); }).isEmpty());
    assertTrue(probe().probe(typed -> null).isEmpty());
    List<Map<String, Object>> found = probe().probe(typed -> typed.isEmpty() ? java.util.Arrays.asList("ok", null, "", "a b", "x:y", "ok") : List.of());

    assertEquals(List.of("ok"), names(found));
  }

  @Test
  void stopsAtTheDepthLimit() {
    SubcommandProbe.Completer endless = typed -> List.of("more");
    Map<String, Object> level1 = probe().probe(endless).get(0);
    Map<String, Object> level2 = children(level1).get(0);
    Map<String, Object> level3 = children(level2).get(0);

    assertTrue(children(level3).isEmpty());
  }

  @Test
  void asksNothingAfterTheDeadline() {
    SubcommandProbe late = new SubcommandProbe(Set.of(), System.nanoTime() - 1);

    assertTrue(late.probe(typed -> List.of("a")).isEmpty());
    assertEquals(0, late.calls());
  }
}
