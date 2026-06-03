import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import cc from 'currency-codes';

@ValidatorConstraint({ name: 'IsValidCurrencyCode', async: false })
class IsValidCurrencyCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    if (value !== value.toUpperCase()) return false;
    const currency = cc.code(value);
    if (!currency) return false;
    // Exclude special codes like XXX (no currency)
    if (value === 'XXX') return false;
    return true;
  }

  defaultMessage(): string {
    return 'currency debe ser un código ISO 4217 válido (ej: USD, CLP, EUR)';
  }
}

export function IsValidCurrencyCode(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsValidCurrencyCodeConstraint,
    });
  };
}
