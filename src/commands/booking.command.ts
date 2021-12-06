import { Discord, Slash, SlashChoice, SlashOption, SlashGroup } from "discordx";
import { AutocompleteInteraction, CommandInteraction } from "discord.js";
import { BookingService } from "../booking.service";

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

	constructor(
		private readonly service: BookingService
	) {
		BookingCommand.service = service;
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
					.filter(tag => tag.includes(text))
					.map(tag => ({ name: tag, value: tag }))
					.slice(0, 24)
				);
			}
		} else {
			await BookingCommand.service.sendBookingStatus(interaction, { continent, tag });
		}
	}
}