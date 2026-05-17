import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ClampIntPipe implements PipeTransform<number, number> {
  constructor(private readonly min: number, private readonly max: number) {}

  transform(value: number): number {
    return Math.min(this.max, Math.max(this.min, value));
  }
}
