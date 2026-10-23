package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.tree.CommandNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** A version of Minecraft that lacks a method the helper calls must not take the server down. */
class HelperGuardTest {

  // The command scan writes from a thread of its own, the test reads the log while it does.
  private final List<String> log = new java.util.concurrent.CopyOnWriteArrayList<>();
  private final List<String> warnings = new ArrayList<>();

  private Helper helper(boolean playersBreak) {
    Game game =
        new Game() {
          public String minecraftVersion() {
            return "1.21.5";
          }

          public List<PlayerHandle> players() {
            if (playersBreak) {
              // What a method that was renamed in a newer game looks like at run time. An Error, not an Exception.
              throw new NoSuchMethodError("net.minecraft.class_1799.method_57824");
            }
            return List.of();
          }

          public PlayerHandle player(String name) {
            return null;
          }

          public CommandNode<?> commandRoot() {
            return null;
          }

          public String parserId(ArgumentType<?> type) {
            return null;
          }
        };
    Platform platform =
        new Platform() {
          public String name() {
            return "fabric";
          }

          public String version() {
            return "1.0.0";
          }

          public List<Map<String, String>> mods() {
            return List.of();
          }

          public void log(String line) {
            log.add(line);
          }

          public void warn(String line, Throwable error) {
            warnings.add(line);
          }
        };
    return new Helper(game, platform);
  }

  @Test
  void aCommandThatNeedsAMissingMethodDoesNotThrow() {
    Helper helper = helper(true);

    assertDoesNotThrow(() -> helper.execute(new String[] {"sync"}));
    assertEquals(1, warnings.size());
    assertTrue(warnings.get(0).contains("the command \"sync\""), warnings.get(0));
    assertTrue(warnings.get(0).contains("NoSuchMethodError"), warnings.get(0));
  }

  @Test
  void theSameFailureIsOnlySaidOnce() {
    Helper helper = helper(true);

    helper.execute(new String[] {"sync"});
    helper.execute(new String[] {"sync"});
    helper.execute(new String[] {"sync"});

    assertEquals(1, warnings.size());
  }

  @Test
  void otherCommandsKeepWorking() {
    Helper helper = helper(true);

    helper.execute(new String[] {"sync"});
    helper.execute(new String[] {"perf"});

    assertTrue(log.stream().anyMatch(line -> line.contains("\"event\":\"performance\"")), log.toString());
  }

  @Test
  void theStartAndTheTicksSurviveAGameThatCannotListPlayers() {
    Helper helper = helper(true);

    assertDoesNotThrow(helper::onStarted);
    assertDoesNotThrow(
        () -> {
          for (int i = 0; i < 10; i++) {
            helper.onTickStart();
            helper.onTickEnd();
          }
        });
    // The ticks are still measured, which is what the panel shows as TPS and MSPT.
    assertTrue(helper.ticks().tickNanos().length > 0);
  }
}
