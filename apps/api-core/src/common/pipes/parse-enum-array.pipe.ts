import { Injectable, BadRequestException, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseEnumArrayPipe implements PipeTransform {
  constructor(private readonly enumType: object) {}

  transform(value: string | string[] | undefined): string[] | undefined {
    if (value === undefined || value === null) return undefined;

    const raw = Array.isArray(value) ? value : [value];
    const valid = Object.values(this.enumType) as string[];
    const result: string[] = [];

    for (const v of raw) {
      if (!valid.includes(v)) {
        throw new BadRequestException(`Invalid enum value: ${v}`);
      }
      if (!result.includes(v)) result.push(v);
    }

    return result.length ? result : undefined;
  }
}
