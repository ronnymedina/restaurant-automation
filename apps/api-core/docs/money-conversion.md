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
