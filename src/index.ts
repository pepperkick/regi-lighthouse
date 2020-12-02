import { DiscordBot } from "kennex";
import { BookingModule } from "./Booking"
import config from "../config.json";

@DiscordBot({
	config,
	modules: [ new BookingModule() ]
}, {
	partials: [ 'MESSAGE', 'REACTION', 'USER' ]
}) 
class Bot {}