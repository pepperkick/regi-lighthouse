import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Logger } from '@nestjs/common';
import { Intents, Interaction, Message } from 'discord.js';
import { Client } from 'discordx';
import { Preference } from './preference.model';
import * as config from '../config.json';

export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(
    @InjectModel(Preference.name)
    private readonly preference: Model<Preference>,
  ) {
    this.run();
  }

  async run() {
    const client = new Client({
      simpleCommand: {
        prefix: '',
      },
      intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
      botGuilds: [config.guild],
    });

    client.once('ready', async () => {
      // init all application commands
      await client.initApplicationCommands({
        guild: { log: true, disable: { delete: true } },
        global: { log: true, disable: { delete: true } },
      });

      // init permissions; enabled log to see changes
      await client.initApplicationPermissions(true);

      console.log('Bot started');
    });

    client.on('interactionCreate', (interaction: Interaction) => {
      if (interaction.guild.id !== config.guild) return;
      if (
        interaction.channel.id !== config.channels.users &&
        interaction.channel.id !== config.channels.admin
      )
        return;
      client.executeInteraction(interaction);
    });

    client.on('messageCreate', (message: Message) => {
      client.executeCommand(message);
    });

    client.login(config.token);
  }
}
