package cc.kokodev.stratpanel.gen;

import java.lang.reflect.Field;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.food.FoodData;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.armortrim.ArmorTrim;
import net.minecraft.world.item.armortrim.TrimMaterial;
import net.minecraft.world.item.armortrim.TrimMaterials;
import net.minecraft.world.item.armortrim.TrimPattern;
import net.minecraft.world.item.armortrim.TrimPatterns;
import net.minecraft.world.level.GameType;

/** What differs between the generations of Minecraft. This is the version for 1.21.x. */
final class Compat {

  private Compat() {}

  /** Whether the source has the highest permission level, which the console has. */
  static boolean isOwner(CommandSourceStack source) {
    return source.hasPermission(Commands.LEVEL_OWNERS);
  }

  /** The time of the world in ticks. */
  static long dayTime(ServerLevel level) {
    return level.getDayTime();
  }

  /** Whether the weather is set to rain. The game fades the rain in over a second, this is the setting itself. */
  static boolean raining(ServerLevel level) {
    return level.getLevelData().isRaining();
  }

  static boolean thundering(ServerLevel level) {
    return level.getLevelData().isThundering();
  }

  /** The material and pattern of the armor trim on an item (such as {@code minecraft:gold}), null when it has none. */
  static String[] trimOf(ItemStack stack) {
    ArmorTrim trim = stack.get(DataComponents.TRIM);
    if (trim == null) {
      return null;
    }
    return new String[] {trim.material().getRegisteredName(), trim.pattern().getRegisteredName()};
  }

  /** Puts a trim on an item, for the self test: gold with the coast pattern, or iron with the sentry pattern. */
  static void testTrim(ItemStack stack, MinecraftServer server, boolean gold) {
    Holder<TrimMaterial> material =
        server
            .registryAccess()
            .lookupOrThrow(Registries.TRIM_MATERIAL)
            .getOrThrow(gold ? TrimMaterials.GOLD : TrimMaterials.IRON);
    Holder<TrimPattern> pattern =
        server
            .registryAccess()
            .lookupOrThrow(Registries.TRIM_PATTERN)
            .getOrThrow(gold ? TrimPatterns.COAST : TrimPatterns.SENTRY);
    stack.set(DataComponents.TRIM, new ArmorTrim(material, pattern));
  }

  static GameType gameMode(ServerPlayer player) {
    return player.gameMode.getGameModeForPlayer();
  }

  static void setExhaustion(FoodData food, float exhaustion) {
    food.setExhaustion(exhaustion);
  }

  /** The id of the registry a resource argument reads from, such as {@code minecraft:mob_effect}, or null. */
  static String registryOf(Object argumentType) {
    try {
      for (Field field : argumentType.getClass().getDeclaredFields()) {
        if (ResourceKey.class.isAssignableFrom(field.getType())) {
          field.setAccessible(true);
          return ((ResourceKey<?>) field.get(argumentType)).location().toString();
        }
      }
    } catch (ReflectiveOperationException | RuntimeException e) {
      // No registry known, the argument gets no suggestions.
    }
    return null;
  }
}
