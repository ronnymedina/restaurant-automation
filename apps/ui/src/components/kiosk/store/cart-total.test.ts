import { describe, it, expect } from 'vitest';
import { cartTotalCents } from './cart-total';

describe('cartTotalCents', () => {
  it('suma precios enteros por cantidad (precios en pesos → centavos)', () => {
    // 1000 pesos → 100000 cts × 2 = 200000 ; 500 pesos → 50000 cts × 1 = 50000
    expect(cartTotalCents([{ price: 1000, quantity: 2 }, { price: 500, quantity: 1 }])).toBe(250000);
  });

  it('redondea cada precio fraccionario a centavos enteros antes de sumar', () => {
    // 12.34 * 100 = 1234 ; 0.99 * 100 = 99
    expect(cartTotalCents([{ price: 12.34, quantity: 3 }, { price: 0.99, quantity: 5 }])).toBe(4197);
  });

  it('no acumula error de float en carritos grandes', () => {
    const cart = Array.from({ length: 1000 }, () => ({ price: 10.1, quantity: 1 }));
    expect(cartTotalCents(cart)).toBe(1010 * 1000);
  });

  it('devuelve 0 para carrito vacío', () => {
    expect(cartTotalCents([])).toBe(0);
  });
});
