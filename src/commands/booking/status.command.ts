import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from 'discordx';
import { AutocompleteInteraction, CommandInteraction } from 'discord.js';
import { BookingCommand } from '../booking.command';

enum Continents {
  'Asia' = 'asia',
  'Australia' = 'australia',
  'Europe' = 'europe',
  'North America' = 'north_america',
  'South America' = 'south_america',
}

@Discord()
@SlashGroup('booking')
export class StatusCommand {
  @Slash('status', {
    description: 'Check the availability of servers across regions',
  })
  async exec(
    @SlashChoice(Continents)
    @SlashOption('continent', {
      description: 'Filter regions by continent',
      required: false,
    })
    continent: string,
    @SlashOption('tag', {
      description: 'Filter regions by tag',
      autocomplete: true,
      required: false,
      type: 'STRING',
    })
    tag: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const tags = BookingCommand.bookingService.getAllRegionTags();
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'tag') {
        const text = interaction.options.getString('tag');
        await interaction.respond(
          tags
            .filter((item) => item.includes(text))
            .map((item) => ({ name: item, value: item }))
            .slice(0, 24),
        );
      }
    } else {
      await BookingCommand.bookingService.sendBookingStatus(interaction, {
        continent,
        tag,
      });
    }
  }
}
