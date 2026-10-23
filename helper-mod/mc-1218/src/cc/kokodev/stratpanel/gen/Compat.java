package cc.kokodev.stratpanel.gen;

import java.lang.reflect.Field;
import com.mojang.authlib.GameProfile;
import it.unimi.dsi.fastutil.objects.Object2IntMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.NonNullList;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ClientInformation;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.item.enchantment.Enchantments;
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
import net.minecraft.world.item.equipment.trim.ArmorTrim;
import net.minecraft.world.item.equipment.trim.TrimMaterial;
import net.minecraft.world.item.equipment.trim.TrimMaterials;
import net.minecraft.world.item.equipment.trim.TrimPattern;
import net.minecraft.world.item.equipment.trim.TrimPatterns;
import net.minecraft.world.level.GameType;

/** What differs between the generations of Minecraft. This is the version for 1.21.5 to 1.21.10. */
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

  // The food data has no setter for the exhaustion from 1.21.2 on. It is the last of its float fields (the saturation comes first),
  // found by position because the names are not the same on every loader.
  private static java.lang.reflect.Field exhaustionField;

  static void setExhaustion(FoodData food, float exhaustion) {
    try {
      if (exhaustionField == null) {
        java.lang.reflect.Field found = null;
        for (Field field : FoodData.class.getDeclaredFields()) {
          if (field.getType() == float.class && !java.lang.reflect.Modifier.isStatic(field.getModifiers())) {
            found = field;
          }
        }
        if (found == null) {
          return;
        }
        found.setAccessible(true);
        exhaustionField = found;
      }
      exhaustionField.setFloat(food, exhaustion);
    } catch (ReflectiveOperationException | RuntimeException e) {
      // Without it feeding still fills the food and saturation, the exhaustion just keeps what it was.
    }
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

  // ---- items --------------------------------------------------------------------------------------------------------------

  /** The custom name of an item as plain text, null when it has none. */
  static String customName(ItemStack stack) {
    Component custom = stack.get(DataComponents.CUSTOM_NAME);
    return custom == null ? null : custom.getString();
  }

  /** The enchantments of an item: the id without its namespace and the level, in the order the game keeps them. */
  static Map<String, Integer> enchantments(ItemStack stack) {
    Map<String, Integer> enchants = new LinkedHashMap<>();
    for (Object2IntMap.Entry<Holder<net.minecraft.world.item.enchantment.Enchantment>> entry :
        stack.getEnchantments().entrySet()) {
      String name = entry.getKey().getRegisteredName();
      enchants.put(name.substring(name.indexOf(':') + 1), entry.getIntValue());
    }
    return enchants;
  }

  static boolean sameItem(ItemStack a, ItemStack b) {
    return ItemStack.isSameItemSameComponents(a, b);
  }

  /** What is in a shulker box item: {@code size} stacks, empty ones included. */
  static List<ItemStack> boxContents(ItemStack box, int size) {
    NonNullList<ItemStack> items = NonNullList.withSize(size, ItemStack.EMPTY);
    box.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY).copyInto(items);
    return items;
  }

  /** Writes the contents back. A box with nothing in it has no contents at all, so it still stacks with the others. */
  static void storeBox(ItemStack box, List<ItemStack> items, boolean empty) {
    if (empty) {
      box.remove(DataComponents.CONTAINER);
    } else {
      box.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(items));
    }
  }

  // ---- the self test ------------------------------------------------------------------------------------------------------

  /** A player that is not connected. */
  static ServerPlayer testPlayer(MinecraftServer server, GameProfile profile) {
    return new ServerPlayer(server, server.overworld(), profile, ClientInformation.createDefault());
  }

  /** A sword with a name, damage and an enchantment. */
  static ItemStack testSword(MinecraftServer server) {
    ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
    sword.set(DataComponents.CUSTOM_NAME, Component.literal("Test Blade"));
    sword.setDamageValue(100);
    sword.enchant(
        server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SHARPNESS), 5);
    return sword;
  }

  /** A shulker box with these items in it. */
  static ItemStack testBox(List<ItemStack> inside) {
    ItemStack box = new ItemStack(Items.SHULKER_BOX);
    box.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(inside));
    return box;
  }
}
