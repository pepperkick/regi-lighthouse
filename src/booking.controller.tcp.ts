import { Controller } from "@nestjs/common";
import { BookingService } from "./booking.service";
import { MessagePattern } from "@nestjs/microservices";
import { Booking } from "./booking.model";
import { RegionConfig } from "./objects/region.interface";


@Controller()
export class BookingControllerTcp {
	constructor(
		private readonly bookingService: BookingService
	) {}

	@MessagePattern({ cmd: 'BookingService.getById' })
	async getById(id: string): Promise<Booking> {
		return await this.bookingService.getById(id);
	}

	@MessagePattern({ cmd: 'BookingService.getRegions' })
	getRegions(): RegionConfig {
		return this.bookingService.getRegions();
	}
}