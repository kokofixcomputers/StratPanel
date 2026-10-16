package cc.kokodev.stratpanel.core;

/** The time of day and the weather of the main world (the overworld). {@code time} counts ticks, 24000 make a day. */
public record WorldInfo(long time, boolean raining, boolean thundering) {}
