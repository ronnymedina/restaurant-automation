import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class CashRegisterAlreadyOpenException extends BaseException {
  constructor() {
    super(
      'A cash register session is already open',
      HttpStatus.CONFLICT,
      'CASH_REGISTER_ALREADY_OPEN',
    );
  }
}

export class CashRegisterNotFoundException extends BaseException {
  constructor(sessionId: string) {
    super(
      `Cash register session '${sessionId}' not found`,
      HttpStatus.NOT_FOUND,
      'CASH_REGISTER_NOT_FOUND',
      { sessionId },
    );
  }
}

export class NoOpenCashRegisterException extends BaseException {
  constructor() {
    super(
      'No cash register session is currently open',
      HttpStatus.CONFLICT,
      'NO_OPEN_CASH_REGISTER',
    );
  }
}

export class PendingOrdersException extends BaseException {
  constructor(pendingCount: number) {
    super(
      `Cannot close register: ${pendingCount} pending order(s) must be completed or cancelled first`,
      HttpStatus.CONFLICT,
      'PENDING_ORDERS_ON_SHIFT',
      { pendingCount },
    );
  }
}
