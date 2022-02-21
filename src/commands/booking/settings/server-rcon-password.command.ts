import { PreferenceService } from '../../../preference.service';
import { CommandInteraction } from 'discord.js';
import * as config from '../../../../config.json';
import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { BookingCommand, SettingsStrings } from '../../booking.command';

@Discord()
@SlashGroup('settings', 'booking')
export class ServerRconPasswordCommand {
  @Slash('server-rcon-password', {
    description: 'Change your TF2 RCON Server password',
  })
  async exec(
    @SlashOption('password', {
      description: 'Type your new password (Type * for random password)',
    })
    password: string,
    interaction: CommandInteraction,
  ) {
    if (!config.features.settings.serverRconPassword) {
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

    let message = SettingsStrings.PASSWORD_SAVED;
    if (
      !BookingCommand.userHasAccess(
        interaction.member,
        config.features.settings.serverRconPassword,
      )
    ) {
      message += `\n${SettingsStrings.SETTING_NO_ACCESS}`;
    }

    await BookingCommand.preferenceService.storeData(
      interaction.user.id,
      PreferenceService.Keys.serverRconPassword,
      password,
    );
    await interaction.reply({
      content: message,
      ephemeral: true,
    });
  }
}
