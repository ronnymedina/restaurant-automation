import type { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation-exception.factory';

describe('validationExceptionFactory', () => {
  it('produce un body con message:string[], code y statusCode, sin "error"', () => {
    const errors: ValidationError[] = [
      { property: 'email', constraints: { isEmail: 'email must be valid' } } as ValidationError,
      { property: 'country', constraints: { isIn: 'country must be a supported LATAM ISO code' } } as ValidationError,
    ];

    const ex = validationExceptionFactory(errors);
    const body = ex.getResponse() as Record<string, unknown>;

    expect(ex.getStatus()).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toEqual(['email must be valid', 'country must be a supported LATAM ISO code']);
    expect(body.statusCode).toBe(400);
    expect(body.error).toBeUndefined();
  });

  it('maneja errores sin constraints (array vacío de mensajes)', () => {
    const ex = validationExceptionFactory([{ property: 'x' } as ValidationError]);
    const body = ex.getResponse() as Record<string, unknown>;
    expect(body.message).toEqual([]);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
