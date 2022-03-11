import { Discord, Slash, SlashGroup, SlashOption } from 'discordx';
import { CommandInteraction, GuildMember } from 'discord.js';
import { PreferenceService } from '../preference.service';
import { BookingService } from '../booking.service';
import { APIInteractionGuildMember } from 'discord-api-types';
import { Module } from '@nestjs/common';
import { ServerPasswordCommand } from './booking/settings/server-password.command';
import { ServerHostnameCommand } from './booking/settings/server-hostname.command';
import { ServerRconPasswordCommand } from './booking/settings/server-rcon-password.command';
import { ServerValveSdrCommand } from './booking/settings/server-valve-sdr.command';
import { ServerTvNameCommand } from './booking/settings/server-tv-name.command';
import { BookingRegionCommand } from './booking/settings/booking-region.command';
import { CreateCommand } from './booking/create.command';
import { RconCommand } from './booking/rcon.command';
import { StatusCommand } from './booking/status.command';
import { ServerDemosCommand } from './booking/server-demos.command';
import { ServerLogsCommand } from './booking/server-logs.command';
import { DestroyCommand } from './booking/destroy.command';

export class SettingsStrings {
  static readonly SETTING_DISABLED =
    'This discord server does not support changing this setting.';
  static readonly PASSWORD_SAVED = 'Your password has been saved!';
  static readonly SETTING_SAVED = 'Your preference has been saved!';
  static readonly SETTING_NO_ACCESS =
    'However, you do not have the proper role so you will not see this change take effect.';
}

@Discord()
@SlashGroup({
  name: 'booking',
  description: 'Commands to interact with bookings.',
})
@SlashGroup({
  name: 'settings',
  description: 'Change your booking preference.',
  root: 'booking',
})
@Module({
  exports: [
    CreateCommand,
    DestroyCommand,
    RconCommand,
    StatusCommand,
    ServerDemosCommand,
    ServerLogsCommand,

    ServerPasswordCommand,
    ServerHostnameCommand,
    ServerRconPasswordCommand,
    ServerValveSdrCommand,
    ServerTvNameCommand,
    BookingRegionCommand,
  ],
})
export class BookingCommand {
  static preferenceService: PreferenceService;
  static bookingService: BookingService;

  constructor(
    private readonly preferenceService: PreferenceService,
    private readonly bookingService: BookingService,
  ) {
    BookingCommand.preferenceService = preferenceService;
    BookingCommand.bookingService = bookingService;
  }

  static userHasAccess(
    member: GuildMember | APIInteractionGuildMember,
    access: boolean | string,
  ) {
    return BookingCommand.bookingService.userHasRoleFromSlug(member, access);
  }
}
