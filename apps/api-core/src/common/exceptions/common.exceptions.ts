import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

/**
 * Thrown when an entity is not found in the database.
 */
export class EntityNotFoundException extends BaseException {
  constructor(
    entityName: string,
    identifier: string | Record<string, unknown>,
  ) {
    const details =
      typeof identifier === 'string' ? { id: identifier } : identifier;

    super(`${entityName} not found`, HttpStatus.NOT_FOUND, 'ENTITY_NOT_FOUND', {
      entity: entityName,
      ...details,
    });
  }
}

/**
 * Thrown when validation fails.
 */
export class ValidationException extends BaseException {
  constructor(message: string, validationErrors?: Record<string, string[]>) {
    super(
      message,
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      validationErrors ? { errors: validationErrors } : undefined,
    );
  }
}

/**
 * Thrown when attempting to create a duplicate entity.
 */
export class DuplicateEntityException extends BaseException {
  constructor(entityName: string, field: string, value: string) {
    super(
      `${entityName} with ${field} '${value}' already exists`,
      HttpStatus.CONFLICT,
      'DUPLICATE_ENTITY',
      { entity: entityName, field, value },
    );
  }
}

/**
 * Thrown when an external service call fails.
 */
export class ExternalServiceException extends BaseException {
  constructor(serviceName: string, originalError?: string) {
    super(
      `External service '${serviceName}' failed`,
      HttpStatus.BAD_GATEWAY,
      'EXTERNAL_SERVICE_ERROR',
      { service: serviceName, originalError },
    );
  }
}
