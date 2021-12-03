import { Body, Controller, Post, Query } from "@nestjs/common";
import { Server } from "./objects/server.interface";
import { ServerStatus } from "./objects/server-status.enum";
import { BookingService } from "./booking.service";

@Controller()
export class BookingControllerRest {
	constructor(
		private readonly bookingService: BookingService,
	) {
	}

	@Post("/booking/callback")
	async callback(@Body() body: Server, @Query("status") status: ServerStatus): Promise<void> {
		await this.bookingService.handleServerStatusChange(body, status);
	}
}