package cc.kokodev.stratpanel.neoforge;

import cc.kokodev.stratpanel.core.Platform;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.neoforged.fml.ModList;
import net.neoforged.neoforgespi.language.IModInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** What the helper needs from NeoForge. */
final class NeoPlatform implements Platform {

  private static final Logger LOGGER = LoggerFactory.getLogger("Stratosphere");

  @Override
  public String name() {
    return "neoforge";
  }

  @Override
  public String version() {
    return ModList.get()
        .getModContainerById(StratNeo.MOD_ID)
        .map(mod -> mod.getModInfo().getVersion().toString())
        .orElse("unknown");
  }

  @Override
  public List<Map<String, String>> mods() {
    List<Map<String, String>> mods = new ArrayList<>();
    for (IModInfo mod : ModList.get().getMods()) {
      if (mod.getModId().equals("minecraft") || mod.getModId().equals("neoforge")) {
        continue;
      }
      Map<String, String> entry = new LinkedHashMap<>();
      entry.put("name", mod.getDisplayName());
      entry.put("version", mod.getVersion().toString());
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
