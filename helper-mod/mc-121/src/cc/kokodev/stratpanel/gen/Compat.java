package cc.kokodev.stratpanel.gen;

import java.lang.reflect.Field;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.food.FoodData;
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
