import { HttpStatus } from '@nestjs/common';
import { BaseException } from '../../common/exceptions';

export class OrderNotFoundException extends BaseException {
  constructor(orderId: string) {
    super(
      `Order '${orderId}' not found`,
      HttpStatus.NOT_FOUND,
      'ORDER_NOT_FOUND',
      { orderId },
    );
  }
}

export class StockInsufficientException extends BaseException {
  constructor(productName: string, available: number, requested: number) {
    super(
      `Insufficient stock for '${productName}'. Available: ${available}, requested: ${requested}`,
      HttpStatus.CONFLICT,
      'STOCK_INSUFFICIENT',
      { productName, available, requested },
    );
  }
}

export class RegisterNotOpenException extends BaseException {
  constructor() {
    super(
      'No register session is currently open. Open a register before creating orders.',
      HttpStatus.CONFLICT,
      'REGISTER_NOT_OPEN',
    );
  }
}

export class InvalidStatusTransitionException extends BaseException {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition order from '${currentStatus}' to '${targetStatus}'`,
      HttpStatus.BAD_REQUEST,
      'INVALID_STATUS_TRANSITION',
      { currentStatus, targetStatus },
    );
  }
}
