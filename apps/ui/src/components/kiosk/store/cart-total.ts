/**
 * Suma el total del carrito en centavos enteros, espejando el cálculo del backend
 * (que opera en bigint centavos, audit R2-06). Cada precio en pesos se convierte a
 * centavos con un único Math.round por ítem para no acumular error de punto flotante.
 */
export function cartTotalCents(cart: { price: number; quantity: number }[]): number {
  return cart.reduce((sum, c) => sum + Math.round(c.price * 100) * c.quantity, 0);
}
