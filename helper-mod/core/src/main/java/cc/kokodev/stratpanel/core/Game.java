package cc.kokodev.stratpanel.core;

import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.tree.CommandNode;
import java.util.List;

/**
 * What the helper needs to know about the running game. One implementation per Minecraft generation, written against that
 * generation's classes, so everything else is free of them. All methods are called on the server thread.
 */
public interface Game {

  /** The version of Minecraft, such as {@code 1.21.1} or {@code 26.3}. */
  String minecraftVersion();

  /** Everybody who is online. */
  List<PlayerHandle> players();

  /** The player with that name (any capitalisation), or null. */
  PlayerHandle player(String name);

  /** The root of the Brigadier tree of the server, null when it cannot be reached. */
  CommandNode<?> commandRoot();

  /** The time and the weather of the overworld, null when the game cannot tell. */
  default WorldInfo world() {
    return null;
  }

  /** The id the vanilla command tree gives an argument type (such as {@code minecraft:entity}), null when unknown. */
  String parserId(ArgumentType<?> type);
}
