import * as moment from 'moment';
import * as config from '../config.json';
import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
import { BookingService } from './booking.service';
import { DiscordClient, On } from 'discord-nestjs';
import { DiscordAPIError, GuildMember, Message } from 'discord.js';
import {
  getDateFromRelativeTime,
  MessageFilter,
  OnAdminCommand,
  OnDMCommand,
  OnUserCommand,
  parseMessageArgs,
  parseUserArg,
  parseUserString,
} from './utils';
import { ErrorMessage, WarningMessage } from './objects/message.exception';
import { MessageService } from './message.service';
import { BookingAdminService } from './booking-admin.service';
import { I18nService } from 'nestjs-i18n';
import { BookingOptions } from './objects/booking.interface';
import { MessageType } from './objects/message-types.enum';
import { PreferenceService } from './preference.service';

@Controller()
export class BookingControllerDiscord {
  private readonly logger = new Logger(BookingControllerDiscord.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly bookingAdminService: BookingAdminService,
    private readonly preferenceService: PreferenceService,
    private readonly messageService: MessageService,
    private readonly bot: DiscordClient,
    private readonly i18n: I18nService,
  ) {}

  @On({ event: 'ready' })
  onReady(): void {
    this.logger.log(`Logged in as ${this.bot.user.tag}!`);
  }

  @OnUserCommand('book')
  @MessageFilter()
  async userBook(message: Message): Promise<void> {
    const args = parseMessageArgs(message);
    const bookingOptions: BookingOptions = {
      message,
      region: null,
      bookingFor: message.member,
      bookingBy: message.member,
      variant: this.bookingService.defaultVariant,
      tier: this.bookingService.userHasRoleFromSlug(
        message.member,
        config.features.premiumBooking,
      )
        ? config.preferences.defaultPremiumTier
        : config.preferences.defaultFreeTier,
    };

    // Parse arguments
    for (const arg of args) {
      // Try parsing region
      const region = this.bookingService.parseRegion(arg);
      if (region) {
        bookingOptions.region = region;
        continue;
      }

      // Try parsing tier
      const tier = this.parseTier(arg);
      if (tier) {
        bookingOptions.tier = tier;
        continue;
      }

      // Try parsing user
      try {
        const member = await parseUserString(this.bot, message, arg);
        if (!member) {
          throw new WarningMessage(
            await this.i18n.t('COMMAND.USER.BOOK.USER_IS_UNKNOWN'),
          );
        }

        if (member.user.id === message.author.id) {
          throw new WarningMessage(
            await this.i18n.t('COMMAND.USER.BOOK.CANNOT_SELF_MULTI_BOOK'),
          );
        }

        if (member.user.bot) {
          throw new WarningMessage(
            await this.i18n.t('COMMAND.USER.BOOK.USER_IS_BOT'),
          );
        }

        bookingOptions.bookingFor = member;
        continue;
      } catch (error) {
        if (error instanceof DiscordAPIError) {
          continue;
        } else {
          throw error;
        }
      }

      throw new WarningMessage(await this.i18n.t('COMMAND.USER.BOOK.USAGE'));
    }

    // If tier is not default then check if user has tier 3
    if (
      !['free', 'premium'].includes(bookingOptions.tier) &&
      !this.bookingService.userHasRoleFromSlug(
        message.member,
        config.features.providerSelector,
      )
    ) {
      throw new WarningMessage(
        await this.i18n.t('COMMAND.USER.BOOK.PROVIDER_SELECTION.RESTRICTED'),
      );
    }

    // If bookedBy and bookedFor is different then check if bookedBy has tier 3
    if (
      bookingOptions.bookingFor !== bookingOptions.bookingBy &&
      !this.bookingService.userHasRoleFromSlug(
        message.member,
        config.features.multiBooking,
      )
    ) {
      throw new WarningMessage(
        await this.i18n.t('COMMAND.USER.BOOK.MULTI.RESTRICTED'),
      );
    }

    // Use user's preferred region if present
    if (!bookingOptions.region) {
      bookingOptions.region = await this.preferenceService.getDataString(
        bookingOptions.bookingFor.user.id,
        PreferenceService.Keys.bookingRegion,
      );
    }

    // Use default region if available and no region was given
    if (!bookingOptions.region && this.bookingService.defaultRegion) {
      bookingOptions.region = this.bookingService.defaultRegion;
    }

    // Check if region is present
    if (!bookingOptions.region) {
      throw new WarningMessage(await this.i18n.t('REGION.UNKNOWN'));
    }

    // Check if tier is correct
    const tierConfig = this.bookingService.getTierConfig(
      bookingOptions.region,
      bookingOptions.tier,
    );
    if (!tierConfig) {
      throw new WarningMessage(await this.i18n.t('TIER.UNKNOWN'));
    }

    // Validate and create booking
    if (await this.bookingService.validateBookRequest(bookingOptions)) {
      return this.bookingService.createBookingRequest(bookingOptions);
    }
  }

  @OnUserCommand('unbook')
  @MessageFilter()
  async userUnbook(message: Message): Promise<void> {
    await this.bookingService.destroyUserBooking(message.author);
  }

  @OnUserCommand('resend')
  @MessageFilter()
  async userResend(message: Message): Promise<void> {
    await this.bookingService.sendBookingDetails(message.author);
  }

  @OnUserCommand('reserve')
  @MessageFilter()
  async userReserve(message: Message): Promise<void> {
    const args = parseMessageArgs(message);
    const bookingOptions: BookingOptions = {
      message,
      region: null,
      bookingFor: message.member,
      bookingBy: message.member,
      variant: this.bookingService.defaultVariant,
      tier: config.preferences.defaultPremiumTier,
    };

    if (
      !this.bookingService.userHasRoleFromSlug(
        message.member,
        config.features.reservation,
      )
    )
      throw new WarningMessage(
        await this.i18n.t('COMMAND.USER.RESERVE.RESTRICTED'),
      );

    // Parse arguments
    for (const arg of args) {
      // Try parsing region
      const region = this.bookingService.parseRegion(arg);
      if (region) {
        bookingOptions.region = region;
        continue;
      }

      // Try parsing tier
      const tier = this.parseTier(arg);
      if (tier) {
        bookingOptions.tier = tier;
        continue;
      }

      // Try parsing time
      const date = getDateFromRelativeTime(arg);
      if (date) {
        bookingOptions.reserveAt = date.toDate();
        continue;
      }

      throw new WarningMessage(await this.i18n.t('COMMAND.USER.BOOK.USAGE'));
    }

    // Use default region if available and no region was given
    if (!bookingOptions.region && this.bookingService.defaultRegion) {
      bookingOptions.region = this.bookingService.defaultRegion;
    }

    // Check if region is present
    if (!bookingOptions.region) {
      throw new WarningMessage(await this.i18n.t('REGION.UNKNOWN'));
    }

    // Check if tier is correct
    const tierConfig = this.bookingService.getTierConfig(
      bookingOptions.region,
      bookingOptions.tier,
    );
    if (!tierConfig) {
      throw new WarningMessage(await this.i18n.t('TIER.UNKNOWN'));
    }

    const date = bookingOptions.reserveAt;
    const seconds = moment(date).diff(moment(), 'seconds');
    const days = moment(date).diff(moment(), 'days');

    if (seconds < 10) {
      throw new WarningMessage(
        await this.i18n.t('COMMAND.USER.RESERVE.INVALID_TIME'),
      );
    }

    if (seconds <= 1750) {
      throw new WarningMessage(
        await this.i18n.t('COMMAND.USER.RESERVE.TOO_SHORT_TIME'),
      );
    }

    if (days !== 0) {
      throw new WarningMessage(
        await this.i18n.t('COMMAND.USER.RESERVE.TOO_LONG_TIME'),
      );
    }

    // Validate and create booking
    if (await this.bookingService.validateBookRequest(bookingOptions)) {
      await this.bookingService.createBookingRequest(bookingOptions);
    }
  }

  @OnUserCommand('unreserve')
  @MessageFilter()
  async userUnreserve(message: Message): Promise<void> {
    await this.bookingService.cancelReservation(message.author);
    await this.messageService.replyMessageI18n(
      message,
      MessageType.SUCCESS,
      'COMMAND.USER.UNRESERVE.CANCELLED',
    );
  }

  @OnUserCommand('status')
  @MessageFilter()
  async userStatus(message: Message): Promise<void> {
    const args = parseMessageArgs(message);

    if (args.length === 0) await this.bookingService.sendBookingStatus(message);
    else if (args.length === 1)
      await this.bookingService.sendBookingStatus(message, { tag: args[0] });
  }

  @OnAdminCommand('book')
  @MessageFilter()
  async adminBook(message: Message): Promise<void> {
    const args = parseMessageArgs(message);
    const bookingOptions: BookingOptions = {
      message,
      region: null,
      bookingFor: null,
      bookingBy: message.member,
      variant: this.bookingService.defaultVariant,
      tier: 'free',
    };

    if (args.length === 2) {
      args.push('free');
    }

    // 3 args are given
    // user, region, tier
    if (args.length === 3) {
      const [user, region, tier] = args;
      const member = await parseUserArg(this.bot, message, 0);

      if (!member) {
        throw new ErrorMessage(
          await this.i18n.t('COMMAND.ADMIN.BOOK.USER_NOT_FOUND'),
        );
      }

      if (member.user.bot) {
        throw new ErrorMessage(
          await this.i18n.t('COMMAND.ADMIN.BOOK.USER_IS_BOT'),
        );
      }

      const regionSlug = this.bookingService.getRegionSlug(region);
      if (!this.bookingService.isTierValid(regionSlug, tier)) {
        throw new ErrorMessage(await this.i18n.t('TIER.UNKNOWN'));
      }

      if (region && member) {
        bookingOptions.region = regionSlug;
        bookingOptions.bookingFor = member;
        bookingOptions.tier = tier;
        if (
          await this.bookingAdminService.validateBookRequest(bookingOptions)
        ) {
          await this.messageService.replyMessageI18n(
            message,
            MessageType.SUCCESS,
            await this.i18n.t('BOOKING.ADMIN.STARTING', {
              args: { user: member.user.tag },
            }),
          );
          return await this.bookingService.createBookingRequest(bookingOptions);
        }
      }
    }

    throw new WarningMessage(await this.i18n.t('COMMAND.ADMIN.BOOK.USAGE'));
  }

  @OnAdminCommand('unbook')
  @MessageFilter()
  async adminUnbook(message: Message): Promise<void> {
    const args = parseMessageArgs(message);

    // 1 arg is given
    // user
    if (args.length === 1) {
      const member: GuildMember = await parseUserArg(this.bot, message, 0);

      if (!member) {
        throw new ErrorMessage(
          await this.i18n.t('COMMAND.ADMIN.UNBOOK.USER_NOT_FOUND'),
        );
      }

      if (member.user.bot) {
        throw new ErrorMessage(
          await this.i18n.t('COMMAND.ADMIN.UNBOOK.BOT_HAS_NO_BOOKING'),
        );
      }

      await this.messageService.replyMessageI18n(
        message,
        MessageType.SUCCESS,
        await this.i18n.t('BOOKING.ADMIN.STOPPING', {
          args: { user: member.user.tag },
        }),
      );
      await this.bookingService.destroyUserBooking(member.user, {
        forSomeoneElse: true,
      });
      return;
    }

    throw new WarningMessage(await this.i18n.t('COMMAND.ADMIN.UNBOOK.USAGE'));
  }

  @OnAdminCommand('status')
  @MessageFilter()
  async adminStatus(message: Message): Promise<void> {
    const args = parseMessageArgs(message);

    // No args given
    if (args.length === 0) await this.bookingAdminService.sendStatus(message);
    // 1 arg is given
    else if (args.length === 1) {
      try {
        const region = this.bookingService.getRegionSlug(args[0]);
        if (region) {
          await this.bookingAdminService.sendRegionStatus(message, region);
          return;
        }
      } catch (error) {}

      try {
        const member = await parseUserArg(this.bot, message, 0);
        if (member) {
          await this.bookingAdminService.sendUserStatus(message, member.user);
          return;
        }
      } catch (error) {}

      try {
        const booking = await this.bookingService.getById(args[0]);
        if (booking) {
          await this.bookingAdminService.sendBookingStatus(message, booking);
          return;
        }
      } catch (error) {}
    }

    // TODO: Add usage
  }

  // @OnDMCommand("resend")
  // @MessageFilter()
  // async dmResend(message: Message): Promise<void> {
  // 	await this.bookingService.sendBookingDetails(message.author, { noStatusMessage: true });
  // }
  //
  // @OnDMCommand("rcon")
  // @MessageFilter()
  // async dmRcon(message: Message): Promise<void> {
  // 	const user = message.author;
  // 	const userBookings = await this.bookingService.getUserRunningBookings(user.id);
  // 	if (userBookings.length === 0) {
  // 		throw new WarningMessage(await this.i18n.t("COMMAND.USER.RCON.NO_SERVER"));
  // 	}
  // 	else if (userBookings.length === 1) {
  // 		const command = message.content || "status";
  // 		try {
  // 			const res = await BookingService.sendRconCommandRequest(userBookings[0], command);
  // 			const embed = MessageService.buildTextMessage(MessageType.SUCCESS, `\`\`\`${res}\`\`\``, "RCON Response");
  // 			await message.reply("", embed);
  // 		} catch (error) {
  // 			this.logger.error("Failed to send rcon command", error);
  // 			throw new ErrorMessage(await this.i18n.t("COMMAND.USER.RCON.FAILED"));
  // 		}
  // 	}
  // }

  parseTier(arg: string) {
    const tier = arg.toUpperCase();
    if (tier.charAt(0) === 'P') {
      if (tier === 'P1') return 'premium';
      return tier.replace(/P/g, 'premium');
    } else if (tier.charAt(0) === 'F') {
      if (tier === 'F1') return 'free';
      return tier.replace(/F/g, 'free');
    }
  }
}
