package cc.kokodev.stratpanel.core;

import java.util.Map;

/** What the panel shows of an item stack. {@code damage} and {@code maxDamage} are 0 for an item that does not wear. */
public record ItemInfo(
    String id, int count, int damage, int maxDamage, String name, Map<String, Integer> enchants) {}
