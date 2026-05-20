# Pickup / Delivery Flow — Design Spec

**Date:** 2026-05-19  
**Scope:** Kiosk web + Dashboard orders  
**Apps affected:** `apps/ui`, `apps/api-core`

---

## Resumen

Actualmente el kiosk web no permite al cliente indicar si quiere retirar su pedido en tienda o recibirlo a domicilio. Siempre se registra como `PICKUP`. Este spec cubre los cambios necesarios para que el cliente elija el tipo de entrega, capture sus datos de contacto y dirección, y que esa información sea visible para el staff en el dashboard.

---

## 1. Modelo de datos

### Migración Prisma — nuevos campos en `Order`

```prisma
model Order {
  // ... campos existentes ...
  customerPhone      String?   // teléfono del cliente
  deliveryAddress    String?   // dirección de entrega (requerida si orderType = DELIVERY)
  deliveryReferences String?   // referencias de entrega (opcional siempre)
}
```

Campos existentes que ya se usan:
- `customerEmail String?` — ya existe, se sigue usando
- `orderType String` — ya existe (`PICKUP` | `DELIVERY` | `DINE_IN`), pasa a ser enviado explícitamente desde el kiosk

---

## 2. API — `apps/api-core`

### `CreateOrderDto`

Agregar 3 campos nuevos opcionales:

```typescript
customerPhone?: string
deliveryAddress?: string
deliveryReferences?: string
```

`orderType` ya existe en el DTO; el kiosk ahora lo envía explícitamente en lugar de dejarlo en el default.

### Validaciones en backend

- Si `orderType === 'DELIVERY'` → `deliveryAddress` es requerida
- Al menos uno de `customerEmail` o `customerPhone` debe estar presente si alguno de los dos se envía (validación suave — el frontend lo garantiza, el backend lo valida como doble seguridad)

### `OrderDto` (respuesta)

Exponer los 3 campos nuevos en la respuesta:
```typescript
customerPhone: string | null
deliveryAddress: string | null
deliveryReferences: string | null
```

---

## 3. Kiosk UI — `apps/ui`

### Flujo actualizado

```
Menú → Carrito → [NUEVO: Tipo de entrega] → [NUEVO: Datos del cliente] → Método de pago → Confirmar
```

### Pantalla 1 — Tipo de entrega

- Dos opciones tipo radio list:
  - 🏪 **Retirar en tienda**
  - 🛵 **Envío a domicilio**
- Sin información de tiempos ni costos (se coordinan por WhatsApp)
- Botón "Siguiente →" — deshabilitado si ninguna opción está seleccionada
- Diseño responsive / mobile-first: opciones en columna, botón full-width

### Pantalla 2 — Datos del cliente

Varía según la selección anterior.

**Si eligió RETIRAR:**
- Campo de contacto inteligente (único input visual)
- Botón "Continuar →" / "← Volver"

**Si eligió ENVÍO:**
- Campo de contacto inteligente (único input visual)
- Campo Dirección (obligatorio)
- Campo Referencias (opcional)
- Botón "Continuar →" / "← Volver"

#### Campo de contacto inteligente

Un solo `<input>` a nivel de UI. Al perder foco (o al continuar), el frontend detecta el tipo:
- Contiene `@` → es email → se guarda en `customerEmail`
- Solo dígitos, `+`, espacios, guiones → es teléfono → se guarda en `customerPhone`

**Validaciones:**
- El campo no puede estar vacío
- Si es envío, la dirección no puede estar vacía

#### Consideraciones mobile
- Inputs con `font-size: 16px` mínimo (evita zoom automático en iOS)
- Botones con área de toque ≥ 44px
- Layout en columna única
- Sin scroll horizontal

### Store (`kiosk.store.ts`)

Agregar al estado del store:
```typescript
orderType: 'PICKUP' | 'DELIVERY'        // default: 'PICKUP'
customerPhone: string                    // capturado en pantalla 2
deliveryAddress: string                  // capturado en pantalla 2
deliveryReferences: string               // capturado en pantalla 2
```

El campo `customerEmail` ya existe en el store.

### Payload enviado a la API

```typescript
{
  items: [...],
  paymentMethod,
  orderType,            // 'PICKUP' | 'DELIVERY' — ahora explícito
  customerEmail,        // si el campo de contacto detectó email
  customerPhone,        // si el campo de contacto detectó teléfono
  deliveryAddress,      // solo si orderType === 'DELIVERY'
  deliveryReferences,   // solo si orderType === 'DELIVERY' y el usuario lo llenó
  expectedTotal,
}
```

---

## 4. Dashboard — `apps/ui`

### Order card

Sin cambios visuales al card existente. El badge de tipo (`Retirar` / `Envío`) ya se muestra.

### Modal de detalle del cliente

Se agrega un botón/ícono en la card para abrir el modal existente del proyecto con los datos del cliente del pedido.

**Contenido del modal:**

| Dato | Condición |
|------|-----------|
| Tipo de entrega | Siempre |
| Email | Si existe `customerEmail` |
| Teléfono | Si existe `customerPhone` |
| Dirección | Solo si `orderType === DELIVERY` |
| Referencias | Solo si existen |

El modal muestra solo los campos que tienen valor — no muestra filas vacías.

---

## 5. Fuera de alcance

- Cálculo de costo de envío
- Estimación de tiempos de entrega
- Integración con WhatsApp (el restaurante coordina manualmente)
- Filtros por tipo de entrega en el dashboard
- Historial de pedidos del cliente

---

## 6. Archivos afectados

### `apps/api-core`
| Archivo | Cambio |
|---------|--------|
| `prisma/schema.postgresql.prisma` | Agregar 3 campos a `Order` |
| `src/orders/dto/create-order.dto.ts` | Agregar 3 campos nuevos + validación |
| `src/orders/dto/order.dto.ts` | Exponer 3 campos en respuesta |
| `src/orders/order.repository.ts` | Mapear campos nuevos en queries |

### `apps/ui`
| Archivo | Cambio |
|---------|--------|
| `src/components/kiosk/store/kiosk.store.ts` | Agregar estado y lógica de nuevas pantallas |
| `src/components/kiosk/KioskApp.tsx` | Insertar 2 nuevas pantallas en el flujo |
| `src/components/kiosk/DeliveryTypeScreen.tsx` | Nuevo componente — pantalla 1 |
| `src/components/kiosk/CustomerDataScreen.tsx` | Nuevo componente — pantalla 2 |
| `src/lib/kiosk-api.ts` | Actualizar payload del pedido |
| `src/components/dash/orders/OrderCard.tsx` | Agregar botón para abrir modal |
| `src/components/dash/orders/OrderCustomerModal.tsx` | Nuevo componente — modal de datos |
