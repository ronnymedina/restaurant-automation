import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsBigInt(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isBigInt',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'bigint';
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un BigInt válido`;
        },
      },
    });
  };
}

export function MinBigInt(min: bigint, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'minBigInt',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'bigint' && value >= min;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} no puede ser menor a ${min}`;
        },
      },
    });
  };
}
