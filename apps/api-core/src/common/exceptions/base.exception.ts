import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception class for all custom exceptions.
 * Provides a consistent error response structure across the application.
 *
 * Contrato de error unificado (ver ADR 0007):
 *   { message: string[], code: string, statusCode: number, details?: object }
 * `message` es SIEMPRE un array (aquí, de un elemento) para igualar la forma
 * de los errores de validación, que devuelven varios mensajes.
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
        message: [message],
        code,
        details,
        statusCode,
      },
      statusCode,
    );
  }
}
