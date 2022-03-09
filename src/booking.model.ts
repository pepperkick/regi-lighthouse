import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class Booking extends Document {
  @Prop()
  createdAt: Date;

  @Prop()
  reservedAt?: Date;

  @Prop()
  bookingFor: string;

  @Prop()
  bookingBy: string;

  @Prop()
  region: string;

  @Prop()
  tier: string;

  @Prop()
  variant: string;

  @Prop()
  server?: string;

  @Prop({ type: String })
  status: string;

  @Prop({ type: Object })
  messages: {
    start?: {
      id: string;
      channel: string;
    };
    close?: {
      id: string;
      channel: string;
    };
  };
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
