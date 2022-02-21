import { PreferenceService } from '../../../preference.service';
import { CommandInteraction } from 'discord.js';
import * as config from '../../../../config.json';
import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { BookingCommand, SettingsStrings } from '../../booking.command';

@Discord()
@SlashGroup('settings', 'booking')
export class ServerValveSdrCommand {
  @Slash('server-valve-sdr', {
    description:
      'Enable / Disable TF2 Valve SDR connection mode (This is an experimental feature).',
  })
  async exec(
    @SlashOption('enable', { description: 'Enable or disable the feature' })
    enable: boolean,
    interaction: CommandInteraction,
  ) {
    if (!config.features.settings.serverTf2ValveSdr) {
      return await interaction.reply({
        content: SettingsStrings.SETTING_DISABLED,
        ephemeral: true,
      });
    }

    let message = SettingsStrings.SETTING_SAVED;
    if (
      !BookingCommand.userHasAccess(
        interaction.member,
        config.features.settings.serverTf2ValveSdr,
      )
    ) {
      message += `\n${SettingsStrings.SETTING_NO_ACCESS}`;
    }

    await BookingCommand.preferenceService.storeData(
      interaction.user.id,
      PreferenceService.Keys.serverTf2ValveSdr,
      enable,
    );
    await interaction.reply({
      content: message,
      ephemeral: true,
    });
  }
}
