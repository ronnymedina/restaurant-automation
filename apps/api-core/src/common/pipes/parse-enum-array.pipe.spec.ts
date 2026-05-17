import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { ParseEnumArrayPipe } from './parse-enum-array.pipe';

describe('ParseEnumArrayPipe', () => {
  let pipe: ParseEnumArrayPipe;

  beforeEach(() => {
    pipe = new ParseEnumArrayPipe(OrderStatus);
  });

  it('returns undefined when value is undefined', () => {
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('wraps a single valid string in a one-element array', () => {
    expect(pipe.transform('CREATED')).toEqual(['CREATED']);
  });

  it('passes through an array of valid values', () => {
    expect(pipe.transform(['CREATED', 'PROCESSING'])).toEqual(['CREATED', 'PROCESSING']);
  });

  it('deduplicates repeated values', () => {
    expect(pipe.transform(['CREATED', 'CREATED'])).toEqual(['CREATED']);
  });

  it('throws BadRequestException for an invalid single value', () => {
    expect(() => pipe.transform('INVALID')).toThrow(BadRequestException);
  });

  it('throws BadRequestException when one value in the array is invalid', () => {
    expect(() => pipe.transform(['CREATED', 'INVALID'])).toThrow(BadRequestException);
  });
});
