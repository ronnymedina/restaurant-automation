import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class CashRegisterAlreadyOpenException extends BaseException {
  constructor() {
    super(
      'A register session is already open',
      HttpStatus.CONFLICT,
      'REGISTER_ALREADY_OPEN',
    );
  }
}

export class CashRegisterNotFoundException extends BaseException {
  constructor(sessionId: string) {
    super(
      `Register session '${sessionId}' not found`,
      HttpStatus.NOT_FOUND,
      'REGISTER_NOT_FOUND',
      { sessionId },
    );
  }
}

export class NoOpenCashRegisterException extends BaseException {
  constructor() {
    super(
      'No register session is currently open',
      HttpStatus.CONFLICT,
      'NO_OPEN_REGISTER',
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
