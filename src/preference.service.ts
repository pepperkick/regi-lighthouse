import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Logger, NotFoundException } from "@nestjs/common";
import { Preference } from "./preference.model";

export class PreferenceService {
	private readonly logger = new Logger(PreferenceService.name);
	static readonly Keys = {
		serverPassword: "server_password",
		serverRconPassword: "server_rcon_password",
		serverTf2ValveSdr: "server_tf2_sdr_mode",
		serverHostname: "server_hostname",
		serverTvName: "server_source_tv_name",
		rconCommandHistory: "rcon_command_history",
		bookingRegion: "booking_preferred_region"
	}

	constructor(
		@InjectModel(Preference.name)
		private readonly preference: Model<Preference>
	) {}

	getById(id: string) {
		return this.preference.findById(id);
	}

	async storeData(id: string, key: string, value: string | string[] | number | number[] | boolean | boolean[]) {
		let preference = await this.getById(id);

		if (!preference) {
			preference = new this.preference({
				_id: id,
				data: {}
			});
		}

		preference.data[key] = value;
		preference.markModified('data');
		await preference.save();

		this.logger.debug(preference)
	}

	async getData(id: string, key: string): Promise<string | string[] | number | number[] | boolean | boolean[]> {
		const preference = await this.getById(id);
		return preference ? preference.data[key] : null;
	}

	async getDataString(id: string, key: string): Promise<string> {
		const preference = await this.getById(id);
		return preference ? preference.data[key] : null;
	}

	async getDataStringArray(id: string, key: string): Promise<string[]> {
		const preference = await this.getById(id);
		return preference ? preference.data[key] || [] : [];
	}
}