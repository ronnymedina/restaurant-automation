import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateOrderDto, CreateOrderItemDto } from './create-order.dto';

// H-03 regression — defense in depth. Frontend (kitchen renderer) is the
// primary fix; these bounds limit blast radius if any consumer ever drops
// the escape and also bound DoS via huge payloads.

async function findError<T extends object>(dto: T, property: string) {
  const errors = await validate(dto);
  return errors.find((e) => e.property === property);
}

describe('CreateOrderItemDto — notes length', () => {
  it('accepts notes up to 500 chars', async () => {
    const dto = plainToInstance(CreateOrderItemDto, {
      productId: 'p1',
      quantity: 1,
      notes: 'x'.repeat(500),
    });
    expect(await findError(dto, 'notes')).toBeUndefined();
  });

  it('rejects notes over 500 chars', async () => {
    const dto = plainToInstance(CreateOrderItemDto, {
      productId: 'p1',
      quantity: 1,
      notes: 'x'.repeat(501),
    });
    const err = await findError(dto, 'notes');
    expect(err?.constraints).toHaveProperty('maxLength');
  });

  it('accepts missing notes', async () => {
    const dto = plainToInstance(CreateOrderItemDto, { productId: 'p1', quantity: 1 });
    expect(await findError(dto, 'notes')).toBeUndefined();
  });
});

describe('CreateOrderDto — free-text caps', () => {
  const baseValid = { items: [{ productId: 'p1', quantity: 1 }] };

  it.each([
    ['customerName', 200],
    ['customerPhone', 30],
    ['deliveryReferences', 500],
    ['tableNumber', 20],
  ])('rejects %s over %d chars', async (field, limit) => {
    const dto = plainToInstance(CreateOrderDto, { ...baseValid, [field]: 'x'.repeat(limit + 1) });
    const err = await findError(dto, field);
    expect(err?.constraints).toHaveProperty('maxLength');
  });

  it.each([
    ['customerName', 200],
    ['customerPhone', 30],
    ['deliveryReferences', 500],
    ['tableNumber', 20],
  ])('accepts %s of exactly %d chars', async (field, limit) => {
    const dto = plainToInstance(CreateOrderDto, { ...baseValid, [field]: 'x'.repeat(limit) });
    expect(await findError(dto, field)).toBeUndefined();
  });

  it('rejects customerEmail over 254 chars', async () => {
    // RFC-compliant email shape (local <= 64, labels <= 63) intentionally > 254 chars total.
    const local = 'a'.repeat(60);
    const label = 'b'.repeat(60);
    const tooLong = `${local}@${label}.${label}.${label}.com`; // 60+1+60+1+60+1+60+4 = 247... bump
    const padded = `${tooLong}${'.com'.repeat(3)}`; // ensure > 254
    expect(padded.length).toBeGreaterThan(254);
    const dto = plainToInstance(CreateOrderDto, { ...baseValid, customerEmail: padded });
    const err = await findError(dto, 'customerEmail');
    expect(err?.constraints).toHaveProperty('maxLength');
  });

  it('rejects deliveryAddress over 500 chars when orderType=DELIVERY', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...baseValid,
      orderType: 'DELIVERY',
      deliveryAddress: 'x'.repeat(501),
    });
    const err = await findError(dto, 'deliveryAddress');
    expect(err?.constraints).toHaveProperty('maxLength');
  });
});
