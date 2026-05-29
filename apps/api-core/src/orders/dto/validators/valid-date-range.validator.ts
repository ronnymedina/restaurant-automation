import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

const MAX_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@ValidatorConstraint({ name: 'ValidDateRange', async: false })
export class ValidDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { dateFrom?: string; dateTo?: string };
    if (!obj.dateFrom || !obj.dateTo) return true;

    const from = Date.parse(obj.dateFrom);
    const to = Date.parse(obj.dateTo);
    if (Number.isNaN(from) || Number.isNaN(to)) return true; // @Matches se encarga

    if (from > to) return false;
    if ((to - from) / MS_PER_DAY > MAX_DAYS) return false;
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as { dateFrom?: string; dateTo?: string };
    if (!obj.dateFrom || !obj.dateTo) return '';
    const from = Date.parse(obj.dateFrom);
    const to = Date.parse(obj.dateTo);
    if (from > to) return 'dateFrom debe ser menor o igual a dateTo';
    return `el rango de fechas no puede exceder ${MAX_DAYS} días`;
  }
}

export function ValidDateRange(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: ValidDateRangeConstraint,
    });
  };
}
