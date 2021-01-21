import * as moment from "moment";
import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
import { BookingService } from './booking.service';
import { DiscordClient, On } from "discord-nestjs";
import { GuildMember, Message } from "discord.js";
import {
	getDateFromRelativeTime,
	MessageFilter,
	OnAdminCommand,
	OnDMCommand,
	OnUserCommand,
	parseMessageArgs,
	parseUserArg
} from "./utils";
import { ErrorMessage, WarningMessage } from "./objects/message.exception";
import { MessageService } from "./message.service";
import { ServerStatus } from "./objects/server-status.enum";
import { Server } from "./objects/server.interface";
import { BookingAdminService } from "./booking-admin.service";
import { I18nService } from "nestjs-i18n";
import { BookingOptions } from "./objects/booking.interface";
import { MessageType } from "./objects/message-types.enum";

@Controller()
export class BookingController {
	private readonly logger = new Logger(BookingController.name);

	constructor(
		private readonly bookingService: BookingService,
		private readonly bookingAdminService: BookingAdminService,
		private readonly messageService: MessageService,
		private readonly bot: DiscordClient,
		private readonly i18n: I18nService
	) {
	}

	@Post("/booking/callback")
	async callback(@Body() body: Server, @Query("status") status: ServerStatus): Promise<void> {
		await this.bookingService.handleServerStatusChange(body, status);
	}

	@On({event: 'ready'})
	onReady(): void {
		this.logger.log(`Logged in as ${this.bot.user.tag}!`);
	}

	@OnUserCommand("book")
	@MessageFilter()
	async userBook(message: Message): Promise<void> {
		const args = parseMessageArgs(message);
		const hasTier2 = this.bookingService.isUserTier2(message.member);
		const hasTier3 = this.bookingService.isUserTier3(message.member);
		const bookingOptions: BookingOptions = {
			message,
			region: null,
			bookingFor: message.member,
			bookingBy: message.member,
			tier: hasTier2 || hasTier3 ? "premium" : "free"
		}

		// No args are given
		// Use default region if available
		if (args.length === 0 && this.bookingService.defaultRegion) {
			bookingOptions.region = this.bookingService.defaultRegion;
			if (await this.bookingService.validateBookRequest(bookingOptions)) {
				return this.bookingService.createBooking(bookingOptions);
			}
		}
		// 1 arg is given
		// region
		else if (args.length === 1) {
			const [ region ] = args;
			const regionSlug = this.bookingService.getRegionSlug(region);
			const regionConfig = this.bookingService.getRegionConfig(regionSlug);

			if (!regionConfig) {
				throw new WarningMessage(await this.i18n.t("REGION.UNKNOWN"));
			}

			bookingOptions.region = regionSlug;
			if (await this.bookingService.validateBookRequest(bookingOptions)) {
				return this.bookingService.createBooking(bookingOptions);
			}
		}
		// 2 args are given
		// user, region
		else if (args.length === 2) {
			if (!hasTier3)
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.BOOK.MULTI.RESTRICTED"));

			const [ user, region ] = args;
			const member = await parseUserArg(this.bot, message, 0);
			const regionSlug = this.bookingService.getRegionSlug(region);
			const regionConfig = this.bookingService.getRegionConfig(regionSlug);

			if (!regionConfig) {
				throw new WarningMessage(await this.i18n.t("REGION.UNKNOWN"));
			}

			if (member.user.id === message.author.id){
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.BOOK.CANNOT_SELF_MULTI_BOOK"));
			}

			if (member.user.bot) {
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.BOOK.USER_IS_BOT"));
			}

			bookingOptions.region = regionSlug;
			bookingOptions.bookingFor = member;
			if (await this.bookingService.validateBookRequest(bookingOptions)) {
				return this.bookingService.createBooking(bookingOptions);
			}
		}

		throw new WarningMessage(await this.i18n.t("COMMAND.USER.BOOK.USAGE"));
	}

	@OnUserCommand("unbook")
	@MessageFilter()
	async userUnbook(message: Message): Promise<void> {
		await this.bookingService.destroyUserBooking(message.author);
	}

	@OnUserCommand("resend")
	@MessageFilter()
	async userResend(message: Message): Promise<void> {
		await this.bookingService.sendBookingDetails(message.author);
	}

	@OnUserCommand("reserve")
	@MessageFilter()
	async userReserve(message: Message): Promise<void> {
		const args = parseMessageArgs(message);
		const hasTier2 = this.bookingService.isUserTier2(message.member);
		const hasTier3 = this.bookingService.isUserTier3(message.member);
		const bookingOptions: BookingOptions = {
			message,
			region: null,
			bookingFor: message.member,
			bookingBy: message.member,
			tier: "premium"
		}

		if (!(hasTier2 || hasTier3))
			throw new WarningMessage(await this.i18n.t("COMMAND.USER.RESERVE.RESTRICTED"));

		// 2 args given
		// region, relativeTime
		if (args.length === 2) {
			const [ region, time ] = args;
			const regionSlug = this.bookingService.getRegionSlug(region);

			if (!regionSlug) {
				throw new WarningMessage(await this.i18n.t("REGION.UNKNOWN"));
			}

			const date = getDateFromRelativeTime(time);
			const seconds = moment(date).diff(moment(), "seconds");
			const days = moment(date).diff(moment(), "days");

			if (seconds < 10) {
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.RESERVE.INVALID_TIME"));
			}

			if (seconds < 600) {
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.RESERVE.TOO_SHORT_TIME"));
			}

			if (days !== 0) {
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.RESERVE.TOO_LONG_TIME"));
			}

			bookingOptions.region = regionSlug;
			bookingOptions.reserveAt = date.toDate();
			if (await this.bookingService.validateBookRequest(bookingOptions)) {
				await this.bookingService.createBooking(bookingOptions);
			}

			return;
		}

		throw new WarningMessage(await this.i18n.t("COMMAND.USER.RESERVE.USAGE"));
	}

	@OnUserCommand("unreserve")
	@MessageFilter()
	async userUnreserve(message: Message): Promise<void> {
		await this.bookingService.cancelReservation(message.author);
		await this.messageService.replyMessageI18n(message, MessageType.SUCCESS, "COMMAND.USER.UNRESERVE.CANCELLED");
	}

	@OnUserCommand("status")
	@MessageFilter()
	async userStatus(message: Message): Promise<void> {
		await this.bookingService.sendBookingStatus(message);
	}

	@OnAdminCommand("book")
	@MessageFilter()
	async adminBook(message: Message): Promise<void> {
		const args = parseMessageArgs(message);
		const bookingOptions: BookingOptions = {
			message,
			region: null,
			bookingFor: null,
			bookingBy: message.member,
			tier: "free"
		}

		if (args.length === 2) {
			args.push("free");
		}

		// 3 args are given
		// user, region, tier
		if (args.length === 3) {
			const [ user, region, tier ] = args;
			const member = await parseUserArg(this.bot, message, 0);

			if (!member) {
				throw new ErrorMessage(await this.i18n.t("COMMAND.ADMIN.BOOK.USER_NOT_FOUND"));
			}

			if (member.user.bot) {
				throw new ErrorMessage(await this.i18n.t("COMMAND.ADMIN.BOOK.USER_IS_BOT"));
			}

			const regionSlug = this.bookingService.getRegionSlug(region);
			if (!this.bookingService.isTierValid(regionSlug, tier)) {
				throw new ErrorMessage(await this.i18n.t("TIER.UNKNOWN"));
			}

			if (region && member) {
				bookingOptions.region = regionSlug;
				bookingOptions.bookingFor = member;
				bookingOptions.tier = tier;
				if (await this.bookingAdminService.validateBookRequest(bookingOptions)) {
					await this.messageService.replyMessageI18n(
						message, MessageType.SUCCESS, await this.i18n.t("BOOKING.ADMIN.STARTING", {
							args: { user: member.user.tag }
						}));
					return await this.bookingService.createBooking(bookingOptions);
				}
			}
		}

		throw new WarningMessage(await this.i18n.t("COMMAND.ADMIN.BOOK.USAGE"));
	}

	@OnAdminCommand("unbook")
	@MessageFilter()
	async adminUnbook(message: Message): Promise<void> {
		const args = parseMessageArgs(message);

		// 1 arg is given
		// user
		if (args.length === 1) {
			const member: GuildMember = await parseUserArg(this.bot,message, 0);

			if (!member) {
				throw new ErrorMessage(await this.i18n.t("COMMAND.ADMIN.UNBOOK.USER_NOT_FOUND"));
			}

			if (member.user.bot) {
				throw new ErrorMessage(await this.i18n.t("COMMAND.ADMIN.UNBOOK.BOT_HAS_NO_BOOKING"));
			}

			return await this.bookingService.destroyUserBooking(member.user, { forSomeoneElse: true });
		}

		throw new WarningMessage(await this.i18n.t("COMMAND.ADMIN.UNBOOK.USAGE"));
	}

	@OnAdminCommand("status")
	@MessageFilter()
	async adminStatus(message: Message): Promise<void> {
		const args = parseMessageArgs(message);

		// No args given
		if (args.length === 0)
			await this.bookingAdminService.sendStatus(message);
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
}