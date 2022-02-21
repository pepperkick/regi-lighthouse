import { PreferenceService } from '../../../preference.service';
import { AutocompleteInteraction, CommandInteraction } from 'discord.js';
import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { BookingCommand, SettingsStrings } from '../../booking.command';

@Discord()
@SlashGroup('settings', 'booking')
export class BookingRegionCommand {
  @Slash('booking-region', { description: 'Set your preferred booking region' })
  async exec(
    @SlashOption('region', {
      description: `Type the region name`,
      autocomplete: true,
      type: 'STRING',
    })
    region: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'region') {
        const text = interaction.options.getString('region');
        return interaction.respond(
          BookingCommand.bookingService
            .searchRegions(text.toLocaleLowerCase())
            .slice(0, 24),
        );
      }
    } else {
      const message = SettingsStrings.SETTING_SAVED;
      region = BookingCommand.bookingService.parseRegion(region);

      if (!region) {
        return await interaction.reply({
          content: `Unknown region.`,
          ephemeral: true,
        });
      }

      await BookingCommand.preferenceService.storeData(
        interaction.user.id,
        PreferenceService.Keys.bookingRegion,
        region,
      );
      await interaction.reply({
        content: message,
        ephemeral: true,
      });
    }
  }
}
