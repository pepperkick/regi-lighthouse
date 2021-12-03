import * as config from "../config.json";
import * as moment from "moment";
import axios from "axios";
import Rcon from 'rcon-ts';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GuildMember, Message, TextChannel, User } from "discord.js";
import { I18nService } from "nestjs-i18n";
import { WarningMessage } from "./objects/message.exception";
import { Model } from "mongoose";
import { InjectModel } from "@nestjs/mongoose";
import { Booking } from "./booking.model";
import { BOOKING_ACTIVE_STATUS_CONDITION, BookingStatus } from "./objects/booking-status.enum";
import { MessageService } from "./message.service";
import { DiscordClient } from "discord-nestjs";
import { MessageType } from "./objects/message-types.enum";
import { ServerStatus } from "./objects/server-status.enum";
import { Server } from "./objects/server.interface";
import { BookingOptions, RequestOptions } from "./objects/booking.interface";
import { Regions, Region, RegionTier } from "./objects/region.interface";
import { getDateFormattedRelativeTime } from "./utils";
import { Game } from "./objects/game.enum";

@Injectable()
export class BookingService {
	regionSet = {}
	defaultRegion = ""
	private readonly logger = new Logger(BookingService.name);

	constructor(
		@InjectModel(Booking.name)
		private readonly Booking: Model<Booking>,
		private readonly messageService: MessageService,
		private readonly bot: DiscordClient,
		private readonly i18n: I18nService
	) {
		const regions = config.regions;
		for (const index in regions) {
			if (!regions.hasOwnProperty(index)) continue;

			if (regions[index].default)
				this.defaultRegion = index;

			this.regionSet[index] = index;
			for (const i of regions[index].alias) {
				this.regionSet[i] = index;
			}
		}

		setInterval(async () => {
			await this.monitor();
		}, 30000)
	}

	/**
	 * Get booking by ID
	 */
	async getById(id: string): Promise<Booking> {
		try {
			return await this.Booking.findById(id);
		} catch (error) {
			this.logger.error(`Failed to find booking with ID '${id}'`, error)
			throw new NotFoundException(`No booking found with ID '${id}'`)
		}
	}

	/**
	 * Get all active bookings
	 */
	async getActiveBookings(): Promise<Booking[]> {
		return this.Booking.find({ $or: BOOKING_ACTIVE_STATUS_CONDITION });
	}

	/**
	 * Get user's active bookings
	 */
	async getActiveUserBookings(user: string): Promise<Booking[]> {
		return this.Booking.find(
			{ bookingFor: user, $or: BOOKING_ACTIVE_STATUS_CONDITION });
	}

	/**
	 * Get a region active bookings
	 */
	async getActiveRegionBookings(region: string): Promise<Booking[]> {
		return this.Booking.find(
			{ region, $or: BOOKING_ACTIVE_STATUS_CONDITION });
	}

	/**
	 * Get a region and tier active bookings
	 */
	async getActiveRegionTierBookings(region: string, tier: string): Promise<Booking[]> {
		return this.Booking.find(
			{ region, tier, $or: BOOKING_ACTIVE_STATUS_CONDITION });
	}

	/**
	 * Get user's running bookings
	 */
	async getUserRunningBookings(user: string): Promise<Booking[]> {
		return this.Booking.find(
			{ bookingFor: user, status: BookingStatus.RUNNING });
	}

	/**
	 * Send a server close request to lighthouse
	 */
	static async getServerInfo(id: string): Promise<Server> {
		const res = await axios.get(`${config.lighthouse.host}/api/v1/servers/${id}`, {
			headers: {
				"Authorization": `Bearer ${config.lighthouse.clientSecret}`
			}
		});
		return res.data;
	}

	/**
	 * Send a server creation request to lighthouse
	 */
	static async sendServerCreateRequest(options: Server): Promise<any> {
		options.data.callbackUrl = `${config.localhost}/booking/callback`;
		const res = await axios.post(`${config.lighthouse.host}/api/v1/servers`, options, {
			headers: {
				"Authorization": `Bearer ${config.lighthouse.clientSecret}`
			}
		});
		return res.data;
	}

	/**
	 * Send a server close request to lighthouse
	 */
	static async sendServerCloseRequest(id: string): Promise<any> {
		const res = await axios.delete(`${config.lighthouse.host}/api/v1/servers/${id}`, {
			headers: {
				"Authorization": `Bearer ${config.lighthouse.clientSecret}`
			}
		});
		return res.data;
	}

	/**
	 * Send rcon command to server
	 */
	static async sendRconCommandRequest(booking: Booking, command: string): Promise<string> {
		const server = await BookingService.getServerInfo(booking.server);
		const { ip, port } = server;
		const { rconPassword } = server.data
		const rcon = new Rcon({
			host: ip,
			port: port,
			password: rconPassword,
			timeout: 5000
		});
		await rcon.connect();
		const res = await rcon.send(command);
		await rcon.disconnect();
		return res;
	}

	/**
	 * Validate the book request
	 *
	 * @param options
	 */
	async validateBookRequest(options: BookingOptions): Promise<boolean> {
		const { region, tier } = options

		// Check if the user already has booking
		const userBookings = await this.getActiveUserBookings(options.bookingFor.id);
		if (userBookings.length !== 0)
			throw new WarningMessage(await this.i18n.t("BOOKING.ALREADY_EXISTS"));

		// Check if the user already has reservations
		const userReservations = await this.getUserReservations(options.bookingFor.id);
		if (userReservations.length !== 0)
			throw new WarningMessage(await this.i18n.t("BOOKING.RESERVATION_ALREADY_EXISTS"));

		const regionConfig = this.getRegionConfig(region);

		// Check if the user has access to the region
		if (!this.canUserAccessRegion(region, options.bookingBy))
			throw new WarningMessage(await this.i18n.t("REGION.RESTRICTED",
				{ args: { region: regionConfig.name } }));

		// Check if region has reached the limits
		if (! await this.isRegionTierAvailable(region, tier))
			throw new WarningMessage(await this.i18n.t("BOOKING.REACHED_LIMIT",
				{ args: { region: regionConfig.name } }));

		const tierConfig = this.getTierConfig(region, tier);

		if (options.reserveAt && !tierConfig.allowReservation) {
			throw new WarningMessage(await this.i18n.t("BOOKING.RESERVE.NOT_ALLOWED"));
		}

		return true;
	}

	/**
	 * Validate the book request
	 *
	 * @param booking
	 * @param options
	 */
	async validateUnbookRequest(booking: Booking, options: { forSomeoneElse?: boolean, bookingId?: string	}): Promise<boolean> {
		const user = await this.bot.users.fetch(booking.bookingFor);

		// Check if a booking is ongoing
		if (booking.status === BookingStatus.STARTING) {
			if (!options?.forSomeoneElse)
				throw new WarningMessage(await this.i18n.t("BOOKING.ONGOING"));
			else
				throw new WarningMessage(
					await this.i18n.t("BOOKING.ADMIN.ONGOING", { args: { user: user.tag }})
				);
		}

		return true;
	}

	/**
	 * Create a new booking
	 *
	 * @param options
	 * */
	async createBooking(options: BookingOptions) {
		const { message, region, tier } = options
		const tierConfig = this.getTierConfig(region, tier);

		this.logger.log(`Received booking request from ${options.bookingBy.id} (${options.bookingBy.user.tag}) for ${options.bookingFor.id} (${options.bookingFor.user.tag}) at region ${region} (${tier})`);

		if (options.reserveAt) {
			// Create booking object
			const booking = new this.Booking({
				tier, region,
				createdAt: new Date(),
				bookingFor: options.bookingFor.id,
				bookingBy: options.bookingBy.id,
				status: BookingStatus.RESERVED
			});
			booking.reservedAt = options.reserveAt;
			await booking.save();

			// Send a status message for booking reservation
			const userChannel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
			const text = getDateFormattedRelativeTime(options.reserveAt);
			await this.messageService.sendMessage(
				userChannel, options.bookingFor, MessageType.INFO,
				await this.i18n.t("BOOKING.RESERVE.CREATED", {
					args: { time: text }
				}))

			return;
		}

		// Send a status message for booking
		const userChannel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
		const statusMessage = await this.messageService.sendMessage(
			userChannel, options.bookingFor, MessageType.INFO,
			await this.i18n.t("BOOKING.STARTING"))
		const provider = tierConfig.provider;
		const serverRequest: Server = {
			game: config.game, region, provider,
			data: {
				sdrEnable: tierConfig.sdrEnable || false,
				closeMinPlayers: tierConfig.minPlayers || 2,
				closeIdleTime: tierConfig.idleTime || 900,
				closeWaitTime: tierConfig.waitTime || 300
			}
		}

		this.logger.debug(`Server request object: ${JSON.stringify(serverRequest, null, 2)}`)

		try {
			// Send request for booking
			const server = await BookingService.sendServerCreateRequest(serverRequest);

			// Create booking object
			const booking = new this.Booking({
				tier, region,
				createdAt: new Date(),
				bookingFor: options.bookingFor.id,
				bookingBy: options.bookingBy.id,
				status: BookingStatus.STARTING,
				server: server._id
			});
			booking.messages = {
				start: {
					id: statusMessage.id,
					channel: statusMessage.channel.id
				}
			};
			await booking.save();
		} catch (error) {
			this.logger.error("Failed to send server request", error);
			this.logger.error(`${JSON.stringify(error.response?.data, null, 2)}`);

			// Provider has reached the limit
			if (error.response?.status === 429) {
				await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.PROVIDER_OVERLOADED");
				return;
			}

			await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.START_FAILED");
		}
	}

	/**
	 * Close a user's booking
	 *
	 * @param user
	 * @param options
	 */
	async destroyUserBooking(user: User, options?: { forSomeoneElse?: boolean, bookingId?: string }) {
		this.logger.log(`Received user closing request from ${user.id}`);

		// Check if the user already has booking
		const userBookings = await this.getActiveUserBookings(user.id);
		if (userBookings.length === 0) {
			if (!options?.forSomeoneElse)
				throw new WarningMessage(await this.i18n.t("COMMAND.USER.UNBOOK.NO_BOOKING"));
			else
				throw new WarningMessage(
					await this.i18n.t("COMMAND.ADMIN.BOOK.USER_HAS_NO_BOOKING", { args: { user: user.tag } })
				);
		}
		else if (userBookings.length === 1) {
			const booking = userBookings[0];
			if (await this.validateUnbookRequest(booking, options)) {
				return this.destroyBooking(booking);
			}
		}
	}

	/**
	 * Close a booking
	 *
	 * @param booking
	 */
	async destroyBooking(booking: Booking) {
		const user = await this.bot.users.fetch(booking.bookingFor);

		// Send a status message for Closing
		const userChannel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
		const statusMessage = await this.messageService.sendMessage(
			userChannel, user, MessageType.INFO,
			await this.i18n.t("BOOKING.STOPPING"));

		try {
			await BookingService.sendServerCloseRequest(booking.server);
			booking.status = BookingStatus.CLOSING;
			booking.messages = {
				close: {
					id: statusMessage.id,
					channel: statusMessage.channel.id
				}
			};
			await booking.save();
		} catch (error) {
			this.logger.error("Failed to send server request", error);

			// Server has been already closed
			if (error.response.status === 450) {
				booking.status = ServerStatus.CLOSED;
				await booking.save();
				await this.messageService.editMessageI18n(
					statusMessage, MessageType.SUCCESS, "BOOKING.STOP_SUCCESS");
				return;
			}

			await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.STOP_FAILED");
		}
	}

	/**
	 * Send booking details
	 *
	 * @param user
	 * @param options
	 */
	async sendBookingDetails(user: User, options?: { noStatusMessage: boolean }) {
		// Check if the user already has booking
		const userBookings = await this.getActiveUserBookings(user.id)

		if (userBookings.length === 0)
			throw new WarningMessage(await this.i18n.t("COMMAND.USER.RESEND.NO_BOOKING"));
		else if (userBookings.length === 1) {
			if (userBookings[0].status === BookingStatus.STARTING) {
				throw new WarningMessage(await this.i18n.t("BOOKING.NO_DETAILS_DURING_STARTING"));
			}

			const server = await BookingService.getServerInfo(userBookings[0].server);
			await this.sendServerDetailsViaDM(user, server, options);
		}
	}

	/**
	 * Send booking details
	 *
	 * @param message
	 * @param filter
	 */
	async sendBookingStatus(message: Message, filter: string = undefined) {
		const embed = MessageService.buildTextMessage(MessageType.INFO, "", "Status");
		const regions = config.regions;

		// Get user's booking if they have it
		const userBookings = await this.getActiveUserBookings(message.author.id);
		if (userBookings.length !== 0) {
			embed.setDescription(`You currently have an active booking at ${regions[userBookings[0].region].name}`);
		}

		// Get user's reservation if they have it
		const userReservations = await this.getUserReservations(message.author.id);
		if (userReservations.length !== 0) {
			const text = getDateFormattedRelativeTime(userReservations[0].reservedAt);
			embed.setDescription(`You currently have a scheduled reservation at ${regions[userReservations[0].region].name} in ${text || "1 min"}`);
		}

		embed.setFooter(`[F]: Free [P]: Premium\n[R]: Reservation Allowed\n${embed.footer.text}`);

		// Get active bookings
		const bookings = await this.getActiveBookings()

		if (bookings.length !== 0)
			embed.addField("Active", bookings.length)

		const keys = Object.keys(regions);
		let filteredRegions = [];

		if (filter) {
			for (const i of keys) {
				const region: Region = regions[i];
				const tags = region.tags;

				if (tags?.includes(filter.toLowerCase())) {
					filteredRegions.push(i);
				}
			}
		} else {
			filteredRegions = keys
		}

		if (filteredRegions.length === 0) {
			embed.addField("No region found", "Could not find any region with that tag. Please try something else.", true);
			return await message.reply("", embed);
		}

		const orderedRegions = filteredRegions.sort();
		for (const i of orderedRegions) {
			const region: Region = regions[i];
			if (region.hidden) continue;

			const tiers = region.tiers;
			const orderedTiers = Object.keys(tiers).sort();
			const regionBookings = bookings.filter(booking => booking.region === i);

			let status = ``;

			status += `\`${i}\``;
			for (const alias of region.alias) {
				status += ` \`${alias}\``;
			}
			status += "\n";

			for (const t of orderedTiers) {
				const tier = tiers[t];
				if (tier.limit === 0) continue;

				const tierBookings = regionBookings.filter(booking => booking.tier === t);
				let name = `${t.charAt(0).toUpperCase()}`

				if (t.includes("premium")) {
					name += `${t.split("premium")[1]}`;
				} else if (t.includes("free")) {
					name += `${t.split("free")[1]}`;
				} else if (t.includes("staff")) {
					name += `${t.split("staff")[1]}`;
				}

				status += `${name}: ${tierBookings.length} / ${tier.limit}`;
				if (tier.allowReservation) status += " [R]";
				status += "\n";
			}

			embed.addField(region.name, status, true);
		}

		await message.reply("", embed);
	}

	/**
	 * Handle server status changes
	 *
	 * @param server
	 * @param status
	 */
	async handleServerStatusChange(server: Server, status: ServerStatus) {
		this.logger.log(`Received server (${server._id}) status (${status}) update callback.`);

		const booking = await this.Booking.findOne({ server: server._id });

		if (!booking)
			throw new NotFoundException();

		if (status === ServerStatus.IDLE && booking.status === BookingStatus.RUNNING)
			return;

		if (status === ServerStatus.IDLE && booking.status === BookingStatus.STARTING) {
			booking.status = BookingStatus.RUNNING;
			await booking.save();
		} else if (status === ServerStatus.CLOSED) {
			booking.status = BookingStatus.CLOSED;
			await booking.save();
		} else if (status === ServerStatus.FAILED) {
			booking.status = BookingStatus.CLOSED;
			await booking.save();
		}

		if ([ ServerStatus.CLOSED, ServerStatus.IDLE, ServerStatus.FAILED ].includes(status)) {
			let statusMessage, message;

			if (status === ServerStatus.IDLE) {
				message = booking.messages.start;
			} else if (status === ServerStatus.CLOSED) {
				message = booking.messages.close;
			} else if (status === ServerStatus.FAILED) {
				message = booking.messages?.start || booking.messages?.close || undefined;
			}

			const user = await this.bot.users.fetch(booking.bookingFor);

			if (!message || !message.id) {
				const channel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
				statusMessage = await channel.send(user, {});
			} else {
				const channel = await this.bot.channels.fetch(message.channel) as TextChannel;
				statusMessage = await channel.messages.fetch(message.id);
			}

			if (status === ServerStatus.IDLE) {
				await this.sendServerDetailsViaDM(user, server, { statusMessage });
				await this.messageService.editMessageI18n(statusMessage, MessageType.SUCCESS, "BOOKING.START_SUCCESS");

				// Workaround: Set logstf API key to kaiend for binarylane to fix logs not uploading issue.
				// Send a RCON command if game is tf2-comp and server provider contains "binarylane"
				if (server.game === Game.TF2_COMP && server.provider.includes("binarylane")) {
					const rcon = new Rcon({
						host: server.ip,
						port: server.port,
						password: server.data.rconPassword,
					});
					await rcon.connect();
					await rcon.send('logstf_api_url "http://dev.api.qixalite.com/services/logstf"');
					await rcon.disconnect();
				}
			} else if (status === ServerStatus.CLOSED) {
				await this.messageService.editMessageI18n(statusMessage, MessageType.SUCCESS, "BOOKING.STOP_SUCCESS");
			} else if (status === ServerStatus.FAILED) {
				await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.SERVER_FAILED");
			}
		}
	}

	async cancelReservation(user: User) {
		const reservations = await this.getUserReservations(user.id);

		if (reservations.length === 0) {
			throw new WarningMessage(await this.i18n.t("COMMAND.USER.UNRESERVE.USER_HAS_NO_RESERVATION"))
		}
		else if (reservations.length === 1) {
			const reservation = reservations[0];
			reservation.status = BookingStatus.CLOSED;
			await reservation.save();
		}
	}

	/**
	 * Monitor reservations to process them
	 */
	async monitor() {
		const bookingReservations = await this.Booking.find({ status: BookingStatus.RESERVED });

		for (const booking of bookingReservations) {
			const tierConfig = this.getTierConfig(booking.region, booking.tier);
			const earlyStart = tierConfig.earlyStart || 0;
			const reserve = moment(booking.reservedAt).subtract(earlyStart, "seconds").toDate();
			const current = moment().toDate();

			if (current > reserve) {
				this.logger.log(`Processing reservation ${booking.id}`);

				// Set status so it is not processed again
				booking.status = BookingStatus.RESERVING;
				await booking.save();

				// Send request for server
				const provider = tierConfig.provider;
				const server = await BookingService.sendServerCreateRequest({
					game: config.game,
					region: booking.region,
					provider,
					data: {
						sdrEnable: tierConfig.sdrEnable || false,
						closeMinPlayers: tierConfig.minPlayers || 2,
						closeIdleTime: tierConfig.idleTime || 900,
						closeWaitTime: tierConfig.waitTime || 300
					}
				});

				// Send a status message for booking
				const userChannel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
				const user = await this.bot.users.fetch(booking.bookingFor);
				const statusMessage = await this.messageService.sendMessage(
					userChannel, user, MessageType.INFO,
					await this.i18n.t("BOOKING.STARTING"))

				booking.messages = {
					start: {
						id: statusMessage.id,
						channel: statusMessage.channel.id
					}
				};
				booking.status = BookingStatus.STARTING;
				booking.server = server._id;
				await booking.save();
			}
		}
	}

	/**
	 * Return the regions
	 *
	 * Process each region and tier to find inUse count
	 */
	async getRegions(region: string): Promise<Regions> {
		const regions = config.regions;
		const outputRegions = {}
		const activeBookings = await this.getActiveBookings();
		let keys = Object.keys(regions);

		if (region !== "") {
			keys = [ region ];
		}

		for (const i of keys) {
			const region: Region = regions[i];

			if (!region)
				continue

			const regionBookings = activeBookings.filter(booking => booking.region === i);
			const tiers = region.tiers
			const tierKeys = Object.keys(tiers)

			for (const t of tierKeys) {
				const tierBookings = regionBookings.filter(booking => booking.tier === t);
				regions[i].tiers[t].inUse = tierBookings.length
				outputRegions[i] = regions[i]
			}
		}

		if (Object.keys(outputRegions).length === 0) {
			throw new NotFoundException(`No region found with key '${keys}'`)
		}

		return outputRegions;
	}

	/**
	 * Return the region slug
	 *
	 * @param region
	 */
	getRegionSlug(region: string): string {
		return this.regionSet[region];
	}

	/**
	 * Return the region config
	 *
	 * @param region
	 */
	getRegionConfig(region: string): Region {
		return config.regions[this.getRegionSlug(region)];
	}

	/**
	 * Return the region config
	 *
	 * @param region
	 */
	getRegionName(region: string): string {
		return this.getRegionConfig(region)?.name;
	}

	/**
	 * Check if region slug is valid
	 *
	 * @param region
	 */
	isRegionValid(region: string): boolean {
		return !!this.getRegionSlug(region);
	}

	/**
	 * Check if tier is valid
	 *
	 * @param region
	 * @param tier
	 */
	getTierConfig(region: string, tier: string): RegionTier {
		return this.getRegionConfig(region)?.tiers[tier];
	}

	/**
	 * Check if tier is valid
	 *
	 * @param region
	 * @param tier
	 */
	isTierValid(region: string, tier: string): boolean {
		return !!this.getTierConfig(region, tier);
	}

	/**
	 * Get user's reservations
	 */
	async getUserReservations(user: string): Promise<Booking[]> {
		return this.Booking.find(
			{
				bookingFor: user, $or: [
					{ status: BookingStatus.RESERVED },
					{ status: BookingStatus.RESERVING },
				]
			});
	}

	/**
	 * Check if the region and tier has not reached booking limit
	 *
	 * @param region
	 * @param tier
	 */
	async isRegionTierAvailable(region: string, tier: string): Promise<boolean> {
		const tierConfig = this.getTierConfig(region, tier);
		const runningBookings = await this.getActiveRegionTierBookings(region, tier);
		return runningBookings.length < tierConfig.limit;
	}

	/**
	 * Check if the user has access to the region
	 *
	 * @param region
	 * @param member
	 */
	canUserAccessRegion(region: string, member: GuildMember) {
		const slug = this.regionSet[region];
		const object = config.regions[slug];

		if (object.restricted && object.restricted !== "") {
			return !!member.roles.cache.get(object.restricted);
		}

		return true;
	}

	/**
	 * Check if the user has premium tier 1 role
	 *
	 * @param member
	 */
	isUserTier1(member: GuildMember) {
		return config.roles.premium_tier_1 === "<bypass>" ? true : !!member.roles.cache.get(config.roles.premium_tier_1);

	}

	/**
	 * Check if the user has premium tier 2 role
	 *
	 * @param member
	 */
	isUserTier2(member: GuildMember) {
		return config.roles.premium_tier_2 === "<bypass>" ? true : !!member.roles.cache.get(config.roles.premium_tier_2);
	}

	/**
	 * Check if the user has premium tier 3 role
	 *
	 * @param member
	 */
	isUserTier3(member: GuildMember) {
		return config.roles.premium_tier_3 === "<bypass>" ? true : !!member.roles.cache.get(config.roles.premium_tier_3);
	}

	/**
	 * Send a DM to the user with credentials to join the server
	 * If the DM fails then the status message will be updated or new message will be sent
	 *
	 * @param member
	 * @param server
	 * @param options
	 */
	async sendServerDetailsViaDM(member: User | GuildMember, server: Server, options?: {
		statusMessage?: Message,
		noStatusMessage?: boolean
	}) {
		const user: User = member instanceof GuildMember ? member.user : member;

		try {
			await ( await user.createDM() ).send(BookingService.buildConnectMessage(server));
			if (!options.statusMessage && !options.noStatusMessage) {
				const channel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
				await this.messageService.sendMessageI18n(
					channel, user, MessageType.SUCCESS, "BOOKING.START_SUCCESS");
			}
		} catch (error) {
			if (error.message === "Cannot send messages to this user") {
				if (options.statusMessage)
					await this.messageService.editMessageI18n(
						options.statusMessage, MessageType.ERROR, "BOOKING.FAILED_TO_SEND_PRIVATE_DM");
				else {
					const channel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
					await this.messageService.sendMessageI18n(
						channel, member, MessageType.ERROR, "BOOKING.FAILED_TO_SEND_PRIVATE_DM")
				}
			} else {
				if (options.statusMessage)
					await this.messageService.editMessageI18n(
						options.statusMessage, MessageType.ERROR, "BOOKING.FAILED_TO_SEND_DM");
				else {
					const channel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
					await this.messageService.sendMessageI18n(
						channel, member, MessageType.ERROR, "BOOKING.FAILED_TO_SEND_DM")
				}
			}

			console.error(error)
		}
	}

	/**
	 * Build a connect message for the booking
	 *
	 * @param server
	 */
	private static buildConnectMessage(server: Server) {
		const connectString = `connect ${server.ip}:${server.port}; password ${server.data.password};`
		const connectRconString = `${connectString} rcon_password ${server.data.rconPassword};`
		const connectTvString = `connect ${server.ip}:${server.data.tvPort}`;
		// TODO: Needs better handling
		const hatchPort = server.port === 27015 ? 27017 : server.port + 2
		const hiveUrl = `https://hive.qixalite.com/?host=${encodeURI(server.ip)}&port=${server.port}&password=${encodeURI(server.data.rconPassword)}&hatch_port=${hatchPort}&hatch_password=${encodeURI(server.data.rconPassword)}`;

		return MessageService.buildMessageEmbed(MessageType.SUCCESS)
			.setTitle("Bookings")
			.setDescription(`Your server is ready\n**Connect String with RCON**\`\`\`${connectRconString}\`\`\`\n**Connect String**\`\`\`${connectString}\`\`\`\n**SourceTV Details**\`\`\`${connectTvString}\`\`\``)
			.addField("Password", `\`${server.data.password}\``, true)
			.addField("RCON Password", `\`${server.data.rconPassword}\``, true)
			.addField("Region", `\`${server.region}\``, true)
			.addField("Server Control", `[Click here](${hiveUrl})`, false);
	}
}
