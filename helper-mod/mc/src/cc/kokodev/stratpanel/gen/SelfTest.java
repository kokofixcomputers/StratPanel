package cc.kokodev.stratpanel.gen;

import com.mojang.authlib.GameProfile;
import java.util.UUID;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ClientInformation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;

/**
 * A player that is not connected, with a few items, for trying the player tools without a game client. Only created when the
 * server is started with {@code -Dstratosphere.selftest=true}, which is how the helper is tested on every version of
 * Minecraft it supports.
 */
final class SelfTest {

  static final String PROPERTY = "stratosphere.selftest";

  private SelfTest() {}

  static boolean enabled() {
    return Boolean.getBoolean(PROPERTY);
  }

  static ServerPlayer create(MinecraftServer server) {
    GameProfile profile = new GameProfile(UUID.fromString("00000000-0000-0000-0000-000000000b07"), "TestBot");
    ServerPlayer player = new ServerPlayer(server, server.overworld(), profile, ClientInformation.createDefault());

    ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
    sword.set(DataComponents.CUSTOM_NAME, Component.literal("Test Blade"));
    sword.setDamageValue(100);
    sword.enchant(
        server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SHARPNESS), 5);
    player.getInventory().setItem(0, sword);
    player.getInventory().setItem(1, new ItemStack(Items.STONE, 64));
    player.getInventory().setItem(2, new ItemStack(Items.STONE, 20));
    player.getInventory().setItem(3, new ItemStack(Items.STONE, 30));
    player.getInventory().setItem(36, new ItemStack(Items.IRON_BOOTS));
    player.getInventory().setItem(40, new ItemStack(Items.SHIELD));
    player.getEnderChestInventory().setItem(0, new ItemStack(Items.DIAMOND, 5));
    player.setHealth(10.0F);
    return player;
  }
}
