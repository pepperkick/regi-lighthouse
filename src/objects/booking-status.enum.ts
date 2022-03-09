export enum BookingStatus {
  RESERVED = 'RESERVED',
  RESERVING = 'RESERVING',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
  FAILED = 'FAILED',
}

export const BOOKING_ACTIVE_STATUS_CONDITION = [
  { status: BookingStatus.STARTING },
  { status: BookingStatus.RUNNING },
  { status: BookingStatus.CLOSING },
];
