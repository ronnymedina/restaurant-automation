import { PaymentMethod } from '@prisma/client';
import { CreateOrderData } from './order.repository';

describe('CreateOrderData (H-21)', () => {
  it('paymentMethod debe ser PaymentMethod | undefined, no string libre', () => {
    const valid: CreateOrderData['paymentMethod'] = PaymentMethod.CASH;
    const empty: CreateOrderData['paymentMethod'] = undefined;
    expect(valid).toBe(PaymentMethod.CASH);
    expect(empty).toBeUndefined();
    // @ts-expect-error — string arbitrario no debe ser asignable
    const invalid: CreateOrderData['paymentMethod'] = 'INVALID_METHOD';
    expect(invalid).toBe('INVALID_METHOD');
  });
});
