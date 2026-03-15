import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class TableNotFoundException extends BaseException {
  constructor(tableId: string) {
    super(
      `Table '${tableId}' not found`,
      HttpStatus.NOT_FOUND,
      'TABLE_NOT_FOUND',
      { tableId },
    );
  }
}

export class TableHasFutureReservationsException extends BaseException {
  constructor(tableId: string) {
    super(
      `Table '${tableId}' has future reservations and cannot be deleted`,
      HttpStatus.CONFLICT,
      'TABLE_HAS_FUTURE_RESERVATIONS',
      { tableId },
    );
  }
}
