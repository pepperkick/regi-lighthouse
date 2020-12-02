import { DiscordBotModule, BotCommand, BotEvent, DiscordEvents } from "kennex";
import { Message, User, MessageEmbed, Client, TextChannel } from "discord.js";
import request from "request-promise";
import Express from "express";
import * as bodyParser from "body-parser";
import { BookingDTO } from "./dto/booking.dto";
import { BookingStatusDTO } from "./dto/booking-status.dto";
import config from "../config.json";

enum MessageType {
	SUCCESS, INFO, WARNING, ERROR
}

@DiscordBotModule("booking")
export class BookingModule {
	client?: Client = undefined;

	@BotEvent(DiscordEvents.Ready)
	ready (bot: Client) {
		this.client = bot;
	}
	
	express: Express.Application;

	constructor() {
		this.express = Express();
		this.express.use(bodyParser.json());
		this.express.listen(config.express.port, () => {
			console.log(`Express server running at ${config.express.port}`)
		});

		this.attachRoutes();    
		// this.monitor();
	}
	
	@BotCommand("book")
	async book(msg: Message) {
		if (this.validateBookingChannel(msg)) {
			this.handleUserBooking(msg.author, msg);
		} else if (this.validateAdminChannel(msg)) {    
			this.handleAdminBooking(msg);
		}
	}

	@BotCommand("unbook")
	async unbook(msg: Message) {
		if (this.validateBookingChannel(msg)) {
			this.handleUserUnbooking(msg);
		} else if (this.validateAdminChannel(msg)) {    
			this.handleAdminUnbooking(msg);
		}
	}

	@BotCommand("status")
	async status(msg: Message) {    
		if (this.validateBookingChannel(msg)) {
			this.handleUserStatus(msg);
		} else if (this.validateAdminChannel(msg)) {    
			this.handleAdminStatus(msg);
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
		if (msg.channel.id !== config.channels.booking) {
			return false;
		}

		return true;
	}

	/**
	 * Check if discord message came from admin channel
	 * 
	 * @param msg DiscordMessage
	 */
	private validateAdminChannel(msg: Message) {
		if (msg.channel.id !== config.channels.admin) {
			return false;
		}

		return true;
	}

	/**
	 * Send a booking request to server
	 * 
	 * @param user Discord User
	 * @param selectors Provider selectors
	 * @param msg Discord Message for status updates
	 */
	private async sendBookRequest(user: User, selectors: {}, msg: Message): Promise<BookingDTO> {
		return request({      
			method: 'POST',
			uri: `${config.lighthouseHost}/booking`,
			body: {
				id: `${user.id}`,
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
	 * @param user Discord User
	 * @param selectors Provider selectors
	 */
	private async bookServer(user: User, selectors: {}) {
		const chl = await this.client?.channels.fetch(config.channels.booking) as TextChannel;
		const message = await chl.send(user,
			this.buildTextMessage(MessageType.INFO, "Your server is being booked...\nThis may take some time.\nDetails will be sent via private message when the server is ready."));
		try {			
			await this.sendBookRequest(user, selectors, message);

			console.log(`Book request sent for ${this.userInfo(user)}`);
		} catch (error) {
			if (error.statusCode === 409) {
				await message.edit(user,
					this.buildTextMessage(MessageType.WARNING, "You have already booked a server\nUse `!unbook` command to remove your booking."))
			} else if (error.statusCode && error.statusCode === 429) {
				await message.edit(user,
					this.buildTextMessage(MessageType.WARNING, "The maximum amount of free bookable servers for your location has been reached. Please try again later or you can check-out <https://www.patreon.com/qixalite> to gain access to our exclusive server pool."))
			} else {        
				await message.edit(user,
					this.buildTextMessage(MessageType.ERROR, "Your server has failed to start. Please try again later."));

				console.log(error);
			}

			console.log(`Failed to book server for ${this.userInfo(user)} due to ${error}`);
		}
	}

	/**
	 * Handle booking request from user
	 * 
	 * @param msg Discord Message
	 */
	private async handleUserBooking(user: User, msg: Message) {
		const args = msg.content.split(" ");
		const selectors = { region: "sydney", tier: "free" };

		if (args.length === 2) {
			switch (args[1]) {
				case "syd":
				case "sydney":
					selectors.region = "sydney";
					break;
				case "sg":
				case "singapore":
					selectors.region = "singapore";
					break;
				case "hk":
				case "hongkong":					
					selectors.region = "hongkong";
					break;
				default:
					return msg.channel.send(msg.author,
						this.buildMessageEmbed(MessageType.WARNING)
							.setTitle("Bookings")          
							.setDescription("Currently that region is not supported."));
			}
		}
		
		try {
			const member = await msg.member?.fetch(true);
	
			if (
				member?.roles.cache.get(config.roles.premium_tier_2) ||
				member?.roles.cache.get(config.roles.premium_tier_3)
			)
				selectors.tier = "premium";
		} catch (error) {
			console.log(`Failed to get roles of the user ${this.userInfo(msg.author)}`);
			console.log(error);
		}

		await this.bookServer(user, selectors);
	}

	/**
	 * Handle booking request from admin
	 * 
	 * @param msg Discord Message
	 */
	private async handleAdminBooking(msg: Message) {  
		const args = msg.content.split(" ");
		const selectors = { region: "sydney", tier: "free" };

		if (args.length < 2) 
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, `Usage: unbook <discord user> [region] [tier]`));

		let id = args[1]
		if (args[1][0] === "<")
				id = this.extractIdFromArg(args[1]);
			
		const user = await this.client?.users.fetch(id);  

		if (!user) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, `Could not find that user`));
		}

		if (user.bot) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, `Giving bookings to bots can result in world domination. Your welcome! ;)`));
		}

		if (args.length >= 3) {
			switch (args[2]) {
				case "syd":
				case "sydney":
					selectors.region = "sydney";
					break;
				case "sg":
				case "singapore":
					selectors.region = "singapore";
					break;					
				case "hk":
				case "hongkong":
					selectors.region = "hongkong";
					break;
				default:
					return msg.channel.send(msg.author,
						this.buildMessageEmbed(MessageType.WARNING)
							.setTitle("Bookings")          
							.setDescription("Currently that region is not supported"));
			}
		}

		if (args.length >= 4) {
			switch (args[3]) {
				case "free":
				case "premium":
				case "dev":
					selectors.tier = args[3];
					break;
				default:
					return msg.channel.send(msg.author,
						this.buildMessageEmbed(MessageType.WARNING)
							.setTitle("Bookings")          
							.setDescription("That is an unknown tier!"));
			}
		}

		try {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.INFO, `Server will be booked and details will be sent via private message to ${this.userInfo(user)}`));
			
			await this.bookServer(user, selectors);

			console.log(`Book request sent for ${this.userInfo(user)} by admin ${this.userInfo(msg.author)}`);
		} catch (error) {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.ERROR, "Server for the user has failed to start. Please try again later."));

			console.log(`Failed to create book request for ${this.userInfo(msg.author)} due to ${error}`);
		}
	}

	private async unbookServer(user: User) {		
		const chl = await this.client?.channels.fetch(config.channels.booking) as TextChannel;
		const message = await chl.send(user,
			this.buildTextMessage(MessageType.INFO, "Your server is being closed...\nThis may take some time."));

		try {
			await this.sendUnbookRequest(user, message);  
			console.log(`Server unbook requested for ${this.userInfo(user)}`);
		} catch (error) {			
			if (error.statusCode === 404) {
				await message.edit(user,
					this.buildTextMessage(MessageType.WARNING, "You do not have any booking with us."));
			} else { 
				await message.edit(user,
					this.buildTextMessage(MessageType.ERROR, "Your server has failed to stop. Please try again later."));

				console.log(error);
			}

			console.log(`Failed to unbook server for ${this.userInfo(user)} due to ${error}`);
		}
	}

	/**
	 * Send a unbooking request to server
	 * 
	 * @param user DiscordUser
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
				this.buildTextMessage(MessageType.WARNING, `Usage: unbook <discord user>`));

		let id = args[1]
		if (args[1][0] === "<")
				id = this.extractIdFromArg(args[1]);

		const user = await this.client?.users.fetch(id);    

		if (!user) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, `Could not find that user`));
		}

		if (user.bot) {
			return msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.WARNING, `We bots cannot have bookings :(`));
		}

		try { 
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.SUCCESS, `Server will be unbooked for ${this.userInfo(user)}`));

			await this.unbookServer(msg.author);

			console.log(`Server unbook requested for ${this.userInfo(user)} by ${this.userInfo(msg.author)}`);
		} catch (error) {
			await msg.channel.send(msg.author,
				this.buildTextMessage(MessageType.ERROR, "Failed to stop the user's server. Please try again later."));

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
				this.buildTextMessage(MessageType.ERROR, "Looks like there are some issues. Please try again later."));
			
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
					message.addField("Bookings", `\`\`\`${status.bookings.map(e => `${e._id} (${e.metadata.name}) [${e.selectors.region}, ${e.selectors.tier}]\n`).join("")}\`\`\``)
				else
					message.addField("Capacity", `\`\`\`${status.providers.map(e => `\n${e.name} (${e.inUse}/${e.limit})\n ${e.region} (${e.tier})\n`).join("")}\`\`\``);
				
				await msg.channel.send(message);  
			} else if (args.length === 2 && args[1] === "capacity") {
				const status = await this.getBookingStatus();    
				const message = this.buildMessageEmbed(MessageType.INFO)
					.setTitle("Status");

				if (status.providers.length > 0)
					message.addField("Capacity", `\`\`\`${status.providers.map(e => `\n${e.name} (${e.inUse}/${e.limit})\n ${e.region} (${e.tier})\n`).join("")}\`\`\``);

				await msg.channel.send(message);   
			} else if (args.length === 2) {
				const status = await this.getBookingStatusById(args[1]);   

				if (!status) {
					return msg.channel.send(
						this.buildTextMessage(MessageType.WARNING, "No booking found with that ID."));                
				}

				const message = this.buildMessageEmbed(MessageType.INFO);
	
				message.addField("Booking", `${`\`\`\`ID: \t\t${status._id}\nName:   \t${status.metadata.name}\nIP: \t\t${status.ip}:${status.port} (${status.tvPort})\nPassword:   ${status.password}\nRCON:   \t${status.rconPassword}\n\nconnect ${status.ip}:${status.port}; password ${status.password}; rcon_password ${status.rconPassword}\`\`\`\n`}`)
				
				await msg.channel.send(message);  
			}
		} catch (error) {
			await msg.reply(
				this.buildTextMessage(MessageType.ERROR, "Looks like there are some issues. Please try again later."));
			
			console.log(`Failed to get status due to ${error}`);
		}
	}

	/**
	 * Get discord user from ID
	 * 
	 * @param arg Discord ID
	 */
	private extractIdFromArg(arg: string) {
		return arg.substr(3, 18);
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
	private async monitor() {  
		setInterval(async () => {
			let current = 0;

		  if (this.client && this.client.user) {
		    const providers = await (await this.getBookingStatus()).providers;
		    const state = 'online'

		    await this.client.user.setPresence({
		      status: state,
		      activity: {
		        name: `(${providers[current].inUse}/${providers[current].limit}) ${providers[current].name}`,
		        type: "WATCHING"
		      }
				});

				if (++current === providers.length) current = 0;
		  }
		}, 3000);
	}

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
						this.buildTextMessage(MessageType.SUCCESS, "Your server details have been sent via private message.\nPlease open a ticket in #support if you have any issues."));

					await (await user.createDM()).send(this.buildConnectMessage(booking));

					console.log(`Server booked for ${this.userInfo(user)}`);
				} else if (event === "BOOK_FAILED") {
					await msg.edit(user,
						this.buildTextMessage(MessageType.ERROR, "Your server has failed to start. Please try again later."));

					console.log(`Server failed to book for ${this.userInfo(user)}`);
				} else if (event === "UNBOOK_END") {
					const embed = this.buildTextMessage(MessageType.SUCCESS, `Your server has been closed. Thank you for using our service, if you have any suggestions you can post them in #feedback.`);
					
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
					const embed = this.buildTextMessage(MessageType.ERROR, "Your server has failed to stop. Please try again later.");
	
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