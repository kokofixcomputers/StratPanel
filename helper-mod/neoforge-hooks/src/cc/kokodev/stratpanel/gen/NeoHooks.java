package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.Helper;
import cc.kokodev.stratpanel.core.Platform;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

/** Connects the helper to NeoForge: the lifecycle of the server, its ticks and the console command. */
public final class NeoHooks {

  private static volatile Helper helper;

  private NeoHooks() {}

  /** Called once by the mod's entry point. */
  public static void init(Platform platform) {
    NeoForge.EVENT_BUS.addListener(
        (RegisterCommandsEvent event) -> {
          ConsoleCommand.register(event.getDispatcher(), () -> helper);
          // Runs again when the commands are reloaded, the mods have added theirs by then.
          Helper current = helper;
          if (current != null) {
            current.onCommandsRegistered();
          }
        });
    NeoForge.EVENT_BUS.addListener(
        (ServerStartedEvent event) -> {
          try {
            Helper created = new Helper(new McGame(event.getServer()), platform);
            helper = created;
            created.onStarted();
          } catch (Throwable e) {
            // Whatever is wrong, the server starts without the helper.
            platform.warn("Stratosphere could not start on this version of Minecraft, the panel will work without it.", e);
          }
        });
    NeoForge.EVENT_BUS.addListener(
        (ServerStoppingEvent event) -> {
          Helper current = helper;
          helper = null;
          if (current != null) {
            current.onStopping();
          }
        });
    NeoForge.EVENT_BUS.addListener(
        (ServerTickEvent.Pre event) -> {
          Helper current = helper;
          if (current != null) {
            current.onTickStart();
          }
        });
    NeoForge.EVENT_BUS.addListener(
        (ServerTickEvent.Post event) -> {
          Helper current = helper;
          if (current != null) {
            current.onTickEnd();
          }
        });
  }
}
