import { Discord, Slash, SlashOption, SlashGroup } from "discordx";
import { CommandInteraction, GuildMember } from "discord.js";
import { PreferenceService } from "../preference.service";
import * as config from "../../config.json";
import { BookingService } from "../booking.service";
import { APIInteractionGuildMember } from "discord-api-types";

class Strings {
	static readonly SETTING_DISABLED = "This discord server does not support changing this setting."
	static readonly PASSWORD_SAVED = "Your password has been saved!"
	static readonly SETTING_SAVED = "Your preference has been saved!"
	static readonly SETTING_NO_ACCESS = "However, you do not have the proper role so you will not see this change take effect.";
}

@Discord()
@SlashGroup("settings", "Change your server preference.")
export class SettingsCommand {
	static service: PreferenceService
	static bookingService: BookingService

	constructor(
		private readonly service: PreferenceService,
		private readonly bookingService: BookingService
	) {
		SettingsCommand.service = service;
		SettingsCommand.bookingService = bookingService;
	}

	@Slash("server-password", { description: "Change your TF2 Server password (Leave blank for no password)." })
	async serverPassword(
		@SlashOption("password", { description: "Type your new password (Type * for random password)" })
		password: string,
		interaction: CommandInteraction
	) {
		if (!config.features.settings.serverPassword) {
			return await interaction.reply({
				content: Strings.SETTING_DISABLED,
				ephemeral: true
			})
		}

		if (!password) {
			password = ""
		}

		if (password.includes(" ")) {
			return await interaction.reply({
				content: `Passwords cannot contain spaces.`,
				ephemeral: true
			})
		}

		password = password.replace("'", "");
		password = password.replace("$", "");
		password = password.replace('"', "");

		await SettingsCommand.service.storeData(interaction.user.id, SettingsCommand.service.Keys.serverPassword, password);

		let message = Strings.PASSWORD_SAVED;
		if (!this.userHasAccess(interaction.member, config.features.settings.serverPassword)) {
			message += `\nHowever, you do not have the proper role so you will not see this change.`
		}

		await interaction.reply({
			content: message,
			ephemeral: true
		})
	}

	@Slash("server-rcon-password", { description: "Change your TF2 RCON Server password (Leave blank for no password and no RCON access)." })
	async serverRconPassword(
		@SlashOption("password", { description: "Type your new password (Type * for random password)" })
		password: string,
		interaction: CommandInteraction
	) {
		if (!config.features.settings.serverRconPassword) {
			return await interaction.reply({
				content: Strings.SETTING_DISABLED,
				ephemeral: true
			})
		}

		if (!password) {
			password = ""
		}

		if (password.includes(" ")) {
			return await interaction.reply({
				content: `Passwords cannot contain spaces.`,
				ephemeral: true
			})
		}

		password = password.replace("'", "");
		password = password.replace("$", "");
		password = password.replace('"', "");

		let message = Strings.PASSWORD_SAVED;
		if (!this.userHasAccess(interaction.member, config.features.settings.serverRconPassword)) {
			message += `\n${Strings.SETTING_NO_ACCESS}`
		}

		await SettingsCommand.service.storeData(interaction.user.id, SettingsCommand.service.Keys.serverRconPassword, password);
		await interaction.reply({
			content: message,
			ephemeral: true,
		})
	}

	@Slash("server-valve-sdr", { description: "Enable / Disable TF2 Valve SDR connection mode (This is an experimental feature)."})
	async serverValveSdr(
		@SlashOption("enable", { description: "Enable or disable the feature", required: true })
		enable: boolean,
		interaction: CommandInteraction
	) {
		if (!config.features.settings.serverTf2ValveSdr) {
			return await interaction.reply({
				content: Strings.SETTING_DISABLED,
				ephemeral: true
			})
		}

		let message = Strings.SETTING_SAVED;
		if (!this.userHasAccess(interaction.member, config.features.settings.serverTf2ValveSdr)) {
			message += `\n${Strings.SETTING_NO_ACCESS}`
		}

		await SettingsCommand.service.storeData(interaction.user.id, SettingsCommand.service.Keys.serverTf2ValveSdr, enable);
		await interaction.reply({
			content: message,
			ephemeral: true,
		})
	}

	@Slash("server-hostname", { description: "Change your TF2 Server Name"})
	async serverName(
		@SlashOption("name", { description: `Type the new name (Cannot use ', ", $ Symbols)`, required: true })
		name: string,
		interaction: CommandInteraction
	) {
		if (!config.features.settings.serverHostname) {
			return await interaction.reply({
				content: Strings.SETTING_DISABLED,
				ephemeral: true
			})
		}

		name = name.replace("'", "");
		name = name.replace('$', "");
		name = name.replace('"', "");

		let message = Strings.SETTING_SAVED;
		if (!this.userHasAccess(interaction.member, config.features.settings.serverHostname)) {
			message += `\n${Strings.SETTING_NO_ACCESS}`
		}

		await SettingsCommand.service.storeData(interaction.user.id, SettingsCommand.service.Keys.serverHostname, name);
		await interaction.reply({
			content: message,
			ephemeral: true,
		})
	}

	@Slash("server-tv-name", { description: "Change your TF2 Server TV Name"})
	async serverTvName(
		@SlashOption("name", { description: `Type the new name (Cannot use ', ", $ Symbols)`, required: true })
		name: string,
		interaction: CommandInteraction
	) {
		if (!config.features.settings.serverTvName) {
			return await interaction.reply({
				content: Strings.SETTING_DISABLED,
				ephemeral: true
			})
		}

		name = name.replace("'", "");
		name = name.replace('$', "");
		name = name.replace('"', "");

		let message = Strings.SETTING_SAVED;
		if (!this.userHasAccess(interaction.member, config.features.settings.serverTvName)) {
			message += `\n${Strings.SETTING_NO_ACCESS}`
		}

		await SettingsCommand.service.storeData(interaction.user.id, SettingsCommand.service.Keys.serverTvName, name);
		await interaction.reply({
			content: message,
			ephemeral: true,
		})
	}

	userHasAccess(member: GuildMember | APIInteractionGuildMember, access: boolean | string) {
		return SettingsCommand.bookingService.userHasRoleFromSlug(member, access)
	}
}