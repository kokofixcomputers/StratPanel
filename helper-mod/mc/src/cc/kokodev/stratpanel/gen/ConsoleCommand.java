package cc.kokodev.stratpanel.gen;

import cc.kokodev.stratpanel.core.Helper;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import java.util.function.Supplier;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;

/** The console command the panel talks to the helper with. */
public final class ConsoleCommand {

  private ConsoleCommand() {}

  /**
   * Adds the command. Only the console may use it, the panel talks to the server through the console: whoever is not an
   * entity and has the permission of an owner, which leaves out players and command blocks.
   */
  public static void register(CommandDispatcher<CommandSourceStack> dispatcher, Supplier<Helper> helper) {
    dispatcher.register(
        Commands.literal(Helper.COMMAND)
            .requires(source -> source.getEntity() == null && Compat.isOwner(source))
            .executes(context -> 0)
            .then(
                Commands.argument("arguments", StringArgumentType.greedyString())
                    .executes(
                        context -> {
                          Helper current = helper.get();
                          if (current != null) {
                            current.execute(
                                StringArgumentType.getString(context, "arguments").trim().split("\\s+"));
                          }
                          return 1;
                        })));
  }
}
