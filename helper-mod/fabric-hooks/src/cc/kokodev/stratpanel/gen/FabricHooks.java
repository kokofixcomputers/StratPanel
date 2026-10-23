package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.Helper;
import cc.kokodev.stratpanel.core.Platform;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;

/** Connects the helper to Fabric: the lifecycle of the server, its ticks and the console command. */
public final class FabricHooks {

  private static volatile Helper helper;

  private FabricHooks() {}

  /** Called once by the mod's entry point. */
  public static void init(Platform platform) {
    CommandRegistrationCallback.EVENT.register(
        (dispatcher, registryAccess, environment) -> {
          ConsoleCommand.register(dispatcher, () -> helper);
          // Runs again when the commands are reloaded, the mods have added theirs by then.
          Helper current = helper;
          if (current != null) {
            current.onCommandsRegistered();
          }
        });
    ServerLifecycleEvents.SERVER_STARTED.register(
        server -> {
          try {
            Helper created = new Helper(new McGame(server), platform);
            helper = created;
            created.onStarted();
          } catch (Throwable e) {
            // Whatever is wrong, the server starts without the helper.
            platform.warn("Stratosphere could not start on this version of Minecraft, the panel will work without it.", e);
          }
        });
    ServerLifecycleEvents.SERVER_STOPPING.register(
        server -> {
          Helper current = helper;
          helper = null;
          if (current != null) {
            current.onStopping();
          }
        });
    ServerTickEvents.START_SERVER_TICK.register(
        server -> {
          Helper current = helper;
          if (current != null) {
            current.onTickStart();
          }
        });
    ServerTickEvents.END_SERVER_TICK.register(
        server -> {
          Helper current = helper;
          if (current != null) {
            current.onTickEnd();
          }
        });
  }
}
