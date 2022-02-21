import * as config from "../config.json";
import * as moment from "moment";
import axios from "axios";
import Rcon from 'rcon-ts';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommandInteraction, GuildMember, Message, TextChannel, User } from "discord.js";
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
import { BookingOptions } from "./objects/booking.interface";
import { Regions, Region, RegionTier, ProviderSizes, ProviderSize } from "./objects/region.interface";
import { getDateFormattedRelativeTime } from "./utils";
import { Game } from "./objects/game.enum";
import { PreferenceService } from "./preference.service";
import { APIInteractionGuildMember } from "discord-api-types";
import { Variant } from "./objects/variant.interface";

@Injectable()
export class BookingService {
	regionSet = {}
	defaultRegion = ""
	defaultVariant = ""
	private readonly logger = new Logger(BookingService.name);

	constructor(
		@InjectModel(Booking.name)
		private readonly Booking: Model<Booking>,
		private readonly messageService: MessageService,
		private readonly bot: DiscordClient,
		private readonly i18n: I18nService,
		private readonly preference: PreferenceService
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

		const variants = config.variants;
		for (const index in variants) {
			if (!variants.hasOwnProperty(index)) continue;

			if (variants[index].default)
				this.defaultVariant = index;
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
	 * Get user's active booking
	 */
	async getActiveUserBooking(user: string): Promise<Booking> {
		return this.Booking.findOne(
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

	static async getHatchApiUrl(booking: Booking, api: string) {
		const server = await BookingService.getServerInfo(booking.server);
		const hatchPort = server.port === 27015 ? 27017 : server.port + 2
		if (api.charAt(0) === "/") api = api.slice(1)
		return `http://${server.ip}:${hatchPort}/${api}?password=${server.data.hatchPassword}`
	}

	/**
	 * Get demos file list from the server
	 */
	static async getServerDemosList(booking: Booking) {
		const url = await this.getHatchApiUrl(booking, "files/demos");
		return (await axios.get(url)).data;
	}

	/**
	 * Get logs file list from the server
	 */
	static async getServerLogsList(booking: Booking) {
		const url = await this.getHatchApiUrl(booking, "files/logs");
		return (await axios.get(url)).data;
	}

	static getGameVariantList() {
		const variants = config.variants;
		const keys = Object.keys(variants);
		const list = {}

		for (const i of keys) {
			list[variants[i].name] = i
		}

		return list;
	}

	/**
	 * Validate the book request
	 *
	 * @param options
	 */
	async validateBookRequest(options: BookingOptions): Promise<boolean> {
		const { region, tier } = options

		// Check if the user already has booking
		const userBookings = await this.getActiveUserBookings(this.getMemberId(options.bookingFor));
		if (userBookings.length !== 0)
			throw new WarningMessage(await this.i18n.t("BOOKING.ALREADY_EXISTS"));

		// Check if the user already has reservations
		const userReservations = await this.getUserReservations(this.getMemberId(options.bookingFor));
		if (userReservations.length !== 0)
			throw new WarningMessage(await this.i18n.t("BOOKING.RESERVATION_ALREADY_EXISTS"));

		const regionConfig = this.getRegionConfig(region);

		// Check if the region exists
		if (!regionConfig) {
			throw new WarningMessage(await this.i18n.t("REGION.UNKNOWN"));
		}

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
	async createBookingRequest(options: BookingOptions) {
		const { message, region, tier, variant } = options
		const tierConfig = this.getTierConfig(region, tier);
		const variantConfig = this.getVariantConfig(variant);
		const bookingBy = this.getMemberUser(options.bookingBy);
		const bookingFor = this.getMemberUser(options.bookingFor);

		this.logger.log(`Received booking request from ${bookingBy.id} (${bookingBy.username}) for ${bookingFor.id} (${bookingFor.username}) at region ${region} (${tier}) [${variant}]`);

		if (options.reserveAt) {
			// Create booking object
			const booking = new this.Booking({
				tier, region, variant,
				createdAt: new Date(),
				bookingFor: bookingFor.id,
				bookingBy: bookingBy.id,
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
		const providers = this.getProviderFromOptions(tierConfig.provider, variantConfig.providerSize);

		if (typeof providers === "string") {
			await this.createBooking(options, statusMessage, providers)
		} else if (Array.isArray(providers)) {
			for (const [i, provider] of providers.entries()) {
				if (await this.createBooking(
					options, statusMessage, provider,
					i === providers.length - 1
				))
					break;
			}
		}
	}

	getProviderFromOptions(provider: string | string[] | ProviderSizes, size: ProviderSize) {
		if (typeof provider === "string") {
			return provider
		}

		if (Array.isArray(provider)) {
			return provider
		}

		if (typeof provider === "object") {
			if (!size) {
				size = "medium"
			}

			if (typeof provider[size] === "string") {
				return provider[size]
			}

			if (Array.isArray(provider[size])) {
				return provider[size]
			}
		}
	}

	async createBooking(options: BookingOptions, statusMessage: Message, provider: string, failOnProviderOverload: boolean = true) {
		const { message, region, tier, variant } = options
		const bookingBy = this.getMemberUser(options.bookingBy);
		const bookingFor = this.getMemberUser(options.bookingFor);

		try {
			const serverRequest = await this.getDefaultServerRequest(
				bookingFor.id, region, tier, provider, variant);
			this.logger.debug(`Server request object: ${JSON.stringify(serverRequest, null, 2)}`)

			// Send request for booking
			const server = await BookingService.sendServerCreateRequest(serverRequest);

			// Create booking object
			const booking = new this.Booking({
				tier, region, variant,
				createdAt: new Date(),
				bookingFor: bookingFor.id,
				bookingBy: bookingBy.id,
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
			return true;
		} catch (error) {
			this.logger.error("Failed to send server request", error);
			this.logger.error(`${JSON.stringify(error.response?.data, null, 2)}`);

			// Provider has reached the limit
			if (error.response?.status === 429) {
				failOnProviderOverload && await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.PROVIDER_OVERLOADED");
				return false;
			}

			// Client is forbidden
			if (error.response?.status === 403) {
				await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.CLIENT_FORBIDDEN");
				return false;
			}

			await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.START_FAILED");
			return true;
		}
	}

	async updateServerRequest(server: Server, user: string, tierConfig: RegionTier, variantConfig: Variant) {
		let data;

		server.data = {
			...server.data,
			closeMinPlayers: variantConfig.minPlayers || tierConfig.minPlayers || 2,
			closeIdleTime: variantConfig.idleTime || tierConfig.idleTime || 900,
			closeWaitTime: variantConfig.waitTime || tierConfig.waitTime || 300,
			sdrEnable: false,
			password: "*",
			rconPassword: "*",
			servername: config.preferences.serverHostname,
			tvName: config.preferences.serverTvName,
			map: variantConfig.map,
			gitRepository: variantConfig.gitRepo,
			gitDeployKey: variantConfig.gitKey
		}

		const guild = await this.bot.guilds.fetch(config.guild);
		const member = await guild.members.fetch(user);

		if (this.userHasRoleFromSlug(member, config.features.settings.serverPassword)) {
			data = await this.preference.getData(user, PreferenceService.Keys.serverPassword);
			server.data.password = data === "" ? "" : !data ? "*" : data;
		}

		if (this.userHasRoleFromSlug(member, config.features.settings.serverRconPassword)) {
			data = await this.preference.getData(user, PreferenceService.Keys.serverRconPassword);
			server.data.rconPassword = data === "" ? "" : !data ? "*" : data;
		}

		if (this.userHasRoleFromSlug(member, config.features.settings.serverTf2ValveSdr)) {
			data = await this.preference.getData(user, PreferenceService.Keys.serverTf2ValveSdr);
			server.data.sdrEnable = data;
		}

		if (this.userHasRoleFromSlug(member, config.features.settings.serverHostname)) {
			data = await this.preference.getData(user, PreferenceService.Keys.serverHostname);
			server.data.servername = data;
		}

		if (this.userHasRoleFromSlug(member, config.features.settings.serverTvName)) {
			data = await this.preference.getData(user, PreferenceService.Keys.serverTvName);
			server.data.tvName = data;
		}

		data = await this.preference.getDataString(user, PreferenceService.Keys.serverMap);
		if (data) {
			server.data.map = data;
		}

		data = await this.preference.getDataString(user, PreferenceService.Keys.serverGitRepo);
		if (data) {
			server.data.gitRepository = data;
		}

		data = await this.preference.getDataString(user, PreferenceService.Keys.serverGitKey);
		if (data) {
			server.data.gitDeployKey = data;
		}

		return server
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
			} else if (error.response.status === 451) {
				await this.messageService.editMessage(
					statusMessage, MessageType.WARNING, "You server has been unbooked automatically and it is currently stopping your server. Please wait until it completes.");
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
			await this.sendServerDetailsViaDM(user, userBookings[0], server, options);
		}
	}

	getAllRegionTags() {
		const regions = config.regions;
		const keys = Object.keys(regions);
		const allTags = [];

		for (const i of keys) {
			const region: Region = regions[i];
			const tags = region.tags || [];

			if (region.hidden)
				continue

			tags.forEach(tag => allTags.includes(tag) || allTags.push(tag))
		}

		return allTags;
	}

	searchRegions(text: string) {
		const regions = config.regions;
		const keys = Object.keys(regions);
		const filter = [];

		for (const i of keys) {
			const region: Region = regions[i];
			const tags = region.tags || [];
			const match = tags.filter(tag => tag.includes(text))

			if (match.length > 0)
				filter.push({ name: region.name, value: i })
		}

		return filter;
	}

	parseRegion(arg: string) {
		const region = arg.toLowerCase();
		const regionSlug = this.getRegionSlug(region);
		const regionConfig = this.getRegionConfig(regionSlug);
		if (regionConfig) {
			return regionSlug
		}
	}

	searchTiers(region: string, text: string) {
		const tiers = this.getTierConfigs(region)
		const keys = Object.keys(tiers);
		const filter = [];

		for (const i of keys) {
			if (i.includes(text))
				filter.push({ name: i, value: i })
		}

		return filter;
	}

	/**
	 * Send booking details
	 *
	 * @param message
	 * @param filter
	 */
	async sendBookingStatus(message: Message | CommandInteraction, filter: {
		continent?: string,
		tag?: string
	} = {}) {
		let userId

		if (message instanceof Message) {
			userId = message.author.id;
		} else if (message instanceof CommandInteraction) {
			userId = message.user.id;
		}

		const embed = MessageService.buildTextMessage(MessageType.INFO, "", "Status");
		const regions = config.regions;

		// Get user's booking if they have it
		const userBookings = await this.getActiveUserBookings(userId);
		if (userBookings.length !== 0) {
			embed.setDescription(`You currently have an active booking at ${regions[userBookings[0].region].name}`);
		}

		// Get user's reservation if they have it
		const userReservations = await this.getUserReservations(userId);
		if (userReservations.length !== 0) {
			const text = getDateFormattedRelativeTime(userReservations[0].reservedAt);
			embed.setDescription(`You currently have a scheduled reservation at ${regions[userReservations[0].region].name} in ${text || "1 min"}`);
		}

		embed.setFooter(`[F]: Free [P]: Premium\n[R]: Reservation Allowed\n${embed.footer.text}`);

		// Get active bookings
		const bookings = await this.getActiveBookings()

		if (bookings.length !== 0)
			embed.addField("Active", bookings.length.toString())

		let filteredRegions = Object.keys(regions);

		if (filter.continent) {
			const keys = filteredRegions
			filteredRegions = []

			for (const i of keys) {
				const region: Region = regions[i];
				const continent = region.continent;

				if (continent === filter.continent) {
					filteredRegions.push(i);
				}
			}
		}

		if (filter.tag) {
			const keys = filteredRegions
			filteredRegions = []

			for (const i of keys) {
				const region: Region = regions[i];
				const tags = region.tags;

				if (tags?.includes(filter.tag.toLowerCase())) {
					filteredRegions.push(i);
				}
			}
		}

		if (filteredRegions.length === 0) {
			embed.addField("No region found", "Could not find any region with that tag. Please try something else.", true);

			if (message instanceof Message) {
				return await message.reply({ embeds: [embed] });
			} else if (message instanceof CommandInteraction) {
				return await message.reply({ embeds: [embed], ephemeral: true });
			}
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

		if (message instanceof Message) {
			await message.reply({ embeds: [embed] });
		} else if (message instanceof CommandInteraction) {
			await message.reply({ embeds: [embed], ephemeral: true });
		}
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
				statusMessage = await channel.send({ content: user.toString() });
			} else {
				const channel = await this.bot.channels.fetch(message.channel) as TextChannel;
				statusMessage = await channel.messages.fetch(message.id);
			}

			if (status === ServerStatus.IDLE) {
				await this.sendServerDetailsViaDM(user, booking, server, { statusMessage });
				await this.messageService.editMessageI18n(statusMessage, MessageType.SUCCESS, "BOOKING.START_SUCCESS");

				// Workaround: Set logstf API key to kaiend for binarylane to fix logs not uploading issue.
				// Send a RCON command if game is tf2-comp and server provider contains "binarylane"
				if (server.game === Game.TF2 && server.provider.includes("binarylane")) {
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
			const variantConfig = this.getVariantConfig(booking.variant);
			const earlyStart = tierConfig.earlyStart || 0;
			const reserve = moment(booking.reservedAt).subtract(earlyStart, "seconds").toDate();
			const current = moment().toDate();

			if (current > reserve) {
				// Send a status message for booking
				const userChannel = await this.bot.channels.fetch(config.channels.users) as TextChannel;
				const user = await this.bot.users.fetch(booking.bookingFor);
				const statusMessage = await this.messageService.sendMessage(
					userChannel, user, MessageType.INFO,
					await this.i18n.t("BOOKING.STARTING"))
				const providers = this.getProviderFromOptions(tierConfig.provider, variantConfig.providerSize);

				if (typeof providers === "string") {
					await this.processReservation(booking, statusMessage, providers)
				} else if (Array.isArray(providers)) {
					for (const [i, provider] of providers.entries()) {
						if (await this.processReservation(
							booking, statusMessage, provider,
							i === providers.length - 1
						))
							break;
					}
				}
			}
		}
	}

	async processReservation(booking: Booking, statusMessage: Message, provider: string, failOnProviderOverload: boolean = true) {
		this.logger.log(`Processing reservation ${booking.id}`);

		// Set status so it is not processed again
		booking.status = BookingStatus.RESERVING;
		await booking.save();

		try {
			const serverRequest = await this.getDefaultServerRequest(
				booking.bookingFor, booking.region, booking.tier, provider, booking.variant);
			this.logger.debug(`Server request object: ${JSON.stringify(serverRequest, null, 2)}`)

			// Send request for server
			const server = await BookingService.sendServerCreateRequest(serverRequest);

			booking.messages = {
				start: {
					id: statusMessage.id,
					channel: statusMessage.channel.id
				}
			};
			booking.status = BookingStatus.STARTING;
			booking.server = server._id;
			await booking.save();
			return true;
		} catch (error) {
			this.logger.error("Failed to process server reservation", error);
			this.logger.error(`${JSON.stringify(error.response?.data, null, 2)}`);

			// Provider has reached the limit
			if (error.response?.status === 429) {
				failOnProviderOverload && await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.PROVIDER_OVERLOADED");
				return false;
			}

			await this.messageService.editMessageI18n(statusMessage, MessageType.ERROR, "BOOKING.START_FAILED");
			return true;
		}
	}

	async getDefaultServerRequest(user: string, region: string, tier: string, provider: string, variant: string): Promise<Server> {
		const request = {
			game: config.game,
			region,
			provider,
			data: {}
		}

		const tierConfig = this.getTierConfig(region, tier);
		const variantConfig = this.getVariantConfig(variant);
		return this.updateServerRequest(request, user, tierConfig, variantConfig);
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
	 * Get all region tiers
	 *
	 * @param region
	 */
	getTierConfigs(region: string): { [key: string]: RegionTier } {
		return this.getRegionConfig(region)?.tiers;
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
	 * Return the variant config
	 *
	 * @param variant
	 */
	getVariantConfig(variant: string): Variant {
		return config.variants[variant];
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

	getMemberId(member: GuildMember | APIInteractionGuildMember) {
		if (member instanceof GuildMember) {
			return member.id;
		} else {
			return member.user.id;
		}
	}

	getMemberUser(member: GuildMember | APIInteractionGuildMember) {
		return member.user;
	}

	/**
	 * Check if the user has access to the region
	 *
	 * @param region
	 * @param member
	 */
	canUserAccessRegion(region: string, member: GuildMember | APIInteractionGuildMember) {
		const slug = this.regionSet[region];
		const object = config.regions[slug];

		if (object.restricted && object.restricted !== "") {
			return this.userHasRole(member, object.restricted)
		}

		return true;
	}

	/**
	 * Check if the user has a specific role
	 *
	 * @param member
	 * @param role
	 */
	userHasRole(member: GuildMember | APIInteractionGuildMember, role: string) {
		if (member instanceof GuildMember) {
			return !!member.roles.cache.get(role);
		} else {
			return member.roles?.includes(role);
		}
	}

	/**
	 * Check if the user has a specific role
	 *
	 * @param member
	 * @param access Simplified premium role strings or role ID, example: T1, T23, T13, T123, T1|<ID>
	 */
	userHasRoleFromSlug(member: GuildMember | APIInteractionGuildMember, access: boolean | string) {
		if (typeof access === "boolean") {
			return access;
		}

		if (access.includes("|")) {
			const parts = access.split("|")
			for (const part of parts) {
				if (this.userHasRoleFromSlug(member, part))
					return true;
			}
		}

		if (access.charAt(0) === "F") {
			return true;
		}

		if (access.charAt(0) !== "T") {
			return this.userHasRole(member, access);
		}

		access = access.substring(1);

		let i = access.length;
		while (i--) {
			switch(access.charAt(i)) {
				case "1":
					if (this.isUserTier1(member))
						return true;
					break;
				case "2":
					if (this.isUserTier2(member))
						return true;
					break;
				case "3":
					if (this.isUserTier3(member))
						return true;
					break;
			}
		}
	}

	/**
	 * Check if the user has premium tier 1 role
	 *
	 * @param member
	 */
	isUserTier1(member: GuildMember | APIInteractionGuildMember) {
		return config.roles.premium_tier_1 === "<bypass>" ? true : this.userHasRole(member, config.roles.premium_tier_1);

	}

	/**
	 * Check if the user has premium tier 2 role
	 *
	 * @param member
	 */
	isUserTier2(member: GuildMember | APIInteractionGuildMember) {
		return config.roles.premium_tier_2 === "<bypass>" ? true : this.userHasRole(member, config.roles.premium_tier_2);
	}

	/**
	 * Check if the user has premium tier 3 role
	 *
	 * @param member
	 */
	isUserTier3(member: GuildMember | APIInteractionGuildMember) {
		return config.roles.premium_tier_3 === "<bypass>" ? true : this.userHasRole(member, config.roles.premium_tier_3);
	}

	/**
	 * Send a DM to the user with credentials to join the server
	 * If the DM fails then the status message will be updated or new message will be sent
	 *
	 * @param member
	 * @param booking
	 * @param server
	 * @param options
	 */
	async sendServerDetailsViaDM(member: User | GuildMember, booking: Booking, server: Server, options?: {
		statusMessage?: Message,
		noStatusMessage?: boolean
	}) {
		const user: User = member instanceof GuildMember ? member.user : member;

		try {
			await ( await user.createDM() )
				.send({ embeds: [ BookingService.buildConnectMessage(booking, server) ] });

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
	 * @param booking
	 * @param server
	 */
	private static buildConnectMessage(booking: Booking, server: Server) {
		let connectString = "";
		if (server.data.sdrEnable) {
			connectString += `connect ${server.data.sdrIp}:${server.data.sdrPort};`
		} else {
			connectString += `connect ${server.ip}:${server.port};`
		}
		if (server.data.password) {
			connectString += ` password "${server.data.password}";`
		}

		let connectRconString = `${connectString}`
		let rconString = ``;
		if (server.data.sdrEnable) {
			rconString = `rcon_address ""; rcon_address ${server.ip}:${server.port};`
			connectRconString += ` ${rconString}`
		}
		if (server.data.rconPassword) {
			connectRconString += ` rcon_password "${server.data.rconPassword}";`
		}

		let connectTvString = ``;
		if (server.data.sdrEnable) {
			connectTvString += `connect ${server.data.sdrIp}:${server.data.sdrTvPort};`
		} else {
			connectTvString += `connect ${server.ip}:${server.data.tvPort};`
		}
		if (server.data.tvPassword) {
			connectTvString += ` rcon_password "${server.data.tvPassword}";`
		}

		const hatchPort = server.port === 27015 ? 27017 : server.port + 2
		const hiveUrl = `https://hive.qixalite.com/?host=${encodeURI(server.ip)}&port=${server.port}&password=${encodeURI(server.data.rconPassword)}&hatch_port=${hatchPort}&hatch_password=${encodeURI(server.data.rconPassword)}`;
		let description = `Your server is ready\n**Connect String with RCON**\`\`\`${connectRconString}\`\`\`\n**Connect String**\`\`\`${connectString}\`\`\`\n**SourceTV Details**\`\`\`${connectTvString}\`\`\``

		if (server.data.sdrEnable) {
			description += `\nIf you are unable to execute RCON commands in the server then use the following commands.\`\`\`${rconString}\`\`\``
		}

		const message = MessageService.buildMessageEmbed(MessageType.SUCCESS)
			.setTitle("Bookings")
			.setDescription(description)
			.addField("Region", `\`${server.region}\``, true)
			.addField("Variant", `\`${booking.variant}\``, true)
			.addField("Server Control", `[Click here](${hiveUrl})`, false);

		if (server.data.sdrEnable) {
			message.addField("Original IP", `Do not share this unless you have connection issues\n\`${server.ip}:${server.port}\``)
		}

		if (config.preferences.tnts && config.preferences.tnts.length > 0) {
			const tnts = config.preferences.tnts;
			const item = tnts[Math.floor(Math.random()*tnts.length)];
			message.addField(item.header, `\`\`\`${item.message}\`\`\``);
		}

		return message;
	}
}
