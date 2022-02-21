import { Discord, Slash, SlashGroup } from 'discordx';
import { CommandInteraction } from 'discord.js';
import { BookingService } from '../../booking.service';
import * as moment from 'moment';
import { BookingCommand } from '../booking.command';

@Discord()
@SlashGroup('booking')
export class ServerLogsCommand {
  @Slash('server-logs', {
    description:
      'List and download match log files (You should have an active booking to use this).',
  })
  async exec(interaction: CommandInteraction) {
    const user = interaction.user.id;
    const booking = await BookingCommand.bookingService.getActiveUserBooking(
      user,
    );

    if (!booking) {
      return await interaction.reply({
        content: `You currently do not have any active booking.`,
        ephemeral: true,
      });
    }

    const files = await BookingService.getServerLogsList(booking);

    let message = '';
    for (const [index, file] of files.entries()) {
      message += `${index + 1}. [${
        file.name
      }](${await BookingService.getHatchApiUrl(booking, file.url)}) (${moment(
        file.modifiedAt,
      )
        .toDate()
        .toUTCString()})\n`;
    }

    console.log(files);
    await interaction.reply({
      content: message,
      ephemeral: true,
    });
  }
}
