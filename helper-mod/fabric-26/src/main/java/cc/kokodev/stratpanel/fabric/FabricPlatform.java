package cc.kokodev.stratpanel.fabric;

import cc.kokodev.stratpanel.core.Platform;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** What the helper needs from Fabric. */
final class FabricPlatform implements Platform {

  private static final Logger LOGGER = LoggerFactory.getLogger("Stratosphere");

  @Override
  public String name() {
    return "fabric";
  }

  @Override
  public String version() {
    return FabricLoader.getInstance()
        .getModContainer(StratFabric.MOD_ID)
        .map(mod -> mod.getMetadata().getVersion().getFriendlyString())
        .orElse("unknown");
  }

  @Override
  public List<Map<String, String>> mods() {
    List<Map<String, String>> mods = new ArrayList<>();
    for (ModContainer mod : FabricLoader.getInstance().getAllMods()) {
      // The parts of a bigger mod (Fabric API is over a hundred), the game, the loader and Java are not worth listing.
      String id = mod.getMetadata().getId();
      if (mod.getContainingMod().isPresent() || id.equals("minecraft") || id.equals("fabricloader") || id.equals("java")) {
        continue;
      }
      Map<String, String> entry = new LinkedHashMap<>();
      entry.put("name", mod.getMetadata().getName());
      entry.put("version", mod.getMetadata().getVersion().getFriendlyString());
      mods.add(entry);
    }
    return mods;
  }

  @Override
  public void log(String line) {
    LOGGER.info(line);
  }

  @Override
  public void warn(String line, Throwable error) {
    if (error == null) {
      LOGGER.warn(line);
    } else {
      LOGGER.warn(line, error);
    }
  }
}
