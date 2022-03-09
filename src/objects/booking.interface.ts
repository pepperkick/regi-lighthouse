import { CommandInteraction, GuildMember, Message } from 'discord.js';
import { APIInteractionGuildMember } from 'discord-api-types';

export interface BookingOptions {
  message: Message | CommandInteraction;
  bookingFor: GuildMember | APIInteractionGuildMember;
  bookingBy: GuildMember | APIInteractionGuildMember;
  reserveAt?: Date;
  region: string;
  variant: string;
  tier: string;
}

export interface RequestOptions {
  game: string;
  region: string;
  provider: string;
  data?: any;
  callbackUrl?: string;
  closePref?: {
    minPlayers: number;
    idleTime: number;
    waitTime: number;
  };
}
