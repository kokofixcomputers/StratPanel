package cc.kokodev.stratpanel.gen;

import com.mojang.authlib.GameProfile;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.NonNullList;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.food.FoodData;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.server.level.ClientInformation;

/**
 * What differs between the generations of Minecraft. This is the version for 1.20.2 to 1.20.4, which keep what an item carries in NBT
 * (the components of 1.20.5 and newer do not exist yet).
 */
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

  // ---- items (NBT) --------------------------------------------------------------------------------------------------------

  /** The material and pattern of the armor trim on an item (such as {@code minecraft:gold}), null when it has none. */
  static String[] trimOf(ItemStack stack) {
    CompoundTag tag = stack.getTag();
    if (tag == null || !tag.contains("Trim", 10)) {
      return null;
    }
    CompoundTag trim = tag.getCompound("Trim");
    if (!trim.contains("material", 8) || !trim.contains("pattern", 8)) {
      return null;
    }
    return new String[] {trim.getString("material"), trim.getString("pattern")};
  }

  /** Puts a trim on an item, for the self test: gold with the coast pattern, or iron with the sentry pattern. */
  static void testTrim(ItemStack stack, MinecraftServer server, boolean gold) {
    CompoundTag trim = new CompoundTag();
    trim.putString("material", gold ? "minecraft:gold" : "minecraft:iron");
    trim.putString("pattern", gold ? "minecraft:coast" : "minecraft:sentry");
    stack.getOrCreateTag().put("Trim", trim);
  }

  /** The custom name of an item as plain text, null when it has none. */
  static String customName(ItemStack stack) {
    return stack.hasCustomHoverName() ? stack.getHoverName().getString() : null;
  }

  /** The enchantments of an item: the id without its namespace and the level, in the order the item keeps them. */
  static Map<String, Integer> enchantments(ItemStack stack) {
    Map<String, Integer> enchants = new LinkedHashMap<>();
    for (Map.Entry<Enchantment, Integer> entry : EnchantmentHelper.getEnchantments(stack).entrySet()) {
      String name = String.valueOf(BuiltInRegistries.ENCHANTMENT.getKey(entry.getKey()));
      enchants.put(name.substring(name.indexOf(':') + 1), entry.getValue());
    }
    return enchants;
  }

  static boolean sameItem(ItemStack a, ItemStack b) {
    return ItemStack.isSameItemSameTags(a, b);
  }

  /** What is in a shulker box item: {@code size} stacks, empty ones included. */
  static List<ItemStack> boxContents(ItemStack box, int size) {
    NonNullList<ItemStack> items = NonNullList.withSize(size, ItemStack.EMPTY);
    CompoundTag data = BlockItem.getBlockEntityData(box);
    if (data != null) {
      ContainerHelper.loadAllItems(data, items);
    }
    return items;
  }

  /** Writes the contents back. A box with nothing in it has no block entity data at all, so it still stacks with the others. */
  static void storeBox(ItemStack box, List<ItemStack> items, boolean empty) {
    if (empty) {
      box.removeTagKey("BlockEntityTag");
      return;
    }
    NonNullList<ItemStack> list = NonNullList.withSize(items.size(), ItemStack.EMPTY);
    for (int slot = 0; slot < items.size(); slot++) {
      list.set(slot, items.get(slot));
    }
    BlockItem.setBlockEntityData(box, BlockEntityType.SHULKER_BOX, ContainerHelper.saveAllItems(new CompoundTag(), list, false));
  }

  // ---- the self test ------------------------------------------------------------------------------------------------------

  /** A player that is not connected. */
  static ServerPlayer testPlayer(MinecraftServer server, GameProfile profile) {
    return new ServerPlayer(server, server.overworld(), profile, ClientInformation.createDefault());
  }

  /** A sword with a name, damage and an enchantment. */
  static ItemStack testSword(MinecraftServer server) {
    ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
    sword.setHoverName(Component.literal("Test Blade"));
    sword.setDamageValue(100);
    sword.enchant(Enchantments.SHARPNESS, 5);
    return sword;
  }

  /** A shulker box with these items in it. */
  static ItemStack testBox(List<ItemStack> inside) {
    ItemStack box = new ItemStack(Items.SHULKER_BOX);
    storeBox(box, inside, false);
    return box;
  }
}
