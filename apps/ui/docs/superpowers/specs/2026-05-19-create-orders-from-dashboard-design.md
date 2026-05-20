# Crear Pedidos desde el Dashboard — Design Spec

**Fecha:** 2026-05-19
**Branch:** create-orders-from-dashboard
**Apps afectadas:** `apps/api-core`, `apps/ui`

---

## Resumen

El staff (ADMIN/MANAGER) puede crear pedidos directamente desde el dashboard sin depender del kiosk público. Esto resuelve dos casos reales:

1. **Clientes que no usan el kiosk** (adultos mayores, etc.) — el cajero toma el pedido manualmente.
2. **Productos fuera del menú público** — el staff puede agregar cualquier producto del catálogo sin tener que agregarlo a un menú primero.

---

## 1. Modelo de datos

### Sin migraciones

Todos los campos necesarios ya existen en la BD tras la migración de pickup/delivery flow (`develop`):

```
Order.customerName       String?   ✅ ya existe
Order.customerPhone      String?   ✅ ya existe
Order.deliveryAddress    String?   ✅ ya existe
Order.deliveryReferences String?   ✅ ya existe
Order.tableNumber        String?   ✅ ya existía
Order.orderType          String    ✅ ya existía (PICKUP | DINE_IN | DELIVERY)
Order.orderSource        String    ✅ ya existía (KIOSK | WEB | STAFF)
Order.paymentMethod      PaymentMethod? ✅ ya es nullable
```

### OrderItem y menuItemId

`OrderItem.menuItemId` es `String?` — ya acepta `null`. Pedidos del dashboard no están asociados a un menú, por lo que `menuItemId: null` es el comportamiento correcto.

El `unitPrice` siempre se toma de `product.price` (el campo `MenuItem.priceOverride` no existe en el schema actual — está deprecado y eliminado).

### Comportamiento de orderSource STAFF

Cuando `orderSource === 'STAFF'`, el servicio asigna `initialStatus: CONFIRMED` automáticamente (lógica existente en `orders.service.ts`). El pedido salta directamente a `CONFIRMED`, omitiendo `CREATED`.

---

## 2. Backend — `apps/api-core`

### 2.1 Nuevo endpoint: `POST /v1/orders`

Expuesto en `OrdersController`. Requiere un nuevo método en `OrdersService` para encapsular la búsqueda del turno abierto.

```
POST /v1/orders
Auth:  Bearer JWT
Roles: ADMIN | MANAGER  (hereda @Roles del controller — sin override)
Body:  CreateOrderDto (sin cambios)
```

**Nuevo método en `OrdersService`:** `createStaffOrder(restaurantId, dto)`:
1. Llama a `CashShiftRepository.findOpen(restaurantId)` (ya inyectado en el servicio).
2. Lanza `RegisterNotOpenException` (409) si no hay turno abierto.
3. Llama a `this.createOrder(restaurantId, shift.id, { ...dto, orderSource: 'STAFF' })`.
4. `orderSource: 'STAFF'` lo fija el servicio — el cliente no puede sobreescribirlo aunque lo envíe en el body.
5. Retorna `{ order, receipt: null, kitchenTicket: null }`.

**Validaciones del DTO existentes que aplican:**
- `items` no vacío
- `orderType: DELIVERY` requiere `deliveryAddress`
- `paymentMethod` opcional (puede omitirse — se asigna al cobrar)

### 2.2 Cambio en `PATCH /v1/orders/:id/pay`

Se agrega un body opcional para registrar el método de pago al cobrar:

```typescript
// Nuevo DTO
class MarkOrderPaidDto {
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;  // CASH | CARD | DIGITAL_WALLET únicamente
}
```

**Comportamiento:**
- Si se envía `paymentMethod`, se actualiza el campo en la orden.
- Si no se envía, `paymentMethod` queda como estaba (null o el valor original).
- Solo acepta los valores del enum — cualquier otro valor retorna 400.

**Cambios necesarios:**
- `OrderRepository.markAsPaid(id, paymentMethod?)` — agregar param opcional.
- `OrdersService.markAsPaid(id, restaurantId, paymentMethod?)` — pasar al repositorio.
- `OrdersController.markAsPaid` — recibir body `MarkOrderPaidDto`.

### 2.3 Módulos afectados en module.info

| Archivo | Actualización |
|---|---|
| `orders.module.info.md` | Agregar `POST /v1/orders` con casos E2E; actualizar `PATCH /:id/pay` con body opcional; corregir nota que dice "la creación la hace el módulo kiosk"; agregar campos `customerName`, `customerPhone`, `deliveryAddress`, `deliveryReferences` al `OrderDto` |
| `kiosk.module.info.md` | Actualizar ejemplo JSON de respuesta de creación con campos nuevos |

---

## 3. Frontend — `apps/ui`

### 3.1 Dependencias nuevas

```bash
# Instalar dentro del contenedor
docker compose exec res-ui pnpm add react-hook-form @hookform/resolvers

# Luego copiar el lock file actualizado al local
docker compose cp res-ui:/app/pnpm-lock.yaml apps/ui/pnpm-lock.yaml
```

### 3.2 Jerarquía de componentes

```
OrdersPanel                          (existente — agrega botón + monta modal)
└── CreateOrderModal                 (modal principal, controla step actual)
    ├── StepIndicator                (visual "Paso 1 / 2" — sin estado propio)
    │
    ├── CreateOrderStep1             (step === 1)
    │   ├── ProductSearchInput       (input con debounce 300ms)
    │   ├── ProductGrid              (grid de resultados)
    │   │   └── ProductCard[]        (imagen, nombre, precio, botón +)
    │   │       └── [badge Agotado]  (condicional si stock === 0)
    │   └── Cart                     (visible si items.length > 0)
    │       ├── CartItem[]           (nombre, input cantidad, subtotal, botón ×)
    │       └── CartFooter           (total acumulado + botón "Siguiente →")
    │
    └── CreateOrderStep2             (step === 2, react-hook-form context)
        ├── OrderTypeSelector        (PICKUP | DINE_IN | DELIVERY)
        ├── DineInFields             (condicional: orderType === DINE_IN)
        │   └── tableNumber input
        ├── CustomerFields           (siempre visible)
        │   ├── customerName input
        │   └── customerPhone input
        ├── DeliveryFields           (condicional: orderType === DELIVERY)
        │   ├── deliveryAddress input
        │   └── deliveryReferences input
        └── Step2Footer              (botón "← Volver" + botón "Confirmar pedido")
```

**Flujo de estado entre componentes:**

```
create-order-store.ts (Zustand)
  ├── Escribe: ProductCard.onAdd → addItem()
  ├── Escribe: CartItem.onChangeQty → updateQuantity()
  ├── Escribe: CartItem.onRemove → removeItem()
  ├── Lee:    Cart (items[], total)
  ├── Lee:    CartFooter (items.length para habilitar "Siguiente")
  └── Escribe: CreateOrderModal.onClose → reset()

react-hook-form (solo CreateOrderStep2)
  ├── Schema: step2Schema (Zod + superRefine condicional)
  ├── Controla: todos los inputs del Step 2
  └── onSubmit → lee store (items) + form values → POST /v1/orders

@tanstack/react-query (ProductSearchInput)
  └── queryKey: ['products', searchTerm]
      └── GET /v1/products?search=…&limit=20
          (cacheado — no re-fetcha al volver del Step 2)
```

**Archivos nuevos:**

```
apps/ui/src/components/dash/orders/
├── CreateOrderModal.tsx
├── CreateOrderStep1.tsx
├── CreateOrderStep2.tsx
├── create-order-store.ts
└── create-order-api.ts
```

### 3.3 Cambio en OrdersPanel.tsx

Agregar botón **"Nuevo pedido"** visible solo cuando `status === ORDERS_STATUS.OPEN`. Al hacer click abre `CreateOrderModal`. Al confirmar el pedido, recargar la lista de órdenes.

### 3.4 Zustand store (`create-order-store.ts`)

```typescript
interface CartItem {
  productId: string;
  name: string;
  price: number;       // product.price en pesos
  imageUrl: string | null;
  quantity: number;
}

interface CreateOrderState {
  // Step 1
  items: CartItem[];
  addItem: (product) => void;     // incrementa si ya existe
  removeItem: (productId) => void;
  updateQuantity: (productId, qty) => void;
  reset: () => void;              // llamar al cerrar el modal

  // Step 2
  orderType: 'PICKUP' | 'DINE_IN' | 'DELIVERY';
  tableNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryReferences: string;
}
```

### 3.5 Paso 1 — Búsqueda de productos

- Input de búsqueda con debounce 300ms → `GET /v1/products?search=texto&limit=20`.
- Resultado cacheado con `@tanstack/react-query` (ya instalado) — sin re-fetch al volver del Paso 2.
- Grid de cards: imagen, nombre, precio, botón `+`. Si `stock === 0`, badge "Agotado" y botón deshabilitado.
- Carrito visible debajo del grid: lista de ítems con cantidad editable (input numérico) y subtotal por ítem.
- Botón "Siguiente →" deshabilitado si el carrito está vacío.

### 3.6 Paso 2 — Datos del pedido

Gestionado con `react-hook-form` + `zodResolver`. Schema Zod con campos condicionales:

```typescript
const step2Schema = z.object({
  orderType: z.enum(['PICKUP', 'DINE_IN', 'DELIVERY']),
  tableNumber: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  deliveryAddress: z.string().optional(),
  deliveryReferences: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.orderType === 'DINE_IN' && !data.tableNumber?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['tableNumber'], message: 'Número de mesa requerido' });
  }
  if (data.orderType === 'DELIVERY' && !data.deliveryAddress?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'Dirección requerida' });
  }
});
```

Campos visibles según `orderType`:

| Campo | DINE_IN | PICKUP | DELIVERY |
|---|---|---|---|
| Tipo de entrega (selector) | ✅ | ✅ | ✅ |
| Número de mesa | requerido | — | — |
| Nombre del cliente | opcional | opcional | opcional |
| Teléfono | opcional | opcional | opcional |
| Dirección de entrega | — | — | requerido |
| Referencias | — | — | opcional |

**Método de pago:** no se solicita en el modal — se asigna después al marcar como pagado.

### 3.7 Al confirmar

1. Construir `CreateOrderDto` desde el store + form:
   ```typescript
   {
     items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
     orderType,
     tableNumber,        // solo si DINE_IN
     customerName,
     customerPhone,
     customerEmail,
     deliveryAddress,    // solo si DELIVERY
     deliveryReferences, // solo si DELIVERY
     // orderSource: 'STAFF' — lo fuerza el backend, no se envía desde el cliente
     // paymentMethod: omitido — se asigna al cobrar
     // expectedTotal: omitido — no aplica para pedidos del staff
   }
   ```
2. `POST /v1/orders`.
3. Si OK: cerrar modal, resetear store, recargar órdenes, toast `"Pedido #${orderNumber} creado"`.
4. Si error: toast con mensaje del error (ej. "Sin stock suficiente para Sopa del día").

---

## 4. Flujo de negocio completo

```mermaid
flowchart TD
    A([Staff abre modal\n"Nuevo pedido"]) --> B[Busca producto por texto\nGET /v1/products?search=…]
    B --> C[Agrega productos al carrito\nZustand store · addItem]

    C --> D{¿Carrito vacío?}
    D -- Sí --> E[Botón 'Siguiente' deshabilitado\nUI validation]
    E --> C
    D -- No --> F

    subgraph PASO2 ["Paso 2 — Datos del pedido"]
        F[Selecciona tipo de entrega\nPICKUP · DINE_IN · DELIVERY]
        F --> G{Validación Zod\nreact-hook-form}
        G -- DINE_IN sin mesa --> H[Error: Número de mesa requerido]
        G -- DELIVERY sin dirección --> I[Error: Dirección requerida]
        H --> F
        I --> F
        G -- OK --> J[Click 'Confirmar pedido']
    end

    J --> K[POST /v1/orders\nBearer JWT]

    subgraph BACKEND ["Backend — Guards + Servicio"]
        K --> L{JwtAuthGuard}
        L -- Inválido --> M[401 Unauthorized]
        L -- Válido --> N{RolesGuard\nADMIN · MANAGER}
        N -- BASIC --> O[403 Forbidden]
        N -- OK --> P{¿Caja abierta?\nCashShiftRepository}
        P -- No --> Q[409 REGISTER_NOT_OPEN]
        P -- Sí --> R{¿DTO válido?\nDelivery → address req.}
        R -- No --> S[400 Validation Error]
        R -- Sí --> T

        subgraph TX ["$transaction — Prisma"]
            T[Incrementa orderNumber] --> U[Valida stock por producto]
            U -- Sin stock --> V[409 STOCK_INSUFFICIENT]
            U -- OK --> W[Decrementa stock\nrow-level lock ordenado por productId]
            W --> X[Persiste Order\norderSource: STAFF forzado\nstatus: CONFIRMED]
            X --> Y[Persiste OrderItems\nmenuItemId: null\nunitPrice = product.price]
        end
    end

    Y --> Z[Emite SSE order:created\nKanban se actualiza]
    Z --> AA[Print kitchen ticket\nfire-and-forget]
    AA --> AB([Respuesta 201\norder.status: CONFIRMED\norder.orderSource: STAFF])

    AB --> AC[Toast: Pedido #N creado\nModal se cierra · Store reseteado]

    AC -.->|Más tarde| AD[Staff cobra al cliente\nPATCH /v1/orders/:id/pay\nbody: paymentMethod opcional]
    AD --> AE{¿paymentMethod\nen body?}
    AE -- Sí con valor inválido --> AF[400 Bad Request\n@IsEnum PaymentMethod]
    AE -- Sí válido --> AG[Actualiza paymentMethod\nen la orden]
    AE -- No --> AH[paymentMethod queda null]
    AG --> AI([200 OK · isPaid: true])
    AH --> AI
```

---

## 5. Casos edge

| Situación | Comportamiento |
|---|---|
| No hay turno abierto al crear | 409 `REGISTER_NOT_OPEN` → toast de error, modal se cierra |
| Producto sin stock al confirmar | 409 del backend → toast con nombre del producto |
| Producto `active: false` | No aparece en búsqueda (endpoint filtra activos) |
| Producto con `stock === 0` | Card con badge "Agotado", botón `+` deshabilitado |
| Modal cerrado a mitad del flujo | Store reseteado → próximo pedido empieza limpio |
| Producto ya en carrito se agrega de nuevo | `addItem` incrementa cantidad, no duplica |
| `paymentMethod` inválido en `/pay` | 400 por `@IsEnum` — solo CASH, CARD, DIGITAL_WALLET |
| Turno se cierra mientras el modal está abierto | Al confirmar, 409 → toast de error |
| `menuItemId` es null | Comportamiento normal — ya soportado en schema y repositorio |
| Precio en OrderItem | Siempre `product.price` — sin `priceOverride` (eliminado del schema) |

---

## 6. Fuera de alcance

- Selección de método de pago al crear el pedido (se asigna al cobrar)
- DINE_IN con múltiples mesas en un solo pedido
- Búsqueda por categoría (versión inicial: solo texto)
- Notas por ítem (se puede agregar en iteración futura)
- Descuentos o precios especiales para pedidos del staff

---

## 7. Archivos afectados

### `apps/api-core`

| Archivo | Cambio |
|---|---|
| `src/orders/orders.controller.ts` | Agregar `POST /v1/orders` |
| `src/orders/orders.service.ts` | Nuevo método `createStaffOrder`; actualizar `markAsPaid` para aceptar `paymentMethod?` |
| `src/orders/order.repository.ts` | Actualizar `markAsPaid` para persistir `paymentMethod?` |
| `src/orders/dto/mark-order-paid.dto.ts` | Nuevo DTO con `paymentMethod?` opcional |
| `src/orders/orders.module.info.md` | Documentar nuevos endpoints y cambios |
| `src/kiosk/kiosk.module.info.md` | Actualizar ejemplo JSON con campos nuevos |

### `apps/ui`

| Archivo | Cambio |
|---|---|
| `src/components/dash/orders/OrdersPanel.tsx` | Agregar botón "Nuevo pedido" + integrar modal |
| `src/components/dash/orders/CreateOrderModal.tsx` | Nuevo — modal con stepper |
| `src/components/dash/orders/CreateOrderStep1.tsx` | Nuevo — búsqueda + carrito |
| `src/components/dash/orders/CreateOrderStep2.tsx` | Nuevo — formulario de datos |
| `src/components/dash/orders/create-order-store.ts` | Nuevo — Zustand store del carrito |
| `src/components/dash/orders/create-order-api.ts` | Nuevo — llamadas a products y orders |
| `package.json` + `pnpm-lock.yaml` | Agregar `react-hook-form` + `@hookform/resolvers` |

---

## 8. Tests

### Backend (E2E dentro del contenedor)

Casos a cubrir en `test/orders/createOrderFromDashboard.e2e-spec.ts`:

| Caso | Status esperado |
|---|---|
| ADMIN crea orden válida | 201 |
| MANAGER crea orden válida | 201 |
| BASIC intenta crear | 403 |
| Sin token | 401 |
| Sin caja abierta | 409 `REGISTER_NOT_OPEN` |
| Producto sin stock | 409 `STOCK_INSUFFICIENT` |
| `orderType: DELIVERY` sin `deliveryAddress` | 400 |
| `orderSource` forzado a `STAFF` | 201, `order.orderSource === 'STAFF'` |
| Orden inicia en `CONFIRMED` (no `CREATED`) | 201, `order.status === 'CONFIRMED'` |
| `/pay` con `paymentMethod: CASH` | 200, `order.paymentMethod === 'CASH'` |
| `/pay` con valor inválido | 400 |
| `/pay` sin body | 200, `paymentMethod` sin cambio |
