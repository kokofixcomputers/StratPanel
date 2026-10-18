package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class InventorySlotsTest {

  @Test
  void knowsTheSlotsOfAPlayer() {
    assertTrue(InventorySlots.isValid(0));
    assertTrue(InventorySlots.isValid(40));
    assertFalse(InventorySlots.isValid(-1));
    assertFalse(InventorySlots.isValid(41));
  }

  @Test
  void anEnderChestHasTwentySevenSlots() {
    assertTrue(InventorySlots.isValidIn(0, InventorySlots.ENDER_COUNT));
    assertTrue(InventorySlots.isValidIn(26, InventorySlots.ENDER_COUNT));
    assertFalse(InventorySlots.isValidIn(27, InventorySlots.ENDER_COUNT));
    assertFalse(InventorySlots.isValidIn(-1, InventorySlots.ENDER_COUNT));
  }

  @Test
  void aShulkerBoxHasTwentySevenSlotsAndIsRecognisedInEveryColour() {
    assertTrue(InventorySlots.isValidIn(26, InventorySlots.SHULKER_COUNT));
    assertFalse(InventorySlots.isValidIn(27, InventorySlots.SHULKER_COUNT));

    assertTrue(InventorySlots.isShulkerBox("minecraft:shulker_box"));
    assertTrue(InventorySlots.isShulkerBox("minecraft:light_blue_shulker_box"));
    assertTrue(InventorySlots.isShulkerBox("MINECRAFT:RED_SHULKER_BOX"));
    assertFalse(InventorySlots.isShulkerBox("minecraft:shulker_shell"));
    assertFalse(InventorySlots.isShulkerBox("minecraft:chest"));
    assertFalse(InventorySlots.isShulkerBox("minecraft:shulker_box_fake"));
    assertFalse(InventorySlots.isShulkerBox(null));
  }

  @Test
  void armorSlotsOnlyTakeArmor() {
    assertTrue(InventorySlots.accepts(InventorySlots.HELMET, "DIAMOND_HELMET"));
    assertTrue(InventorySlots.accepts(InventorySlots.HELMET, "CARVED_PUMPKIN"));
    assertTrue(InventorySlots.accepts(InventorySlots.HELMET, "ZOMBIE_HEAD"));
    assertFalse(InventorySlots.accepts(InventorySlots.HELMET, "DIAMOND_BOOTS"));
    assertTrue(InventorySlots.accepts(InventorySlots.CHESTPLATE, "ELYTRA"));
    assertFalse(InventorySlots.accepts(InventorySlots.CHESTPLATE, "STONE"));
    assertTrue(InventorySlots.accepts(InventorySlots.LEGGINGS, "iron_leggings"));
    assertFalse(InventorySlots.accepts(InventorySlots.LEGGINGS, "IRON_CHESTPLATE"));
    assertTrue(InventorySlots.accepts(InventorySlots.BOOTS, "NETHERITE_BOOTS"));
    assertFalse(InventorySlots.accepts(InventorySlots.BOOTS, "DIAMOND"));
  }

  @Test
  void otherSlotsTakeAnything() {
    assertTrue(InventorySlots.accepts(0, "STONE"));
    assertTrue(InventorySlots.accepts(20, "DIAMOND_HELMET"));
    assertTrue(InventorySlots.accepts(InventorySlots.OFF_HAND, "SHIELD"));
  }

  @Test
  void anEmptySlotFitsEverywhere() {
    assertTrue(InventorySlots.accepts(InventorySlots.HELMET, "AIR"));
    assertTrue(InventorySlots.accepts(InventorySlots.BOOTS, "air"));
  }
}
