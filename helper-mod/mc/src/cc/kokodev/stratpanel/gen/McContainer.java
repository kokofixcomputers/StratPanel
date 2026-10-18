package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.InventorySlots;
import cc.kokodev.stratpanel.core.ItemContainer;
import cc.kokodev.stratpanel.core.ItemInfo;
import it.unimi.dsi.fastutil.objects.Object2IntMap;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

/** The inventory or the ender chest of a player. The slots are numbered as in {@link InventorySlots}. */
final class McContainer implements ItemContainer {

  private final ServerPlayer player;
  private final Container container;
  private final boolean worn;

  McContainer(ServerPlayer player, Container container, boolean worn) {
    this.player = player;
    this.container = container;
    this.worn = worn;
  }

  @Override
  public int size() {
    return worn ? InventorySlots.COUNT : InventorySlots.ENDER_COUNT;
  }

  @Override
  public ItemInfo describe(int slot) {
    ItemStack stack = container.getItem(slot);
    if (stack.isEmpty()) {
      return null;
    }
    String id = BuiltInRegistries.ITEM.getKey(stack.getItem()).toString();
    boolean wears = stack.isDamageableItem();
    Component custom = stack.get(DataComponents.CUSTOM_NAME);

    Map<String, Integer> enchants = new LinkedHashMap<>();
    for (Object2IntMap.Entry<Holder<net.minecraft.world.item.enchantment.Enchantment>> entry :
        stack.getEnchantments().entrySet()) {
      String name = entry.getKey().getRegisteredName();
      enchants.put(name.substring(name.indexOf(':') + 1), entry.getIntValue());
    }
    String[] trim = Compat.trimOf(stack);
    return new ItemInfo(
        id,
        stack.getCount(),
        wears ? stack.getDamageValue() : 0,
        wears ? stack.getMaxDamage() : 0,
        custom == null ? null : custom.getString(),
        enchants,
        trim == null ? null : new ItemInfo.Trim(trim[0], trim[1]));
  }

  @Override
  public boolean canMerge(int from, int to) {
    ItemStack a = container.getItem(from);
    ItemStack b = container.getItem(to);
    return !a.isEmpty()
        && !b.isEmpty()
        && ItemStack.isSameItemSameComponents(a, b)
        && b.getCount() < b.getMaxStackSize();
  }

  @Override
  public void merge(int from, int to) {
    ItemStack a = container.getItem(from);
    ItemStack b = container.getItem(to);
    int moved = Math.min(a.getCount(), b.getMaxStackSize() - b.getCount());
    b.grow(moved);
    a.shrink(moved);
    container.setItem(to, b);
    container.setItem(from, a.isEmpty() ? ItemStack.EMPTY : a);
  }

  @Override
  public void exchange(int a, int b) {
    ItemStack first = container.getItem(a);
    ItemStack second = container.getItem(b);
    container.setItem(a, second);
    container.setItem(b, first);
  }

  @Override
  public void clear(int slot) {
    container.setItem(slot, ItemStack.EMPTY);
  }

  @Override
  public boolean accepts(int to, int from) {
    if (!worn) {
      return true;
    }
    EquipmentSlot wanted =
        switch (to) {
          case InventorySlots.BOOTS -> EquipmentSlot.FEET;
          case InventorySlots.LEGGINGS -> EquipmentSlot.LEGS;
          case InventorySlots.CHESTPLATE -> EquipmentSlot.CHEST;
          case InventorySlots.HELMET -> EquipmentSlot.HEAD;
          default -> null;
        };
    ItemStack stack = container.getItem(from);
    // Everything fits in the normal slots and the off hand, an armor slot only takes what the game lets a player wear there.
    return wanted == null || stack.isEmpty() || player.getEquipmentSlotForItem(stack) == wanted;
  }
}
