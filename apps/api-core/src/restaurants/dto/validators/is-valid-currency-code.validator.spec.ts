import { validate } from 'class-validator';
import { IsValidCurrencyCode } from './is-valid-currency-code.validator';

class Wrapper {
  @IsValidCurrencyCode()
  currency!: string;
}

const validateValue = async (value: string) => {
  const w = new Wrapper();
  w.currency = value;
  return validate(w);
};

describe('IsValidCurrencyCode', () => {
  it('accepts a valid ISO 4217 code (USD)', async () => {
    expect(await validateValue('USD')).toHaveLength(0);
  });

  it('accepts CLP', async () => {
    expect(await validateValue('CLP')).toHaveLength(0);
  });

  it('rejects an unassigned code (XXX)', async () => {
    const errors = await validateValue('XXX');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('IsValidCurrencyCode');
  });

  it('rejects lowercase (usd)', async () => {
    const errors = await validateValue('usd');
    expect(errors).toHaveLength(1);
  });

  it('rejects empty string', async () => {
    const errors = await validateValue('');
    expect(errors).toHaveLength(1);
  });
});
