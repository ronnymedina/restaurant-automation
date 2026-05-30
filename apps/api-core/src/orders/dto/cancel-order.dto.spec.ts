import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CancelOrderDto } from './cancel-order.dto';

describe('CancelOrderDto (H-35)', () => {
  it('rechaza reason vacío', async () => {
    const dto = plainToInstance(CancelOrderDto, { reason: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toMatch(/isNotEmpty/);
  });

  it('acepta reason en 500 chars exactos', async () => {
    const dto = plainToInstance(CancelOrderDto, { reason: 'a'.repeat(500) });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('rechaza reason de 501 chars', async () => {
    const dto = plainToInstance(CancelOrderDto, { reason: 'a'.repeat(501) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toMatch(/maxLength/);
  });
});
