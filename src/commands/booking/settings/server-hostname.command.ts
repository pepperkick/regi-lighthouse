import { PreferenceService } from '../../../preference.service';
import { CommandInteraction } from 'discord.js';
import * as config from '../../../../config.json';
import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { BookingCommand, SettingsStrings } from '../../booking.command';

@Discord()
@SlashGroup('settings', 'booking')
export class ServerHostnameCommand {
  @Slash('server-hostname', { description: 'Change your TF2 Server Name' })
  async exec(
    @SlashOption('name', {
      description: `Type the new name (Cannot use ', ", $ Symbols)`,
    })
    name: string,
    interaction: CommandInteraction,
  ) {
    if (!config.features.settings.serverHostname) {
      return await interaction.reply({
        content: SettingsStrings.SETTING_DISABLED,
        ephemeral: true,
      });
    }

    name = name.replace("'", '');
    name = name.replace('$', '');
    name = name.replace('"', '');

    let message = SettingsStrings.SETTING_SAVED;
    if (
      !BookingCommand.userHasAccess(
        interaction.member,
        config.features.settings.serverHostname,
      )
    ) {
      message += `\n${SettingsStrings.SETTING_NO_ACCESS}`;
    }

    await BookingCommand.preferenceService.storeData(
      interaction.user.id,
      PreferenceService.Keys.serverHostname,
      name,
    );
    await interaction.reply({
      content: message,
      ephemeral: true,
    });
  }
}
