import { Document } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";


@Schema()
export class Preference extends Document {
	@Prop({ type: String })
	_id: string

	@Prop({ type: Object })
	data: { [key: string]: string | number | boolean } | string | number | boolean
}

export const PreferenceSchema = SchemaFactory.createForClass(Preference);