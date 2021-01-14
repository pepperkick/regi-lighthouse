import * as moment from "moment";
import { Injectable, Logger } from "@nestjs/common";
import { BookingService } from "./booking.service";
import { Message, User } from "discord.js";
import { MessageService } from "./message.service";
import { MessageType } from "./objects/message-types.enum";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Booking } from "./booking.model";
import { BOOKING_ACTIVE_STATUS_CONDITION, BookingStatus } from "./objects/booking-status.enum";
import { DiscordClient } from "discord-nestjs";
import { ServerStatus } from "./objects/server-status.enum";
import { BookingOptions } from "./objects/booking.interface";
import { WarningMessage } from "./objects/message.exception";
import { I18nService } from "nestjs-i18n";

@Injectable()
export class BookingAdminService {
	private readonly logger = new Logger(BookingService.name);

	constructor(
		@InjectModel(Booking.name)
		private readonly Booking: Model<Booking>,
		private readonly messageService: MessageService,
		private readonly bookingService: BookingService,
		private readonly bot: DiscordClient,
		private readonly i18n: I18nService
	) {	}

	/**
	 * Validate the book request
	 *
	 * @param options
	 */
	async validateBookRequest(options: BookingOptions): Promise<boolean> {
		const { region } = options

		this.logger.log(`Validating admin booking request from ${options.bookingBy.id} for ${options.bookingFor.id} at region ${region}`);

		// Check if the user already has booking
		const userBookings = await this.bookingService.getUserBookings(options.bookingFor.id);
		if (userBookings.length !== 0)
			throw new WarningMessage(await this.i18n.t("BOOKING.ADMIN.ALREADY_EXISTS"));

		const regionConfig = this.bookingService.getRegionConfig(region);

		// Check if region has reached the limits
		if (! await this.bookingService.isRegionTierAvailable(region, options.tier))
			throw new WarningMessage(await this.i18n.t("BOOKING.REACHED_LIMIT",
				{ args: { region: regionConfig.name } }));

		return true;
	}

	/**
	 * Send status and info
	 *
	 * @param message
	 */
	async sendStatus(message: Message) {
		const embed = MessageService.buildTextMessage(MessageType.INFO, "", "Status");

		// Get all active bookings
		const bookings = await this.Booking.find(
			{ $or: BOOKING_ACTIVE_STATUS_CONDITION });

		if (bookings.length !== 0) {
			embed.addField("Active", bookings.length)

			let desc = "```";

			for (const booking of bookings) {
				const user = await this.bot.users.fetch(booking.bookingFor);
				desc += `${booking.id} (${user.tag}) [${booking.region}, ${booking.tier}]\n`;
			}

			desc += "```";

			embed.setDescription(desc);
		} else {
			embed.setDescription(await this.i18n.t("COMMAND.ADMIN.STATUS.NO_ACTIVE_BOOKINGS"));
		}

		await message.reply("", embed);
	}

	/**
	 * Send user status and info
	 *
	 * @param message
	 * @param user
	 */
	async sendUserStatus(message: Message, user: User) {
		const embed = MessageService.buildTextMessage(MessageType.INFO, "", "User Status");

		// Get all bookings by user
		const bookings = await this.Booking.find(
			{ bookingFor: user.id }).sort({ createdAt: -1 });

		if (bookings.length === 0) {
			embed.setDescription(await this.i18n.t("COMMAND.ADMIN.STATUS.USER_NO_BOOKINGS", {
				args: { user: user.tag }
			}));
			await message.reply("", embed);
			return;
		}

		embed.addField("Total Bookings", bookings.length);

		// Get all active bookings by user
		const activeBookings = await this.Booking.find(
			{ bookingFor: user.id, $or: BOOKING_ACTIVE_STATUS_CONDITION });

		if (activeBookings.length === 0) {
			let desc = await this.i18n.t("COMMAND.ADMIN.STATUS.USER_NO_ACTIVE_BOOKINGS", {
				args: { user: user.tag }
			});
			desc += "```";

			for (const booking of bookings.splice(0, 10)) {
				let	time = `${moment(booking.createdAt).fromNow()}`;
				if (booking.status === BookingStatus.RESERVED) {
					time = `${moment(booking.reservedAt).fromNow()}`;
				}

				desc += `${booking.id} [${booking.region}, ${booking.tier}${ time ? ", " + time: "" }]\n`;
			}

			desc += "```"

			embed.setDescription(desc);
		}
		else if (activeBookings.length === 1) {
			embed.setDescription(await this.getBookingStatus(activeBookings[0]));
		}
		else {
			let desc = "```";
			for (const booking of activeBookings) {
				desc += `${booking.id} [${booking.region}, ${booking.tier}]\m`;
			}
			desc += "```";

			embed.setDescription(desc);
		}

		await message.reply("", embed);
	}

	/**
	 * Send booking status
	 *
	 * @param message
	 * @param booking
	 */
	async sendBookingStatus(message: Message, booking: Booking) {
		const embed = MessageService.buildTextMessage(MessageType.INFO, "", "Booking Status");

		embed.setDescription(await this.getBookingStatus(booking));

		await message.reply("", embed);
	}

	/**
	 * Send region status
	 *
	 * @param message
	 * @param region
	 */
	async sendRegionStatus(message: Message, region: string) {
		const embed = MessageService.buildTextMessage(MessageType.INFO, "", "Region Status");
		const name = this.bookingService.getRegionName(region);

		// Get all bookings in the region
		const bookings = await this.Booking.find(
			{ region }).sort({ createdAt: -1 });

		if (bookings.length === 0) {
			embed.setDescription(await this.i18n.t("COMMAND.ADMIN.STATUS.REGION_NO_BOOKINGS", {
				args: { region: name }
			}));
			await message.reply("", embed);
			return;
		}

		embed.addField("Total Bookings", bookings.length);

		// Get all active bookings in the region
		const activeBookings = await this.Booking.find(
			{ region, $or: BOOKING_ACTIVE_STATUS_CONDITION });

		if (activeBookings.length === 0) {
			let desc = await this.i18n.t("COMMAND.ADMIN.STATUS.REGION_NO_ACTIVE_BOOKINGS", {
				args: { region: name }
			})
			desc += "```";

			for (const booking of bookings.splice(0, 10)) {
				const user = await this.bot.users.fetch(booking.bookingFor);
				desc += `${booking.id} [${booking.tier}, ${moment(booking.createdAt).fromNow()}]\n`;
			}

			desc += "```"

			embed.setDescription(desc);
		}
		else if (activeBookings.length === 1) {
			embed.setDescription(await this.getBookingStatus(activeBookings[0]));
		}
		else {
			let desc = "```";
			for (const booking of activeBookings) {
				desc += `${booking.id} [${booking.region}, ${booking.tier}]\m`;
			}
			desc += "```";

			embed.setDescription(desc);
		}

		await message.reply("", embed);
	}

	/**
	 * Get booking status string
	 *
	 * @param booking
	 */
	async getBookingStatus(booking: Booking): Promise<string> {
		let server;
		let isRunning;

		if (booking.server) {
			server = await BookingService.getServerInfo(booking.server);
			isRunning = ![
				ServerStatus.CLOSED,
				ServerStatus.CLOSING,
				ServerStatus.ALLOCATING,
				ServerStatus.WAITING,
				ServerStatus.DEALLOCATING
			].includes(server.status);
		}
		const user = await this.bot.users.fetch(booking.bookingFor);

		let text = "```";
		text += `\nBooking ID:  ${booking.id}`;

		if (server) {
			text += `\nServer ID:   ${booking.server}`;
		}

		text += `\nDiscord ID:  ${booking.bookingFor} (${user.tag})`;
		text += `\nCreated At:  ${booking.createdAt.toUTCString()}`;

		if (booking.reservedAt) {
			text += `\nReserved At: ${booking.reservedAt.toUTCString()}`;
		}

		text += `\nRegion:      ${booking.region}`;

		if (isRunning) {
			text += `\nIP:          ${server.ip}:${server.port} (${server.tvPort})`;
			text += `\nPassword:    ${server.password}`;
			text += `\nRCON:        ${server.rconPassword}`;
		}

		if (server) {
			text += `\nS. Server:   ${server.status}`;
		}

		text += `\nS. Booking:  ${booking.status}`;

		if (isRunning)
			text += `\n\nconnect ${server.ip}:${server.port}; password ${server.password}; rcon_password ${server.rconPassword}`;
		text += "```";

		return text;
	}
}