import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * exceptionFactory para el ValidationPipe global.
 * Unifica el contrato de error (ver ADR 0007): los 400 de validación emiten
 *   { message: string[], code: 'VALIDATION_ERROR', statusCode: 400 }
 * tomando el control del body (se elimina el campo `error: "Bad Request"` de Nest).
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
  return new BadRequestException({
    message: messages,
    code: 'VALIDATION_ERROR',
    statusCode: 400,
  });
}
