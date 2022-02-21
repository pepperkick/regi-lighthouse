import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { CommandInteraction } from 'discord.js';
import { BookingCommand } from '../booking.command';
import * as config from '../../../config.json';
import { downloadMap, uploadMap } from '../../utils';
import { Logger } from '@nestjs/common';

@Discord()
@SlashGroup('booking')
export class UploadMapCommand {
  private readonly logger = new Logger(UploadMapCommand.name);

  @Slash('upload-map', {
    description: 'Upload a map to FastDL from then given URL',
  })
  async exec(
    @SlashOption('url', {
      description: 'URL of the map.',
    })
    url: string,
    interaction: CommandInteraction,
  ) {
    if (
      !BookingCommand.userHasAccess(
        interaction.member,
        config.features.uploadMaps,
      )
    ) {
      return await interaction.reply({
        content: `Currently you do not have access to uploading maps.`,
        ephemeral: true,
      });
    }

    this.logger.log(
      `Received upload map request from user ${interaction.user.username} (${interaction.user.id}) [${url}]`,
    );

    if (
      url.includes('f000.backblazeb2.com/file/qixalite-fastdl/') ||
      url.includes('fastdl.tf.qixalite.com')
    ) {
      return await interaction.reply({
        content: `Cannot use the provided url.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    const parts = url.split('/');
    const filename = parts[parts.length - 1].split('?')[0];

    const name = await downloadMap(filename, url);
    if (!name) {
      return await interaction.editReply({
        content: `Failed to download the map.`,
      });
    }

    if (!(await uploadMap(name))) {
      return await interaction.editReply({
        content: `Failed to upload the map.`,
      });
    }

    return await interaction.editReply({
      content: `Your map \`${name}\`has been successfully uploaded.`,
    });
  }
}
