import { Discord, Permission, Slash, SlashChoice, SlashOption, SlashGroup } from "discordx";
import { AutocompleteInteraction, CommandInteraction, GuildMember, User } from "discord.js";
import { BookingService } from "../booking.service";
import { PreferenceService } from "../preference.service";
import * as config from "../../config.json";
import * as moment from "moment";
import { BookingOptions } from "../objects/booking.interface";
import { APIInteractionGuildMember } from "discord-api-types";
import { ErrorMessage, WarningMessage } from "../objects/message.exception";

enum Continents {
	"Asia" = "asia",
	"Australia" = "australia",
	"Europe" = "europe",
	"North America" = "north_america",
	"South America" = "south_america"
}

@Discord()
@SlashGroup("booking", "Commands to interact with bookings")
export class BookingCommand {
	static service: BookingService
	static preferenceService: PreferenceService

	constructor(
		private readonly service: BookingService,
		private readonly preferenceService: PreferenceService,
	) {
		BookingCommand.service = service;
		BookingCommand.preferenceService = preferenceService;
	}

	@Slash("status", { description: "Check the availability of servers across regions" })
	async rconPassword(
		@SlashChoice(Continents)
		@SlashOption("continent", { description: "Filter regions by continent" })
		continent: string,
		@SlashOption("tag", {
			description: "Filter regions by tag",
			autocomplete: true,
			type: "STRING"
		})
		tag: string,
		interaction: CommandInteraction | AutocompleteInteraction
	) {
		if (interaction.isAutocomplete()) {
			const tags = BookingCommand.service.getAllRegionTags();
			const focusedOption = interaction.options.getFocused(true);
			if (focusedOption.name === "tag") {
				const text = interaction.options.getString("tag")
				await interaction.respond(tags
					.filter(item => item.includes(text))
					.map(item => ({ name: item, value: item }))
					.slice(0, 24)
				);
			}
		} else {
			await BookingCommand.service.sendBookingStatus(interaction, { continent, tag });
		}
	}

	@Slash("create", { description: "Create a new booking server." })
	async create(
		@SlashOption("region", {
			description: "Select the server location.",
			autocomplete: true,
			type: "STRING"
		})
		region: string,
		@SlashOption("provider", {
			description: "Select the server provider (Availability depends on access).",
			autocomplete: true,
			type: "STRING"
		})
		tier: string,
		@SlashOption("for-friend", {
			description: "Book the server for someone else (Availability depends on access).",
			type: "USER"
		})
		bookingFor: GuildMember | APIInteractionGuildMember,
		@SlashOption("variant", {
			description: "Select the variant of the game to use in your server  (Availability depends on access)."
		})
		@SlashChoice(BookingService.getGameVariantList())
		variant: string,
		interaction: CommandInteraction | AutocompleteInteraction
	) {
		if (interaction.isAutocomplete()) {
			const focusedOption = interaction.options.getFocused(true);
			if (focusedOption.name === "region") {
				const text = interaction.options.getString("region")
				return interaction.respond(
					BookingCommand.service.searchRegions(text.toLocaleLowerCase()).slice(0, 24)
				)
			} else if (focusedOption.name === "provider") {
				const text = interaction.options.getString("provider")
				let region = interaction.options.getString("region")
				let bookingFor = interaction.options.getUser("for-friend")

				if (!region) {
					if (bookingFor)
						region = await BookingCommand.preferenceService.getDataString(bookingFor.id, PreferenceService.Keys.bookingRegion);
					else
						region = await BookingCommand.preferenceService.getDataString(interaction.user.id, PreferenceService.Keys.bookingRegion);
				}

				const defaultRegion = BookingCommand.service.defaultRegion;
				if (!region && defaultRegion) {
					region = defaultRegion;
				}

				if (!region) {
					return interaction.respond([
						{
							name: "Please select a region first",
							value: "invalid"
						}
					])
				}

				return interaction.respond(
					BookingCommand.service.searchTiers(region, text.toLocaleLowerCase()).slice(0, 24)
				)
			}
		} else {
			if (tier && !this.userHasAccess(interaction.member, config.features.providerSelector)) {
				return await interaction.reply({
					content: `Currently you do not have access to selecting server provider.`,
					ephemeral: true,
				})
			}

			if (variant && !this.userHasAccess(interaction.member, config.features.variantSelector)) {
				return await interaction.reply({
					content: `Currently you do not have access to selecting game variants.`,
					ephemeral: true,
				})
			}

			if (bookingFor && !this.userHasAccess(interaction.member, config.features.multiBooking)) {
				return await interaction.reply({
					content: `Currently you cannot book for others.`,
					ephemeral: true,
				})
			}

			if (!bookingFor) {
				bookingFor = interaction.member
			}

			if (bookingFor.user.bot) {
				return await interaction.reply({
					content: `We do not want the bots to take over the world now, do we? ;)`,
					ephemeral: true,
				})
			}

			if (!tier) {
				tier = this.userHasAccess(interaction.member, config.features.premiumBooking) ? config.preferences.defaultPremiumTier : config.preferences.defaultFreeTier
			}

			if (!region) {
				region = await BookingCommand.preferenceService.getDataString(bookingFor.user.id, PreferenceService.Keys.bookingRegion);
			}

			const defaultRegion = BookingCommand.service.defaultRegion;
			if (!region && defaultRegion) {
				region = defaultRegion;
			}

			// Check if region is present
			if (!region) {
				return await interaction.reply({
					content: `You need to specify a region.`,
					ephemeral: true,
				})
			}

			const defaultVariant = BookingCommand.service.defaultVariant;
			if (!variant && defaultVariant) {
				variant = defaultVariant;
			}

			// Check if variant is present
			if (!variant) {
				return await interaction.reply({
					content: `You need to specify a game variant.`,
					ephemeral: true,
				})
			}

			const bookingOptions: BookingOptions = {
				message: interaction,
				region,
				tier,
				bookingFor,
				variant,
				bookingBy: interaction.member,
			}

			await interaction.deferReply({
				ephemeral: true
			})

			try {
				// Validate and create booking
				console.log(bookingOptions.region)
				console.log(bookingOptions.tier)
				if (await BookingCommand.service.validateBookRequest(bookingOptions)) {
					await BookingCommand.service.createBookingRequest(bookingOptions);
					return interaction.editReply({
						content: "Check the status of the request in the bookings channel!"
					})
				}
			} catch (error: any) {
				console.log(error)
				if (error instanceof WarningMessage) {
					return interaction.editReply(error.message)
				} else if (error instanceof ErrorMessage) {
					return interaction.editReply(error.message)
				}
			}
		}
	}

	@Slash("rcon", { description: "Send a RCON command to your server (You should have an active booking to use this)."})
	async rcon(
		@SlashOption("command", {
			description: "RCON command to send (Default: 'status')",
			autocomplete: true,
			type: "STRING"
		})
		command: string,
		interaction: CommandInteraction | AutocompleteInteraction
	) {
		const user = interaction.user.id;
		const history = (await BookingCommand.preferenceService.getDataStringArray(
			user, PreferenceService.Keys.rconCommandHistory)) || [];
		const common = config.preferences.rconCommonCommands;
		const commands = history.concat(common.filter(item => history.indexOf(item) < 0))

		if (interaction.isAutocomplete()) {
			const focusedOption = interaction.options.getFocused(true);
			if (focusedOption.name === "command") {
				const text = interaction.options.getString("command")
				await interaction.respond(commands
					.filter(item => item.includes(text))
					.map(item => ({ name: item, value: item }))
					.slice(0, 24)
				);
			}
		} else {
			if (!command || command == "")
				command = "status";

			const booking = await BookingCommand.service.getActiveUserBooking(user);

			if (!booking) {
				return await interaction.reply({
					content: `You currently do not have any active booking.`,
					ephemeral: true,
				})
			}

			let response = await BookingService.sendRconCommandRequest(booking, command);

			if (!response.includes("Unknown command")) {
				// Store the command in player's history
				if (!commands.includes(command)) {
					commands.push(command)
				}

				await BookingCommand.preferenceService.storeData(
					user, PreferenceService.Keys.rconCommandHistory, commands)
			}

			if (response === "") {
				response = " "
			}

			await interaction.reply({
				content: `\`\`\`${response}\`\`\``,
				ephemeral: true,
			})
		}
	}

	@Slash("server-demos", { description: "List and download demo files (You should have an active booking to use this)." })
	async serverDemos(interaction: CommandInteraction) {
		const user = interaction.user.id;
		const booking = await BookingCommand.service.getActiveUserBooking(user);

		if (!booking) {
			return await interaction.reply({
				content: `You currently do not have any active booking.`,
				ephemeral: true,
			})
		}

		const files = await BookingService.getServerDemosList(booking);

		let message = "[WARNING] Ensure that the demo recording has stopped otherwise you may download an incomplete demo which will not play in game.\n"
		for (const [index, file] of files.entries()) {
			message += `${index+1}. [${file.name}](${await BookingService.getHatchApiUrl(booking, file.url)}) (${moment(file.modifiedAt).toDate().toUTCString()})\n`
		}

		await interaction.reply({
			content: message,
			ephemeral: true,
		})
	}

	@Slash("server-logs", { description: "List and download match log files (You should have an active booking to use this)." })
	async serverLogs(interaction: CommandInteraction) {
		const user = interaction.user.id;
		const booking = await BookingCommand.service.getActiveUserBooking(user);

		if (!booking) {
			return await interaction.reply({
				content: `You currently do not have any active booking.`,
				ephemeral: true,
			})
		}

		const files = await BookingService.getServerLogsList(booking);

		let message = ""
		for (const [index, file] of files.entries()) {
			message += `${index+1}. [${file.name}](${await BookingService.getHatchApiUrl(booking, file.url)}) (${moment(file.modifiedAt).toDate().toUTCString()})\n`
		}

		console.log(files)
		await interaction.reply({
			content: message,
			ephemeral: true,
		})
	}

	userHasAccess(member: GuildMember | APIInteractionGuildMember, access: boolean | string) {
		return BookingCommand.service.userHasRoleFromSlug(member, access)
	}
}