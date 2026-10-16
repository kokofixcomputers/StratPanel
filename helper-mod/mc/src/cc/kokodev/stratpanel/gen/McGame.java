package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.Game;
import cc.kokodev.stratpanel.core.PlayerHandle;
import cc.kokodev.stratpanel.core.WorldInfo;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.tree.CommandNode;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.commands.synchronization.ArgumentTypeInfo;
import net.minecraft.commands.synchronization.ArgumentTypeInfos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;

/** The running game, seen through the classes of this generation of Minecraft. */
public final class McGame implements Game {

  private final MinecraftServer server;
  // Only with -Dstratosphere.selftest=true, see SelfTest.
  private McPlayer testPlayer;

  public McGame(MinecraftServer server) {
    this.server = server;
    if (SelfTest.enabled()) {
      testPlayer = new McPlayer(SelfTest.create(server));
    }
  }

  @Override
  public String minecraftVersion() {
    return server.getServerVersion();
  }

  @Override
  public List<PlayerHandle> players() {
    List<PlayerHandle> players = new ArrayList<>();
    for (ServerPlayer player : server.getPlayerList().getPlayers()) {
      players.add(new McPlayer(player));
    }
    if (testPlayer != null) {
      players.add(testPlayer);
    }
    return players;
  }

  @Override
  public PlayerHandle player(String name) {
    if (testPlayer != null && testPlayer.name().equalsIgnoreCase(name)) {
      return testPlayer;
    }
    ServerPlayer player = server.getPlayerList().getPlayerByName(name);
    return player == null ? null : new McPlayer(player);
  }

  @Override
  public WorldInfo world() {
    ServerLevel level = server.overworld();

    return level == null
        ? null
        : new WorldInfo(Compat.dayTime(level), Compat.raining(level), Compat.thundering(level));
  }

  @Override
  public CommandNode<?> commandRoot() {
    return server.getCommands().getDispatcher().getRoot();
  }

  @Override
  public String parserId(ArgumentType<?> type) {
    ArgumentTypeInfo<?, ?> info = ArgumentTypeInfos.byClass(type);
    if (info == null) {
      return null;
    }
    Object key = BuiltInRegistries.COMMAND_ARGUMENT_TYPE.getKey(info);
    String id = key == null ? null : key.toString();
    if ("minecraft:resource".equals(id) || "minecraft:resource_or_tag".equals(id)) {
      // These take what the registry holds, the panel has suggestions for effects and enchantments.
      String registry = Compat.registryOf(type);
      if ("minecraft:mob_effect".equals(registry) || "minecraft:enchantment".equals(registry)) {
        return registry;
      }
    }
    return id;
  }
}
