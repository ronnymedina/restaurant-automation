import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OnboardingRegisterDto } from './onboarding-register.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(OnboardingRegisterDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

const valid = {
  email: 'owner@test.com',
  restaurantName: 'Mi Restaurante',
  timezone: 'America/Santiago',
  country: 'CL',
};

describe('OnboardingRegisterDto', () => {
  it('acepta un payload válido (incluye country, decimalSeparator opcional)', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
    expect(await errorsFor({ ...valid, decimalSeparator: '.' })).toHaveLength(0);
  });

  it('rechaza country ausente', async () => {
    const { country, ...withoutCountry } = valid;
    const msgs = await errorsFor(withoutCountry);
    expect(msgs.some((m) => /country/i.test(m))).toBe(true);
  });

  it('rechaza country fuera de la lista LatAm', async () => {
    const msgs = await errorsFor({ ...valid, country: 'US' });
    expect(msgs).toContain('country must be a supported LATAM ISO code');
  });

  it('rechaza decimalSeparator inválido', async () => {
    const msgs = await errorsFor({ ...valid, decimalSeparator: ';' });
    expect(msgs).toContain('decimalSeparator must be "." or ","');
  });

  it('mensajes en inglés para email inválido', async () => {
    const msgs = await errorsFor({ ...valid, email: 'no-email' });
    expect(msgs).toContain('email must be valid');
  });
});
