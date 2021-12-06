import { Discord, Slash, SlashOption, SlashGroup } from "discordx";
import { CommandInteraction } from "discord.js";
import { PreferenceService } from "../preference.service";

@Discord()
@SlashGroup("settings", "Change your server settings.")
export class SettingsCommand {
	static service: PreferenceService

	constructor(
		private readonly service: PreferenceService
	) {
		SettingsCommand.service = service;
	}

	@Slash("password", { description: "Change your TF2 Server password (Leave blank for no password)." })
	async password(
		@SlashOption("password", { description: "Type your new password (Type * for random password)" })
		password: string,
		interaction: CommandInteraction
	) {
		if (!password) {
			password = ""
		}

		if (password.includes(" ")) {
			return await interaction.reply({
				content: `Passwords cannot contain spaces.`,
				ephemeral: true
			})
		}

		await SettingsCommand.service.storeData(interaction.user.id, "tf2_password", password);
		await interaction.reply({
			content: `Your password has been saved!`,
			ephemeral: true
		})
	}

	@Slash("rcon-password", { description: "Change your TF2 RCON Server password (Leave blank for no password and no RCON access)." })
	async rconPassword(
		@SlashOption("password", { description: "Type your new password (Type * for random password)" })
		password: string,
		interaction: CommandInteraction
	) {
		if (!password) {
			password = ""
		}

		if (password.includes(" ")) {
			return await interaction.reply({
				content: `Passwords cannot contain spaces.`,
				ephemeral: true
			})
		}

		await SettingsCommand.service.storeData(interaction.user.id, "tf2_rcon_password", password);
		await interaction.reply({
			content: `Your password has been saved!`,
			ephemeral: true,
		})
	}

	@Slash("valve-sdr", { description: "Enable / Disable TF2 Valve SDR connection mode (This is an experimental feature)."})
	async enableSdr(
		@SlashOption("enable", { description: "Enable or disable the feature", required: true })
		enable: boolean,
		interaction: CommandInteraction
	) {
		await SettingsCommand.service.storeData(interaction.user.id, "tf2_sdr_mode", enable);
		await interaction.reply({
			content: `Your settings has been saved!`,
			ephemeral: true,
		})
	}
}