import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception class for all custom exceptions.
 * Provides a consistent error response structure across the application.
 */
export class BaseException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(
      {
        message,
        code,
        details,
        statusCode,
      },
      statusCode,
    );
  }
}
