import { BookingDTO } from "./booking.dto";
import { ProviderDTO } from "./provider.dto";

export interface BookingStatusDTO {
	bookings: BookingDTO[]
	providers: ProviderDTO[]
}