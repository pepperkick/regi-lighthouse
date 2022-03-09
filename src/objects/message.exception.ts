import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MessageType } from './message-types.enum';

export class MessageException extends Error {
  message = '';
  type;

  constructor(message: string, type: MessageType) {
    super(message);
    this.message = message;
    this.type = type;
  }
}

export class WarningMessage extends MessageException {
  constructor(message: string) {
    super(message, MessageType.WARNING);
  }
}
export class ErrorMessage extends MessageException {
  constructor(message: string) {
    super(message, MessageType.ERROR);
  }
}
