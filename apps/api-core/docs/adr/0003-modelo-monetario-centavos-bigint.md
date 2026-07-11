# ADR 0003 — Modelo monetario: centavos (BigInt) y currency-agnostic

**Estado:** Aceptado
**Fecha:** 2026-06-13

## Contexto

Los tipos flotantes (`float`, `number` de JS) no son adecuados para aritmética monetaria:
`0.1 + 0.2 !== 0.3`. Usar `Decimal` de Prisma introduce fricción en TypeScript y potencial
pérdida de precisión en la serialización JSON. Se necesita un modelo simple que funcione
para múltiples monedas sin requerir la tabla de `minor_unit` de ISO 4217.

## Decisión

Todos los montos se almacenan como **`BigInt` en centavos** (factor ×100 fijo).

- **Conversión solo en los bordes:**
  - Entrada (cliente → API): `toCents` via `@Transform` en los DTOs de entrada.
  - Salida (API → cliente): `fromCents` via `@Transform` en los serializers de respuesta.
- **El dominio nunca opera en decimal**: cálculos, comparaciones y persistencia siempre
  trabajan con enteros `BigInt`.
- **JSON expone números** (no `BigInt`): la serialización convierte a `number` de JS en la
  capa de respuesta.
- **Currency-agnostic**: siempre 2 decimales internos, sin respetar `minor_unit` de ISO 4217.
  El campo `currency` en `RestaurantSettings` es únicamente una etiqueta de display
  (ver ADR 0004).

## Consecuencias positivas

- Sin errores de coma flotante en ninguna operación del dominio.
- El frontend siempre envía y recibe montos en pesos (decimales); la conversión es
  transparente y está centralizada.
- Compatibilidad natural con PostgreSQL `BigInt` nativo (ver ADR 0002).

## Consecuencias negativas

- Una moneda sin decimales (CLP, JPY) se almacena y renderiza igualmente con 2 decimales.
  Ocultar los decimales en la UI sería un cambio futuro exclusivo de la capa de presentación,
  sin tocar el modelo de datos.
- El sistema asume siempre factor ×100; monedas con 3 decimales (KWD, BHD) no están
  soportadas.

## Alternativas consideradas

- **`Decimal` de Prisma** (rechazado): genera fricciones en TypeScript, la serialización
  a JSON requiere conversión manual y no elimina el riesgo de pérdida de precisión en la
  frontera JS.
- **Floats nativos** (descartado): error de representación conocido; inaceptable para
  aritmética de dinero.

## Referencias

- Guía de implementación: `apps/api-core/docs/money-conversion.md`.
- Guía de presentación en UI: `apps/ui/docs/money-formatting.md`.
- Helper de conversión: `src/common/helpers/money.ts`.
- Auditorías relacionadas: R2-10, R2-06, H-01.
- Presentación localizada de los montos: ADR 0004.
