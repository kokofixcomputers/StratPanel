package cc.kokodev.stratpanel.fabric;

import cc.kokodev.stratpanel.core.Generation;
import cc.kokodev.stratpanel.core.Platform;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.loader.api.FabricLoader;

/**
 * The entry point. It knows no Minecraft classes: the jar holds one build of the code that does for each generation of the game,
 * and this picks the one that fits.
 */
public final class StratFabric implements ModInitializer {

  public static final String MOD_ID = "stratosphere";

  @Override
  public void onInitialize() {
    Platform platform = new FabricPlatform();
    String minecraft =
        FabricLoader.getInstance()
            .getModContainer("minecraft")
            .map(mod -> mod.getMetadata().getVersion().getFriendlyString())
            .orElse(null);
    String generation = Generation.forMinecraft(minecraft);
    if (generation == null) {
      platform.warn(
          "Stratosphere supports Fabric on Minecraft 1.20 to 1.21.11 and 26.1 and newer, this is " + minecraft
              + ". The panel will work without it.",
          null);
      return;
    }
    try {
      Class.forName("cc.kokodev.stratpanel." + generation + "fabric.FabricHooks")
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
