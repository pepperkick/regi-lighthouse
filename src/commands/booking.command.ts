import { Discord, Permission, Slash, SlashChoice, SlashOption, SlashGroup } from "discordx";
import { AutocompleteInteraction, CommandInteraction } from "discord.js";
import { BookingService } from "../booking.service";
import { PreferenceService } from "../preference.service";
import * as config from "../../config.json";
import * as moment from "moment";

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
}