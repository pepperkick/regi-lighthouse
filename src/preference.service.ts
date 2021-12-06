import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Logger, NotFoundException } from "@nestjs/common";
import { Preference } from "./preference.model";

export class PreferenceService {
	private readonly logger = new Logger(PreferenceService.name);

	constructor(
		@InjectModel(Preference.name)
		private readonly preference: Model<Preference>
	) {}

	getById(id: string) {
		return this.preference.findById(id);
	}

	async storeData(id: string, key: string, value: string | number | boolean) {
		let preference = await this.getById(id);

		if (!preference) {
			preference = new this.preference({
				_id: id,
				data: {}
			});
		}

		console.log(preference)

		preference.data[key] = value;
		preference.markModified('data');
		await preference.save();
	}

	async getData(id: string, key: string) {
		const preference = await this.getById(id);

		if (!preference) {
			return null;
		}

		return preference.data[key];
	}
}