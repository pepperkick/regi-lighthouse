import { Controller } from '@nestjs/common';
import { BookingService } from './booking.service';
import { MessagePattern } from '@nestjs/microservices';
import { Booking } from './booking.model';
import { Regions } from './objects/region.interface';
import { TransportResponse } from './utils';

@Controller()
export class BookingControllerTcp {
  constructor(private readonly bookingService: BookingService) {}

  @MessagePattern({ cmd: 'BookingService.getById' })
  @TransportResponse<Booking>()
  async getById(id: string): Promise<Booking> {
    return await this.bookingService.getById(id);
  }

  @MessagePattern({ cmd: 'BookingService.getRegions' })
  @TransportResponse<Regions>()
  async getRegions(region: string | object): Promise<Regions> {
    return await this.bookingService.getRegions(
      typeof region === 'object' ? '' : region,
    );
  }
}
