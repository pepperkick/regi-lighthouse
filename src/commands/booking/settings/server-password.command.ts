import { PreferenceService } from '../../../preference.service';
import { CommandInteraction } from 'discord.js';
import * as config from '../../../../config.json';
import { BookingCommand, SettingsStrings } from '../../booking.command';
import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';

@Discord()
@SlashGroup('settings', 'booking')
export class ServerPasswordCommand {
  @Slash('server-password', {
    description:
      'Change your TF2 Server password (Leave blank for no password).',
  })
  async exec(
    @SlashOption('password', {
      description: 'Type your new password (Type * for random password)',
      required: false,
    })
    password: string,
    interaction: CommandInteraction,
  ) {
    if (!config.features.settings.serverPassword) {
      return await interaction.reply({
        content: SettingsStrings.SETTING_DISABLED,
        ephemeral: true,
      });
    }

    if (!password) {
      password = '';
    }

    if (password.includes(' ')) {
      return await interaction.reply({
        content: `Passwords cannot contain spaces.`,
        ephemeral: true,
      });
    }

    password = password.replace("'", '');
    password = password.replace('$', '');
    password = password.replace('"', '');

    await BookingCommand.preferenceService.storeData(
      interaction.user.id,
      PreferenceService.Keys.serverPassword,
      password,
    );

    let message = SettingsStrings.PASSWORD_SAVED;
    if (
      !BookingCommand.userHasAccess(
        interaction.member,
        config.features.settings.serverPassword,
      )
    ) {
      message += `\nHowever, you do not have the proper role so you will not see this change.`;
    }

    await interaction.reply({
      content: message,
      ephemeral: true,
    });
  }
}
