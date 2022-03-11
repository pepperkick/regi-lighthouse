import { Discord, Slash, SlashGroup } from 'discordx';
import { BookingCommand } from '../booking.command';
import { CommandInteraction } from 'discord.js';

@Discord()
@SlashGroup('booking')
export class DestroyCommand {
  @Slash('destroy', { description: 'Create a new booking server.' })
  async exec(interaction: CommandInteraction) {
    if (
      await BookingCommand.bookingService.destroyUserBooking(interaction.member)
    ) {
      await interaction.reply({
        content: `Your booking has been destroyed.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `You don't have a booking to destroy.`,
        ephemeral: true,
      });
    }
  }
}
