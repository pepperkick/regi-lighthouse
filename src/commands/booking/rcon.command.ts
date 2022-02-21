import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { AutocompleteInteraction, CommandInteraction } from 'discord.js';
import { BookingCommand } from '../booking.command';
import { PreferenceService } from '../../preference.service';
import * as config from '../../../config.json';
import { BookingService } from '../../booking.service';

@Discord()
@SlashGroup('booking')
export class RconCommand {
  @Slash('rcon', {
    description:
      'Send a RCON command to your server (You should have an active booking to use this).',
  })
  async exec(
    @SlashOption('command', {
      description: "RCON command to send (Default: 'status')",
      autocomplete: true,
      required: false,
      type: 'STRING',
    })
    command: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    const user = interaction.user.id;
    const history =
      (await BookingCommand.preferenceService.getDataStringArray(
        user,
        PreferenceService.Keys.rconCommandHistory,
      )) || [];
    const common = config.preferences.rconCommonCommands;
    const commands = history.concat(
      common.filter((item) => history.indexOf(item) < 0),
    );

    if (interaction.isAutocomplete()) {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'command') {
        const text = interaction.options.getString('command');
        await interaction.respond(
          commands
            .filter((item) => item.includes(text))
            .map((item) => ({ name: item, value: item }))
            .slice(0, 24),
        );
      }
    } else {
      if (!command || command == '') command = 'status';

      const booking = await BookingCommand.bookingService.getActiveUserBooking(
        user,
      );

      if (!booking) {
        return await interaction.reply({
          content: `You currently do not have any active booking.`,
          ephemeral: true,
        });
      }

      try {
        let response = await BookingService.sendRconCommandRequest(
          booking,
          command,
        );

        if (!response.includes('Unknown command')) {
          // Store the command in player's history
          if (!commands.includes(command)) {
            commands.push(command);
          }

          await BookingCommand.preferenceService.storeData(
            user,
            PreferenceService.Keys.rconCommandHistory,
            commands,
          );
        }

        if (response === '') {
          response = ' ';
        }

        await interaction.reply({
          content: `\`\`\`${response.slice(0, 1960)}\`\`\``,
          ephemeral: true,
        });
      } catch (error) {
        await interaction.reply({
          content: `Failed to connect to the server. Please try again later.`,
          ephemeral: true,
        });
      }
    }
  }
}
