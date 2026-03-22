import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class ReservationNotFoundException extends BaseException {
  constructor(id: string) {
    super(
      `Reservation '${id}' not found`,
      HttpStatus.NOT_FOUND,
      'RESERVATION_NOT_FOUND',
      { id },
    );
  }
}

export class ReservationTableInactiveException extends BaseException {
  constructor(tableId: string) {
    super(
      `Table '${tableId}' is inactive and cannot accept reservations`,
      HttpStatus.BAD_REQUEST,
      'TABLE_INACTIVE',
      { tableId },
    );
  }
}

export class ReservationCapacityExceededException extends BaseException {
  constructor(partySize: number, capacity: number) {
    super(
      `Party size (${partySize}) exceeds table capacity (${capacity})`,
      HttpStatus.CONFLICT,
      'CAPACITY_EXCEEDED',
      { partySize, capacity },
    );
  }
}

export class ReservationTimeOverlapException extends BaseException {
  constructor(existingStart: Date, existingEnd: Date) {
    super(
      `Time slot conflicts with existing reservation from ${existingStart.toISOString()} to ${existingEnd.toISOString()}`,
      HttpStatus.CONFLICT,
      'RESERVATION_TIME_OVERLAP',
      { existingStart, existingEnd },
    );
  }
}

export class ReservationInvalidStatusTransitionException extends BaseException {
  constructor(current: string, target: string) {
    super(
      `Cannot transition reservation from '${current}' to '${target}'`,
      HttpStatus.BAD_REQUEST,
      'INVALID_STATUS_TRANSITION',
      { current, target },
    );
  }
}
