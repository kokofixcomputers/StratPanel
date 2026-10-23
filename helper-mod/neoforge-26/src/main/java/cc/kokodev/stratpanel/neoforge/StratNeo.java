package cc.kokodev.stratpanel.neoforge;

import cc.kokodev.stratpanel.core.Generation;
import cc.kokodev.stratpanel.core.Platform;
import net.neoforged.fml.ModList;
import net.neoforged.fml.common.Mod;

/**
 * The entry point. It knows no Minecraft classes: the jar holds one build of the code that does for each generation of the game,
 * and this picks the one that fits.
 */
@Mod(StratNeo.MOD_ID)
public final class StratNeo {

  public static final String MOD_ID = "stratosphere";

  // No parameters: the older NeoForge versions (20.x) do not all pass the event bus.
  public StratNeo() {
    Platform platform = new NeoPlatform();
    String minecraft =
        ModList.get()
            .getModContainerById("minecraft")
            .map(mod -> mod.getModInfo().getVersion().toString())
            .orElse(null);
    String generation = Generation.forMinecraft(minecraft);
    if (generation == null) {
      platform.warn(
          "Stratosphere supports NeoForge on Minecraft 1.20 to 1.21.11 and 26.1 and newer, this is " + minecraft
              + ". The panel will work without it.",
          null);
      return;
    }
    try {
      Class.forName("cc.kokodev.stratpanel." + generation + ".NeoHooks")
          .getMethod("init", Platform.class)
          .invoke(null, platform);
    } catch (Throwable e) {
      // Not being able to talk to the panel must never stop the server from starting.
      platform.warn(
          "Stratosphere could not start on Minecraft " + minecraft + ", the panel will work without it.",
          e);
    }
  }
}
