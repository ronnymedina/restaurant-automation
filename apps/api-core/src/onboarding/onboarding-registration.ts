/**
 * Determina si el registro público de onboarding está abierto.
 * En modo single-restaurant, se cierra una vez que existe al menos un restaurante;
 * el primer registro (count 0) sigue permitido. Con el flag apagado, siempre abierto.
 */
export function registrationOpen(singleRestaurantMode: boolean, restaurantCount: number): boolean {
  return !(singleRestaurantMode && restaurantCount >= 1);
}
