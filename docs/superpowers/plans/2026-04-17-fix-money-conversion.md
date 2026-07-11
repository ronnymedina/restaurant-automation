# Fix Money Conversion (toCents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir `toCents` para que convierta pesos a centavos correctamente, agregar tests unitarios para los helpers de dinero, y documentar el proceso de conversión.

**Architecture:** El bug está en `toCents` que hace `BigInt(amount)` en vez de multiplicar por 100. El serializer `fromCents` divide por 100 correctamente al responder, pero los datos se guardan sin multiplicar. Un único cambio en `money.ts` corrige el flujo completo: DTO → DB → Response.

**Tech Stack:** NestJS, Prisma (BigInt), Jest, TypeScript

---

## Problema

### Síntoma
Al crear un producto con precio `300`, el backend devuelve `3`.

### Causa raíz
`toCents` en `src/common/helpers/money.ts` solo hace un wrap a BigInt sin multiplicar por 100:

```ts
// ACTUAL (roto):
export function toCents(amount: number): bigint {
  return BigInt(amount); // toCents(300) = 300n
}
```

El serializer `fromCents` divide correctamente por 100 al responder:
```ts
fromCents(300n) = 300 / 100 = 3  ❌
```

### Flujo correcto esperado
```
Frontend envía: 300 (pesos)
  → toCents(300) = 30000n (centavos en DB)
  → fromCents(30000n) = 300 (pesos en response)  ✓
```

### Impactos del bug
1. **Productos**: precio incorrecto al crear o editar
2. **Seed command**: `randomPrice()` devuelve decimales (ej. `12.5`) → `BigInt(12.5)` lanza `TypeError` en runtime
3. **Formulario de edición**: recibe `3` del API, el usuario ve `3` en el campo precio aunque pagó `300`

### Lo que NO cambia
- `fromCents` está correctamente implementado, no requiere modificación
- Los tests del service (`products.service.spec.ts`) pasan BigInt directamente simulando que el DTO ya transformó — no se ven afectados
- El frontend no necesita cambios: ya envía pesos decimales y recibe pesos decimales

---

## Archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|----------------|
| Crear | `apps/api-core/src/common/helpers/money.spec.ts` | Tests unitarios de `toCents` y `fromCents` |
| Modificar | `apps/api-core/src/common/helpers/money.ts` | Corregir `toCents` para multiplicar × 100 |
| Crear | `apps/api-core/docs/money-conversion.md` | Documentación del proceso de conversión |

---

## Task 1: Tests unitarios para money helpers (TDD Red)

**Files:**
- Create: `apps/api-core/src/common/helpers/money.spec.ts`

- [ ] **Step 1: Crear el archivo de tests**

```ts
// apps/api-core/src/common/helpers/money.spec.ts
import { toCents, fromCents } from './money';

describe('money helpers', () => {
  describe('toCents', () => {
    it('converts integer pesos to centavos BigInt', () => {
      expect(toCents(300)).toBe(30000n);
    });

    it('converts decimal pesos to centavos BigInt', () => {
      expect(toCents(12.5)).toBe(1250n);
    });

    it('converts zero to 0n', () => {
      expect(toCents(0)).toBe(0n);
    });

    it('rounds correctly to avoid float precision issues', () => {
      expect(toCents(0.1 + 0.2)).toBe(30n); // 0.1 + 0.2 = 0.30000...04
    });
  });

  describe('fromCents', () => {
    it('converts BigInt centavos to decimal pesos', () => {
      expect(fromCents(30000n)).toBe(300);
    });

    it('converts BigInt centavos with decimals', () => {
      expect(fromCents(1250n)).toBe(12.5);
    });

    it('converts number centavos (sqlite driver compat)', () => {
      expect(fromCents(1250)).toBe(12.5);
    });

    it('converts 0n to 0', () => {
      expect(fromCents(0n)).toBe(0);
    });
  });

  describe('round-trip', () => {
    it('toCents(fromCents(x)) is identity for valid centavo values', () => {
      expect(toCents(fromCents(30000n))).toBe(30000n);
    });

    it('fromCents(toCents(x)) is identity for valid peso values', () => {
      expect(fromCents(toCents(300))).toBe(300);
      expect(fromCents(toCents(12.5))).toBe(12.5);
    });
  });
});
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=money.spec
```

Esperado: FAIL — `toCents(300)` retorna `300n`, esperaba `30000n`

---

## Task 2: Corregir toCents (TDD Green)

**Files:**
- Modify: `apps/api-core/src/common/helpers/money.ts`

- [ ] **Step 1: Corregir la implementación**

Reemplazar el cuerpo completo de `money.ts`:

```ts
/**
 * Money helpers — BigInt cent strategy
 *
 * All monetary values are stored in the database as BigInt (centavos).
 * These helpers handle the conversion between the DB representation and
 * the human-readable decimal value used in DTOs and API responses.
 *
 * Rule of gold: NEVER use floating-point arithmetic for money calculations.
 * Always operate with BigInt centavos inside the domain layer.
 *
 * Convention:
 *   - API requests:  price in pesos (decimal) — e.g. 300 or 12.5
 *   - DB / domain:   price in centavos (BigInt) — e.g. 30000n or 1250n
 *   - API responses: price in pesos (decimal) — e.g. 300 or 12.5
 */

/**
 * Converts a peso decimal value to BigInt centavos for database storage.
 * Used in DTO @Transform decorators to convert incoming API request prices.
 *
 * @example toCents(300)  === 30000n  ($300 pesos)
 * @example toCents(12.5) === 1250n   ($12.50 pesos)
 * @example toCents(0)    === 0n
 */
export function toCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

/**
 * Converts a BigInt centavos value back to a human-readable decimal peso number.
 * Used ONLY in the serialization layer (API responses) — never for arithmetic.
 *
 * Accepts both `bigint` and `number` because the better-sqlite3 driver adapter
 * may return INTEGER columns as JavaScript `number` instead of `bigint`.
 *
 * @example fromCents(30000n) === 300
 * @example fromCents(1250n)  === 12.5
 * @example fromCents(1250)   === 12.5   (sqlite compat)
 * @example fromCents(0n)     === 0
 */
export function fromCents(cents: bigint | number): number {
  return Number(cents) / 100;
}
```

- [ ] **Step 2: Correr los tests para confirmar que pasan**

```bash
cd apps/api-core && pnpm test -- --testPathPattern=money.spec
```

Esperado: PASS — todos los casos de `toCents`, `fromCents` y round-trip

- [ ] **Step 3: Correr el suite completo para verificar que no rompió nada**

```bash
cd apps/api-core && pnpm test
```

Esperado: PASS — los tests de `products.service.spec.ts` y demás no deben romperse (pasan BigInt directamente, no usan `toCents`)

- [ ] **Step 4: Commit**

```bash
cd apps/api-core && git add src/common/helpers/money.ts src/common/helpers/money.spec.ts
git commit -m "fix(money): toCents now multiplies by 100 to correctly convert pesos to centavos"
```

---

## Task 3: Documentación de conversión de dinero

**Files:**
- Create: `apps/api-core/docs/money-conversion.md`

- [ ] **Step 1: Crear el documento**

Crear `apps/api-core/docs/money-conversion.md` con el contenido de la documentación (ver Task 3 detalle abajo — el contenido completo está en el plan de documentación).

El documento debe cubrir:
1. Por qué se usan centavos en la DB (precisión, sin floating-point)
2. Flujo completo: Request → DTO Transform → Service/DB → Serializer → Response
3. Las dos funciones con ejemplos
4. Reglas de uso (dónde usar cada función, qué nunca hacer)
5. Cómo agregar una nueva entidad con precio

```markdown
# Conversión de Dinero (Money Conversion)

## Por qué centavos en la base de datos

Los valores monetarios se almacenan como `BigInt` en centavos en la base de datos.
Esto evita errores de precisión de punto flotante (floating-point) en operaciones aritméticas.

```
0.1 + 0.2 === 0.30000000000000004  // ❌ JavaScript float
10n + 20n === 30n                  // ✓ BigInt centavos
```

## Flujo de conversión

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                        │
│  Envía: price = 300  (pesos, número decimal)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP Request (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DTO @Transform                                                  │
│  toCents(300) = 30000n  (pesos → centavos BigInt)               │
│  Archivo: src/common/helpers/money.ts                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVICE / BASE DE DATOS                                        │
│  price: 30000n  (centavos BigInt, Prisma BigInt column)         │
│  Schema: price BigInt @default(0)                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERIALIZER @Transform                                           │
│  fromCents(30000n) = 300  (centavos → pesos decimal)            │
│  Archivos: ProductSerializer, ProductListSerializer             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP Response (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                        │
│  Recibe: price = 300  (pesos, número decimal)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Las dos funciones

### `toCents(amount: number): bigint`
Convierte pesos decimales a centavos BigInt. Usar **únicamente en la capa de DTO** (decorador `@Transform`).

```ts
toCents(300)   // → 30000n  ($300 pesos)
toCents(12.5)  // → 1250n   ($12.50 pesos)
toCents(0)     // → 0n
```

### `fromCents(cents: bigint | number): number`
Convierte centavos BigInt a pesos decimales. Usar **únicamente en la capa de serialización**.
Acepta `number` además de `bigint` por compatibilidad con el driver SQLite (better-sqlite3).

```ts
fromCents(30000n) // → 300
fromCents(1250n)  // → 12.5
fromCents(1250)   // → 12.5  (compat SQLite driver)
```

## Reglas

| Regla | Razón |
|-------|-------|
| Nunca usar `parseFloat` o aritmética decimal con precios en el dominio | Errores de precisión |
| `toCents` solo en `@Transform` de DTOs | Conversión en el borde de entrada |
| `fromCents` solo en `@Transform` de Serializers | Conversión en el borde de salida |
| No pasar `price` como `number` entre Service, Repository y dominio | El dominio siempre opera en BigInt |
| El frontend siempre envía y recibe en pesos (número decimal) | El backend oculta la implementación de centavos |

## Agregar precio a una nueva entidad

1. Declarar el campo como `BigInt` en el schema Prisma:
   ```prisma
   price BigInt @default(0)
   ```

2. En el DTO de creación/actualización:
   ```ts
   @Transform(({ value }) => {
     if (typeof value === 'number') return toCents(value);
     return value;
   })
   @IsBigInt()
   price: bigint;
   ```

3. En el Serializer:
   ```ts
   @Transform(({ value }) => fromCents(value as bigint | number))
   @Expose()
   price: number;
   ```
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/docs/money-conversion.md
git commit -m "docs(api-core): add money-conversion guide explaining cents strategy and conversion flow"
```
