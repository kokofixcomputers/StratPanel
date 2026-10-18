package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.InventorySlots;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.NonNullList;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemContainerContents;

/**
 * The 27 slots of a shulker box that is an item (in an inventory or an ender chest). It is a normal container that is filled
 * from the item when it is made and writes everything back to the item whenever a slot changes, so the code that moves items
 * around in a container works on it like on any other.
 */
final class McShulkerContents extends SimpleContainer {

  private final ItemStack box;
  private boolean loading = true;

  McShulkerContents(ItemStack box) {
    super(InventorySlots.SHULKER_COUNT);
    this.box = box;

    NonNullList<ItemStack> items = NonNullList.withSize(InventorySlots.SHULKER_COUNT, ItemStack.EMPTY);
    box.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY).copyInto(items);
    for (int slot = 0; slot < items.size(); slot++) {
      setItem(slot, items.get(slot));
    }
    loading = false;
  }

  @Override
  public void setChanged() {
    super.setChanged();
    if (loading) {
      return;
    }
    List<ItemStack> items = new ArrayList<>();
    boolean empty = true;
    for (int slot = 0; slot < getContainerSize(); slot++) {
      ItemStack stack = getItem(slot);
      empty &= stack.isEmpty();
      items.add(stack);
    }
    // A box with nothing in it has no contents at all, like one that was never filled: it still stacks with the others.
    if (empty) {
      box.remove(DataComponents.CONTAINER);
    } else {
      box.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(items));
    }
  }
}
