import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { DiscordModule } from "discord-nestjs";
import { I18nJsonParser, I18nModule } from "nestjs-i18n";
import { MessageService } from "./message.service";
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from "./booking.model";
import * as config from "../config.json";
import * as path from 'path';
import { BookingAdminService } from "./booking-admin.service";

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Booking.name, schema: BookingSchema }
		]),
		MongooseModule.forRoot(config.mongodbUri),
		DiscordModule.forRoot({
			token: config.token,
			commandPrefix: config.prefix
		}),
		I18nModule.forRoot({
			fallbackLanguage: config.language,
			parser: I18nJsonParser,
			parserOptions: {
				path: path.join(__dirname, '../locales/'),
				watch: true
			}
		}),
	],
	controllers: [ BookingController ],
	providers: [ BookingService, BookingAdminService, MessageService ],
})
export class AppModule {
}
