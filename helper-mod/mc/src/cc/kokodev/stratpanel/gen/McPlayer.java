package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.InventorySlots;
import cc.kokodev.stratpanel.core.ItemContainer;
import cc.kokodev.stratpanel.core.PlayerHandle;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;

/** A player who is online. */
final class McPlayer implements PlayerHandle {

  private final ServerPlayer player;

  McPlayer(ServerPlayer player) {
    this.player = player;
  }

  @Override
  public String name() {
    return player.getScoreboardName();
  }

  @Override
  public String uuid() {
    return player.getStringUUID();
  }

  @Override
  public double health() {
    return player.getHealth();
  }

  @Override
  public double maxHealth() {
    return player.getMaxHealth();
  }

  @Override
  public double absorption() {
    return player.getAbsorptionAmount();
  }

  @Override
  public int food() {
    return player.getFoodData().getFoodLevel();
  }

  @Override
  public double saturation() {
    return player.getFoodData().getSaturationLevel();
  }

  @Override
  public int level() {
    return player.experienceLevel;
  }

  @Override
  public double exp() {
    return player.experienceProgress;
  }

  @Override
  public String gameMode() {
    return Compat.gameMode(player).getName();
  }

  @Override
  public void setHealth(double health) {
    player.setHealth((float) health);
  }

  @Override
  public void setFood(int food) {
    player.getFoodData().setFoodLevel(food);
  }

  @Override
  public void setSaturation(float saturation) {
    player.getFoodData().setSaturation(saturation);
  }

  @Override
  public void setExhaustion(float exhaustion) {
    Compat.setExhaustion(player.getFoodData(), exhaustion);
  }

  @Override
  public void setLevel(int level) {
    player.setExperienceLevels(level);
  }

  @Override
  public void setGameMode(String mode) {
    player.setGameMode(GameType.byName(mode));
  }

  @Override
  public ItemContainer inventory() {
    return new McContainer(player, player.getInventory(), true);
  }

  @Override
  public ItemContainer enderChest() {
    return new McContainer(player, player.getEnderChestInventory(), false);
  }

  @Override
  public ItemContainer shulkerBox(boolean ender, int slot) {
    Container parent = ender ? player.getEnderChestInventory() : player.getInventory();
    if (slot < 0 || slot >= parent.getContainerSize()) {
      return null;
    }
    ItemStack stack = parent.getItem(slot);
    if (stack.isEmpty() || !InventorySlots.isShulkerBox(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString())) {
      return null;
    }
    // The contents are a container of their own, it is not "worn": every slot takes everything.
    return new McContainer(player, new McShulkerContents(stack), false);
  }
}
