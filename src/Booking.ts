import { DiscordBotModule, BotCommand, BotEvent, DiscordEvents } from "kennex";
import { Message, User, MessageEmbed, Client, TextChannel } from "discord.js";
import request from "request-promise";
import Express from "express";
import { I18n } from "i18n";
import * as bodyParser from "body-parser";
import { BookingDTO } from "./dto/booking.dto";
import { BookingStatusDTO } from "./dto/booking-status.dto";
import config from "../config.json";

enum MessageType {
	SUCCESS, INFO, WARNING, ERROR
}

@DiscordBotModule("booking")
export class BookingModule {
	client?: Client;
	express: Express.Application;

	constructor(private i18n: I18n) {
		this.express = Express();
		this.express.use(bodyParser.json());
		this.express.listen(config.express.port, () => {
			console.log(`Express server running at ${config.express.port}`)
		});

		this.attachRoutes();
		// this.monitor();
	}

	@BotEvent(DiscordEvents.Ready)
	ready(bot: Client) {
		this.client = bot
		console.log("Ready")
	}

	@BotCommand("book")
	async book(msg: Message) {
		if (this.validateBookingChannel(msg)) {
			await this.handleUserBooking(msg.author, msg);
		} else if (this.validateAdminChannel(msg)) {
			await this.handleAdminBooking(msg);
		}
	}

	@BotCommand("unbook")
	async unbook(msg: Message) {
		if (this.validateBookingChannel(msg)) {
			await this.handleUserUnbooking(msg);
		} else if (this.validateAdminChannel(msg)) {
			await this.handleAdminUnbooking(msg);
		}
	}

	@BotCommand("status")
	async status(msg: Message) {
		if (this.validateBookingChannel(msg)) {
			await this.handleUserStatus(msg);
		} else if (this.validateAdminChannel(msg)) {
			await this.handleAdminStatus(msg);
		}
	}

	@BotCommand("help")
	async help(msg: Message) {
		// if (!this.validateBookingChannel(msg)) return;
		// if (!this.config || !this.config.bookingHelpCommands) return;

		// const embed = this.buildMessageEmbed(MessageType.INFO)
		//   .setTitle("Help Section")
		//   .setDescription(`Use this commands in game through the console.`);

		// for (let key in this.config.bookingHelpCommands) {
		//   const value = this.config.bookingHelpCommands[key].join("\n");
		//   embed.addField(key, value, true)
		// }

		// await msg.reply(embed);
	}

	/**
	 * Check if discord message came from booking channel
	 *
	 * @param msg DiscordMessage
	 */
	private validateBookingChannel(msg: Message) {
		return msg.channel.id === config.channels.booking;
	}

	/**
	 * Check if discord message came from admin channel
	 *
	 * @param msg DiscordMessage
	 */
	private validateAdminChannel(msg: Message) {
		return msg.channel.id === config.channels.admin;
	}

	/**
	 * Send a booking request to server
	 *
	 * @param user Discord User
	 * @param bookedBy Discord User
	 * @param selectors Provider selectors
	 * @param msg Discord Message for status updates
	 */
	private async sendBookRequest(user: User, bookedBy: User, selectors: {}, msg: Message): Promise<BookingDTO> {
		return request({
			method: 'POST',
			uri: `${config.lighthouseHost}/booking`,
			body: {
				id: `${user.id}`,
				bookedBy: `${bookedBy.id}`,
				callbackUrl: `${config.express.host}:${config.express.port}/booking/callback/${user.id}`,
				metadata: {
					name: `${user.tag}`,
					message: {
						id: msg.id,
						channel: msg.channel.id
					}
				},
				selectors
			},
			json: true
		});
	}


	/**
	 * Book server
	 *
	 * @param user Discord User who the booking is for
	 * @param bookedBy Discord User who initiated the booking, can be same as user param if self initiated
	 * @param selectors Provider selectors
	 */
	private async bookServer(user: User, bookedBy: User, selectors: {}) {
		const chl = await this.client?.channels.fetch(config.channels.booking) as TextChannel;
		const message = await chl.send(user,
			this.buildTextMessage(MessageType.INFO, this.i18n.__("Booking Start")));
		try {
			await this.sendBookRequest(user, bookedBy, selectors, message);

			console.log(`Book request sent for ${this.userInfo(user)}, Booked by ${this.userInfo(bookedBy)}`);
		} catch (error) {
			if (error.statusCode === 409) {
				await message.edit(user,
					this.buildTextMessage(MessageType.WARNING, this.i18n.__("Booking Already Exists")))
			} else if (error.statusCode && error.statusCode === 429) {
				await message.edit(user,
					this.buildTextMessage(MessageType.WARNING, this.i18n.__("Booking Limit Reached")))
			} else {
				await message.edit(user,
					this.buildTextMessage(MessageType.ERROR, this.i18n.__("Booking Failed")));

				console.log(error);
			}

			console.log(`Failed to book server for ${this.userInfo(user)} due to ${error}`);
		}
	}

	/**
	 * Get region name from region message
	 *
	 * @param region Region str
	 */
	private getBookingRegion(region: string) {
		switch(region.toLowerCase()) {
			case "syd":
			case "sydney":
				return "sydney";
			case "mel":
			case "melbourne":
				return "melbourne";
			case "blr":
			case "bangalore":
				return "bangalore";
			case "pune":
				return "pune";
			case "sg":
			case "singapore":
				return "singapore";
			case "hk":
			case "hongkong":
			case "hong-kong":
				return "hong-kong";
			case "se":
			case "seoul":
				return "seoul";
			case "tw":
			case "taiwan":
				return "taiwan";
			case "tk":
			case "tokyo":
				return "tokyo";
			case "os":
			case "osaka":
				return "osaka";
			case "jk":
			case "jakarta":
				return "jakarta";
			case "mb":
			case "mumbai":
				return "mumbai";
			case "sp":
			case "saopaulo":
			case "sao-paulo":
				return "sao-paulo";
			case "iw":
			case "iowa":
				return "iowa";
			case "sl":
			case "slc":
			case "saltlake":
			case "saltlakecity":
			case "salt-lake":
			case "salt-lake-city":
				return "salt-lake";
			case "lv":
			case "vegas":
			case "lasvegas":
			case "las-vegas":
				return "las-vegas";
			case "mt":
			case "montreal":
				return "montreal";
			case "sc":
			case "carolina":
			case "southcarolina":
			case "south-carolina":
				return "south-carolina";
			case "nv":
			case "virginia":
			case "northvirginia":
			case "north-virginia":
				return "north-virginia";
			case "or":
			case "oregon":
				return "oregon";
			case "la":
			case "losangeles":
			case "los-angeles":
				return "los-angeles";
			case "ch":
			case "chi":
			case "chicago":
				return "chicago";
			case "dl":
			case "dal":
			case "dallas":
				return "dallas";
			default:
				return null;
		}
	}

	/**
	 * Handle booking request from user
	 *
	 * @param user DiscordUser
	 * @param msg DiscordMessage
	 */
	private async handleUserBooking(user: User, msg: Message) {
		const args = msg.content.split(" ");
		const selectors = { region: "sydney", tier: "free" };
		const bookedBy = user;

		if (args.length === 2) {
			const id = this.extractIdFromArg(args[1]);
			let _user = undefined;
			try {
				_user = await this.client?.users.fetch(id);
			} catch (error) {}

			if (_user) {
				user = _user;
			} else {
				const region = this.getBookingRegion(args[1]);

				if (!region)
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("Unknown Region")));

				if (region === "sao-paulo")
					if (!msg.member?.roles.cache.get(config.roles.beta_sp_bookings))
						return msg.channel.send(msg.author,
							this.buildTextMessage(MessageType.WARNING, this.i18n.__("Restricted Region", { region: "São Paulo" })));

				if (region === "bangalore")
					if (!msg.member?.roles.cache.get(config.roles.beta_in_bookings))
						return msg.channel.send(msg.author,
							this.buildTextMessage(MessageType.WARNING, this.i18n.__("Restricted Region", { region: "Bangalore" })));

				if (region === "pune")
					if (!msg.member?.roles.cache.get(config.roles.beta_in_bookings))
						return msg.channel.send(msg.author,
							this.buildTextMessage(MessageType.WARNING, this.i18n.__("Restricted Region", { region: "Pune" })));

				selectors.region = region
			}
		} else if (args.length === 3) {
			try {
				const id = this.extractIdFromArg(args[1]);
				const _user = await this.client?.users.fetch(id);
				const region = this.getBookingRegion(args[2]);

				if (!_user) {
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("User Not Found")));
				}

				if (_user.bot) {
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("User Is Bot")));
				}

				if (!region)
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("Unknown Region")));

				if (region === "sao-paulo")
					if (!msg.member?.roles.cache.get(config.roles.beta_sp_bookings))
						return msg.channel.send(msg.author,
							this.buildTextMessage(MessageType.WARNING, this.i18n.__("Restricted Region", { region: "São Paulo" })));

				selectors.region = region
				user = _user
			} catch (error) {
				console.log("Failed to book server")
				console.error(error)
			}
		}

		let hasTier2 = false, hasTier3 = false, hasLeagueRole = false;

		try {
			const member = await msg.member?.fetch(true);
			hasTier2 = !!member?.roles.cache.get(config.roles.premium_tier_2);
			hasTier3 = !!member?.roles.cache.get(config.roles.premium_tier_3);
			hasLeagueRole = !!member?.roles.cache.get(config.roles.league_partner);
		} catch (error) {
			console.log(`Failed to get roles of the user ${this.userInfo(msg.author)}`);
			console.log(error);
		}

		if (bookedBy.id === user.id) {
			if (hasTier2 || hasTier3) {
				const bookings = await this.getBookingsByBooker(bookedBy.id);
				console.log(`Booker ${bookedBy.id} has ${bookings.length} bookings`)

				if (bookings.length >= config.preferences.tier_3_multi_booking_limit)
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("Multi Booking Limit Reached")));
				else
					selectors.tier = "premium";
			}
		} else {
			if (hasTier3) {
				const bookings = await this.getBookingsByBooker(bookedBy.id);
				console.log(`Booker ${bookedBy.id} has ${bookings.length} bookings`)

				if (!hasLeagueRole && bookings.length >= config.preferences.tier_3_multi_booking_limit)
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("Multi Booking Limit Reached")));
				else
					selectors.tier = "premium";
			} else
				return msg.channel.send(msg.author,
					this.buildTextMessage(MessageType.WARNING, this.i18n.__("Multi Booking Restricted")));
		}

		await this.bookServer(user, bookedBy, selectors);
	}

	/**
	 * Handle booking request from admin
	 *
	 * @param msg Discord Message
	 */
	private async handleAdminBooking(msg: Message) {
		const args = msg.content.split(" ");
		const selectors = { region: "sydney", tier: "free" };
		const bookedBy = msg.author;

		if (args.length < 2)
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("Admin Command Book Usage")));

		const id = this.extractIdFromArg(args[1]);
		const user = await this.client?.users.fetch(id);

		if (!user) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("User Not Found")));
		}

		if (user.bot) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("User Is Bot")));
		}

		if (args.length >= 3) {
			const region = this.getBookingRegion(args[2]);
			selectors.region = region || args[2];
		}

		if (args.length >= 4) {
			switch (args[3].toLowerCase()) {
				case "free":
				case "premium":
				case "dev":
				case "staff":
					selectors.tier = args[3];
					break;
				default:
					return msg.channel.send(msg.author,
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("Unknown Tier")));
			}
		}

		try {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.INFO, this.i18n.__("Admin Booking Start", { user: this.userInfo(user) })));

			await this.bookServer(user, bookedBy, selectors);

			console.log(`Book request sent for ${this.userInfo(user)} by admin ${this.userInfo(msg.author)}`);
		} catch (error) {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.ERROR, this.i18n.__("Admin Booking Failed")));

			console.log(`Failed to create book request for ${this.userInfo(msg.author)} due to ${error}`);
		}
	}

	private async unbookServer(user: User) {
		const chl = await this.client?.channels.fetch(config.channels.booking) as TextChannel;
		const message = await chl.send(user,
			this.buildTextMessage(MessageType.INFO, this.i18n.__("Unbooking Start")));

		try {
			await this.sendUnbookRequest(user, message);
			console.log(`Server unbook requested for ${this.userInfo(user)}`);
		} catch (error) {
			if (error.statusCode === 404) {
				await message.edit(user,
					this.buildTextMessage(MessageType.WARNING, this.i18n.__("Unbooking Not Found")));
			} else {
				await message.edit(user,
					this.buildTextMessage(MessageType.ERROR, this.i18n.__("Unbooking Failed")));

				console.log(error);
			}

			console.log(`Failed to unbook server for ${this.userInfo(user)} due to ${error}`);
		}
	}

	/**
	 * Send a unbooking request to server
	 *
	 * @param user DiscordUser
	 * @param msg DiscordMessage
	 */
	private async sendUnbookRequest(user: User, msg?: Message): Promise<void> {
		const options = {
			method: 'DELETE',
			uri: `${config.lighthouseHost}/booking/${user.id}`,
			body: {},
			json: true
		}

		if (msg) {
			options.body = {
				metadata: {
					message: {
						id: msg.id,
						channel: msg.channel.id
					}
				}
			}
		}

		return request(options);
	}

	/**
	 * Handle unbooking request from user
	 *
	 * @param msg Discord Message
	 */
	private async handleUserUnbooking(msg: Message) {
		const args = msg.content.split(" ");

		if (args.length !== 1)
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("Command Unbook Usage")));

		await this.unbookServer(msg.author);
	}

	/**
	 * Handle unbooking request from admin
	 *
	 * @param msg Discord Message
	 */
	private async handleAdminUnbooking(msg: Message) {
		const args = msg.content.split(" ");

		if (args.length !== 2)
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("Admin Command Unbook Usage")));

		const id = this.extractIdFromArg(args[1]);
		const user = await this.client?.users.fetch(id);

		if (!user) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("User Not Found")));
		}

		if (user.bot) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, this.i18n.__("Bot Has No Booking")));
		}

		try {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.SUCCESS, this.i18n.__("Admin Unbooking Start", { user: this.userInfo(user) })));

			await this.unbookServer(user);

			console.log(`Server unbook requested for ${this.userInfo(user)} by ${this.userInfo(msg.author)}`);
		} catch (error) {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.ERROR, this.i18n.__("Admin Unbooking Failed")));

			console.log(error);
			console.log(`Failed to unbook server for ${this.userInfo(msg.author)} due to ${error}`);
		}
	}

	/**
	 * Show status to user
	 *
	 * @param msg Discord Message
	 */
	private async handleUserStatus(msg: Message) {
		try {
			const status = await this.getBookingStatus();
			const message = this.buildMessageEmbed(MessageType.INFO)
				.setTitle("Status");

			if (status.providers.length > 0)
				message.addField("Capacity", `\`\`\`${status.providers.map(e => `\n${e.name} (${e.inUse}/${e.limit})`).join("")}\`\`\``);

			await msg.channel.send(message);
		} catch (error) {
			await msg.reply(
				this.buildTextMessage(MessageType.ERROR, this.i18n.__("Command Error")));

			console.log(`Failed to get status due to ${error}`);
		}
	}

	/**
	 * Show status to admin
	 *
	 * @param msg Discord Message
	 */
	private async handleAdminStatus(msg: Message) {
		const args = msg.content.split(" ");

		try {
			if (args.length === 1) {
				const status = await this.getBookingStatus();
				const message = this.buildMessageEmbed(MessageType.INFO)
					.setTitle("Status");

				if (status.bookings.length > 0)
					message.addField(
						`Bookings (Total: ${status.bookings.length})`,
						`\`\`\`${status.bookings.map(
							e => e ? `${e._id} (${e.metadata?.name || "[Booking...]"}) [${e.selectors?.region || "[Unknown]"}, ${e.selectors?.tier || "[Unknown]"}]\n` : `Booking...`
						).join("")}\`\`\``
					)
				else
					message.addField("Capacity", `\`\`\`${status.providers.map(e => `\n${e.region} ${e.tier} (${e.inUse}/${e.limit})`).join("")}\`\`\``);

				await msg.channel.send(message);
			} else if (args.length === 2 && args[1] === "capacity") {
				await this.handleUserStatus(msg);
			} else if (args.length === 2) {
				const status = await this.getBookingStatusById(args[1]);

				if (!status) {
					return msg.channel.send(
						this.buildTextMessage(MessageType.WARNING, this.i18n.__("Booking Details Not Found")));
				}

				const message = this.buildMessageEmbed(MessageType.INFO);

				message.addField("Booking", `${`\`\`\`ID: \t\t${status._id}\nName:   \t${status.metadata.name}\nIP: \t\t${status.ip}:${status.port} (${status.tvPort})\nPassword:   ${status.password}\nRCON:   \t${status.rconPassword}\n\nconnect ${status.ip}:${status.port}; password ${status.password}; rcon_password ${status.rconPassword}\`\`\`\n`}`)

				await msg.channel.send(message);
			}
		} catch (error) {
			await msg.reply(
				this.buildTextMessage(MessageType.ERROR, this.i18n.__("Command Error")));

			console.log(`Failed to get status due to ${error}`);
		}
	}

	/**
	 * Get discord user from ID
	 *
	 * @param arg Discord ID
	 */
	private extractIdFromArg(arg: string) {
		const regex = /^<@!?(\d+)>$/g;
		const match = regex.exec(arg);
		return match ? match[1] : arg;
	}

	/**
	 * Request booking status from server
	 */
	private async getBookingStatus(hidden = false): Promise<BookingStatusDTO> {
		return request({
			method: 'GET',
			uri: `${config.lighthouseHost}/booking?hiddenProviders=${hidden ? "true" : ""}`,
			json: true
		});
	}

	/**
	 * Request bookings by specific id
	 */
	private async getBookingsByBooker(id: string): Promise<BookingStatusDTO[]> {
		return request({
			method: 'GET',
			uri: `${config.lighthouseHost}/booking/booker/${id}`,
			json: true
		});
	}

	/**
	 * Request booking status by ID
	 */
	private async getBookingStatusById(id: string): Promise<BookingDTO> {
		return request({
			method: 'GET',
			uri: `${config.lighthouseHost}/booking/${id}`,
			json: true
		});
	}

	/**
	 * Build a embed message with pre filled info for the bot
	 *
	 * @param type Message Type
	 */
	private buildMessageEmbed(type: MessageType): MessageEmbed {
		return new MessageEmbed()
			.setAuthor(config.bot.name, config.bot.avatar)
			.setFooter(config.bot.footer.text, config.bot.footer.icon)
			.setImage(config.bot.image)
			.setTimestamp(new Date())
			.setColor(
				type === MessageType.SUCCESS  ? "#06D6A0" :
				type === MessageType.INFO     ? "#03A9F4" :
				type === MessageType.WARNING  ? "#FF9800" :
				type === MessageType.ERROR    ? "#f44336" : "#212121"
			);
	}

	/**
	 * Build a connect message for the booking
	 *
	 * @param booking
	 */
	private buildConnectMessage(booking: BookingDTO) {
		const connectString = `connect ${booking.ip}:${booking.port}; password ${booking.password};`
		const connectRconString = `${connectString} rcon_password ${booking.rconPassword};`
		const connectTvString = `connect ${booking.ip}:${booking.tvPort}`;

		return this.buildMessageEmbed(MessageType.SUCCESS)
			.setTitle("Bookings")
			.setDescription(`Your server is ready\n**Connect String with RCON**\`\`\`${connectRconString}\`\`\`\n**Connect String**\`\`\`${connectString}\`\`\`\n**SourceTV Details**\`\`\`${connectTvString}\`\`\``)
			.addField("Password", `\`${booking.password}\``, true)
			.addField("RCON Password", `\`${booking.rconPassword}\``, true)
			.addField("Region", `\`${booking.selectors.region}\``, true)
	}

	/**
	 * Build a text message
	 *
	 * @param type Message Type
	 * @param text Message text
	 * @param title Message title
	 */
	private buildTextMessage(type: MessageType, text: string, title = "Booking") {
		return this.buildMessageEmbed(type)
			.setTitle(title)
			.setDescription(text)
	}

	/**
	 * Check current number of active bookings from server status
	 * Set discord bot's status and activity to show stats
	 */
	// private async monitor() {
	// 	setInterval(async () => {
	// 		let current = 0;

	// 	  if (this.client && this.client.user) {
	// 	    const providers = await (await this.getBookingStatus()).providers;
	// 	    const state = 'online'

	// 	    await this.client.user.setPresence({
	// 	      status: state,
	// 	      activity: {
	// 	        name: `(${providers[current].inUse}/${providers[current].limit}) ${providers[current].name}`,
	// 	        type: "WATCHING"
	// 	      }
	// 			});

	// 			if (++current === providers.length) current = 0;
	// 	  }
	// 	}, 3000);
	// }

	/**
	 * Attach routes to express
	 */
	private attachRoutes() {
		this.express.post("/booking/callback/:id", async (req, res) => {
			const id = req.params.id;
			const event = req.query.status;
			const data = req.body;

			console.log(`Received callback event ${event} for ${id} with data ${JSON.stringify(data)}`);

			if (event === "BOOK_END" || event === "BOOK_FAILED" || event === "UNBOOK_END" || event === "UNBOOK_FAILED") {
				const user = await this.client?.users.fetch(id);
				if (!user) return res.sendStatus(404);

				const msg_data = data.metadata?.message;
				const chl = msg_data && await this.client?.channels.fetch(msg_data.channel) as TextChannel;
				const msg = chl && await chl.messages.fetch(msg_data.id);

				if (event === "BOOK_END") {
					const booking = data.booking;

					await msg.edit(user,
						this.buildTextMessage(MessageType.SUCCESS, this.i18n.__("Booking Details Sent")));

					try {
						await (await user.createDM()).send(this.buildConnectMessage(booking));
					} catch (error) {
						if (error.message === "Cannot send messages to this user") {
							await msg.edit(user,
								this.buildTextMessage(MessageType.ERROR,
									this.i18n.__("Booking Details Failed to Send due to Private DM")
								));
						} else  {
							await msg.edit(user,
								this.buildTextMessage(MessageType.ERROR,
									this.i18n.__("Booking Details Failed to Send")
								));

							console.error(error)
						}
					}

					console.log(`Server booked for ${this.userInfo(user)}`);
				} else if (event === "BOOK_FAILED") {
					await msg.edit(user,
						this.buildTextMessage(MessageType.ERROR, this.i18n.__("Booking Failed")));

					console.log(`Server failed to book for ${this.userInfo(user)}`);
				} else if (event === "UNBOOK_END") {
					const embed = this.buildTextMessage(MessageType.SUCCESS, this.i18n.__("Unbooking Success"));

					if (msg)
						await msg.edit(user, embed);
					else if (chl)
						await chl.send(user, embed);
					else {
						const chl = await this.client?.channels.fetch(config.channels.booking) as TextChannel;
						chl && await chl.send(user, embed);
					}

					console.log(`Server unbooked for ${this.userInfo(user)}`);
				} else if (event === "UNBOOK_FAILED") {
					const embed = this.buildTextMessage(MessageType.ERROR, this.i18n.__("Unbooking Failed"));

					if (msg)
						await msg.edit(user, embed);
					else if (chl)
						await chl.send(user, embed);
					else {
						const chl = await this.client?.channels.fetch(config.channels.booking) as TextChannel;
						chl && await chl.send(user, embed);
					}

					console.log(`Server failed to unbooked for ${this.userInfo(user)}`);
				}
			}

			res.sendStatus(200);
		});
	}

	private userInfo(user: User) {
		return `${user.tag} (${user.id})`;
	}
}