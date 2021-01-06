import { DiscordBot } from "kennex";
import { BookingModule } from "./Booking"
import { I18n } from "i18n";
import path from "path";
import config from "../config.json";

const i18n = new I18n()
i18n.configure({
	locales: [ 'en' ],
	directory: path.join(__dirname, '/locales')
});

@DiscordBot({
	config,
	modules: [ new BookingModule(i18n) ]
})
class Bot {}