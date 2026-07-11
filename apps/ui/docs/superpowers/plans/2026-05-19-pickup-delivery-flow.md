# Pickup / Delivery Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al cliente del kiosk web elegir entre retirar en tienda o envío a domicilio, capturando datos de contacto y dirección, y mostrando esa información al staff en el dashboard.

**Architecture:** Se agregan 3 campos opcionales al modelo `Order` en Prisma y se propagan por el stack API. En el kiosk se insertan dos pantallas nuevas entre el carrito y el selector de pago. En el dashboard, una modal existente se reutiliza para mostrar los datos del cliente por pedido.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api-core), Astro + React + Zustand + Tailwind (ui)

**Spec:** `apps/ui/docs/superpowers/specs/2026-05-19-pickup-delivery-flow-design.md`

---

## Task 1: Migración Prisma — agregar campos de entrega a Order

**Files:**
- Modify: `apps/api-core/prisma/schema.postgresql.prisma`

- [ ] **Step 1: Agregar los 3 campos al modelo Order**

En `apps/api-core/prisma/schema.postgresql.prisma`, dentro del modelo `Order`, agregar después de `customerEmail String?` (línea 197):

```prisma
  customerPhone      String?
  deliveryAddress    String?
  deliveryReferences String?
```

El bloque del modelo debe quedar así (fragmento relevante):

```prisma
model Order {
  id                 String        @id @default(uuid())
  orderNumber        Int
  status             OrderStatus   @default(CREATED)
  paymentMethod      PaymentMethod?
  customerEmail      String?
  customerPhone      String?
  deliveryAddress    String?
  deliveryReferences String?
  totalAmount        BigInt
  isPaid             Boolean       @default(false)
  cancellationReason String?
  orderSource        String
  orderType          String
  tableNumber        String?
  // ... resto sin cambios
```

- [ ] **Step 2: Ejecutar la migración dentro del contenedor**

```bash
docker compose exec res-api-core pnpm exec prisma migrate dev --name add_delivery_fields_to_order
```

Expected: `Your database is now in sync with your schema.` y se crea un archivo nuevo en `apps/api-core/prisma/migrations/`.

- [ ] **Step 3: Verificar que los tests siguen pasando**

```bash
docker compose exec res-api-core pnpm test
```

Expected: todos los tests en verde (el schema change solo agrega campos opcionales, no rompe nada existente).

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/prisma/schema.postgresql.prisma apps/api-core/prisma/migrations/
git commit -m "feat(api): add customerPhone, deliveryAddress, deliveryReferences to Order"
```

---

## Task 2: Actualizar la capa API — DTOs, repository y service

**Files:**
- Modify: `apps/api-core/src/orders/dto/create-order.dto.ts`
- Modify: `apps/api-core/src/orders/dto/order.dto.ts`
- Modify: `apps/api-core/src/orders/order.repository.ts`
- Modify: `apps/api-core/src/orders/orders.service.ts`
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Escribir el test que falla (TDD) — verificar que los campos nuevos se pasan al repository**

En `apps/api-core/src/orders/orders.service.spec.ts`, dentro del `describe('createOrder')`, agregar este test después del test `'creates an order successfully with sufficient stock'` (cerca de línea 307):

```typescript
it('passes customerPhone, deliveryAddress and deliveryReferences to repository', async () => {
  mockPrisma.product.findUnique.mockResolvedValue({
    id: 'p1', restaurantId: 'r1', price: 5, stock: 10, name: 'Widget',
  });
  mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });

  const dto = {
    ...baseDto,
    orderType: 'DELIVERY',
    customerPhone: '555-1234',
    deliveryAddress: 'Calle Reforma 123',
    deliveryReferences: 'Puerta azul',
  };

  await service.createOrder('r1', 'session1', dto as any);

  expect(mockOrderRepository.createWithItems).toHaveBeenCalledWith(
    expect.objectContaining({
      customerPhone: '555-1234',
      deliveryAddress: 'Calle Reforma 123',
      deliveryReferences: 'Puerta azul',
    }),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern="orders.service"
```

Expected: FAIL — `Expected: ObjectContaining {"customerPhone": "555-1234", ...}` / `Received: ObjectContaining {...}` (campos no presentes).

- [ ] **Step 3: Agregar campos a `CreateOrderDto`**

En `apps/api-core/src/orders/dto/create-order.dto.ts`, agregar después del bloque de `customerEmail` (línea 52):

```typescript
  @ApiPropertyOptional({ example: '+52 555 1234567', description: 'Teléfono del cliente' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'Calle Reforma 123, Col. Centro' })
  @IsString()
  @IsNotEmpty()
  @ValidateIf((o) => o.orderType === 'DELIVERY')
  deliveryAddress?: string;

  @ApiPropertyOptional({ example: 'Puerta azul, 2do piso' })
  @IsString()
  @IsOptional()
  deliveryReferences?: string;
```

También agregar `IsNotEmpty` a los imports del top del archivo:

```typescript
import {
  IsArray,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsEnum,
  IsEmail,
  ValidateIf,
} from 'class-validator';
```

- [ ] **Step 4: Agregar campos a `OrderDto` y `OrderWithItemsDto`**

En `apps/api-core/src/orders/dto/order.dto.ts`, agregar después de `customerEmail` (línea 21):

```typescript
  @ApiPropertyOptional({ nullable: true }) customerPhone: string | null;
  @ApiPropertyOptional({ nullable: true }) deliveryAddress: string | null;
  @ApiPropertyOptional({ nullable: true }) deliveryReferences: string | null;
```

- [ ] **Step 5: Agregar campos a `CreateOrderData` en el repository**

En `apps/api-core/src/orders/order.repository.ts`, en la interfaz `CreateOrderData` (línea 38), agregar después de `customerEmail?`:

```typescript
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReferences?: string;
```

En el método `createWithItems`, dentro del objeto `data` pasado a `client.order.create` (alrededor de línea 73), agregar después de `customerEmail: data.customerEmail,`:

```typescript
        customerPhone: data.customerPhone,
        deliveryAddress: data.deliveryAddress,
        deliveryReferences: data.deliveryReferences,
```

- [ ] **Step 6: Propagar campos desde el service al repository**

En `apps/api-core/src/orders/orders.service.ts`, en el método privado que llama a `orderRepository.createWithItems` (alrededor de línea 328), agregar después de `customerEmail: params.dto.customerEmail,`:

```typescript
        customerPhone: params.dto.customerPhone,
        deliveryAddress: params.dto.deliveryAddress,
        deliveryReferences: params.dto.deliveryReferences,
```

- [ ] **Step 7: Ejecutar los tests para verificar que pasan**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern="orders.service"
```

Expected: PASS — todos los tests en verde incluyendo el nuevo.

- [ ] **Step 8: Ejecutar suite completa**

```bash
docker compose exec res-api-core pnpm test
```

Expected: todos los tests en verde.

- [ ] **Step 9: Commit**

```bash
git add apps/api-core/src/orders/
git commit -m "feat(api): accept and expose delivery fields in Order DTOs and repository"
```

---

## Task 3: Actualizar tipos y store del kiosk

**Files:**
- Modify: `apps/ui/src/components/kiosk/types/kiosk.types.ts`
- Modify: `apps/ui/src/components/kiosk/store/kiosk.store.ts`

- [ ] **Step 1: Agregar nuevas vistas al enum `KioskView`**

En `apps/ui/src/components/kiosk/types/kiosk.types.ts`, reemplazar el bloque `KioskView`:

```typescript
export const KioskView = {
  MENU: 'menu',
  CART: 'cart',
  DELIVERY_TYPE: 'delivery_type',
  CUSTOMER_DATA: 'customer_data',
  CHECKOUT: 'checkout',
  CONFIRMATION: 'confirmation',
} as const
export type KioskView = (typeof KioskView)[keyof typeof KioskView]
```

- [ ] **Step 2: Agregar nuevos campos a `KioskStore`**

En el mismo archivo, reemplazar el tipo `KioskStore`:

```typescript
export type KioskStore = {
  slug: string
  sessionOpen: boolean
  restaurantName: string
  isLoading: boolean
  menus: Menu[]
  activeMenuId: string | null
  menuSections: Record<string, Record<string, MenuItem[]>>
  cart: CartItem[]
  selectedPayment: PaymentMethod | null
  customerEmail: string
  customerPhone: string
  orderType: 'PICKUP' | 'DELIVERY'
  deliveryAddress: string
  deliveryReferences: string
  isSubmitting: boolean
  view: KioskView
  confirmedOrder: ConfirmedOrder | null
  errorMessage: string | null
  cartPriceSnapshot: Map<string, number> | null
}
```

- [ ] **Step 3: Agregar nuevas acciones al tipo `KioskActions` en el store**

En `apps/ui/src/components/kiosk/store/kiosk.store.ts`, reemplazar el tipo `KioskActions`:

```typescript
type KioskActions = {
  init(slug: string): Promise<void>
  loadMenus(): Promise<void>
  selectMenu(menuId: string): Promise<void>
  addToCart(item: AddToCartPayload): void
  updateQuantity(productId: string, menuItemId: string | undefined, delta: number): void
  updateNotes(productId: string, menuItemId: string | undefined, notes: string): void
  clearCart(): void
  setPayment(method: PaymentMethod): void
  setCustomerEmail(email: string): void
  setCustomerPhone(phone: string): void
  setOrderType(type: 'PICKUP' | 'DELIVERY'): void
  setDeliveryAddress(address: string): void
  setDeliveryReferences(refs: string): void
  placeOrder(): Promise<void>
  resetOrder(): void
  setView(view: KioskView): void
  clearError(): void
}
```

- [ ] **Step 4: Agregar nuevos campos al `initialState`**

En el objeto `initialState`, agregar después de `customerEmail: '',`:

```typescript
  customerPhone: '',
  orderType: 'PICKUP' as const,
  deliveryAddress: '',
  deliveryReferences: '',
```

- [ ] **Step 5: Agregar las nuevas acciones al store**

En el store de Zustand, agregar después de `setCustomerEmail`:

```typescript
  setCustomerPhone(phone: string): void {
    set({ customerPhone: phone })
  },

  setOrderType(type: 'PICKUP' | 'DELIVERY'): void {
    set({ orderType: type })
  },

  setDeliveryAddress(address: string): void {
    set({ deliveryAddress: address })
  },

  setDeliveryReferences(refs: string): void {
    set({ deliveryReferences: refs })
  },
```

- [ ] **Step 6: Actualizar `placeOrder` para incluir los nuevos campos**

Reemplazar el inicio del método `placeOrder` (destructuring y body):

```typescript
  async placeOrder(): Promise<void> {
    const {
      slug, cart, selectedPayment, customerEmail, customerPhone,
      orderType, deliveryAddress, deliveryReferences, activeMenuId,
    } = get()

    if (!selectedPayment || cart.length === 0) return

    set({ isSubmitting: true })

    const body = {
      items: cart.map((c) => ({
        productId: c.productId,
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        notes: c.notes || undefined,
      })),
      paymentMethod: selectedPayment,
      orderType,
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      deliveryAddress: deliveryAddress || undefined,
      deliveryReferences: deliveryReferences || undefined,
      expectedTotal: cart.reduce((s, c) => s + c.price * c.quantity, 0),
    }
```

- [ ] **Step 7: Actualizar `resetOrder` para limpiar los nuevos campos**

Reemplazar el método `resetOrder` completo:

```typescript
  resetOrder(): void {
    const { activeMenuId } = get()
    set({
      cart: [],
      cartPriceSnapshot: null,
      selectedPayment: null,
      customerEmail: '',
      customerPhone: '',
      orderType: 'PICKUP',
      deliveryAddress: '',
      deliveryReferences: '',
      confirmedOrder: null,
      errorMessage: null,
      isSubmitting: false,
      view: KioskView.MENU,
    })
    if (activeMenuId) {
      get().selectMenu(activeMenuId)
    }
  },
```

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/components/kiosk/types/kiosk.types.ts apps/ui/src/components/kiosk/store/kiosk.store.ts
git commit -m "feat(kiosk): add delivery type and customer data state to kiosk store"
```

---

## Task 4: Crear `DeliveryTypeScreen`

**Files:**
- Create: `apps/ui/src/components/kiosk/DeliveryTypeScreen.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// apps/ui/src/components/kiosk/DeliveryTypeScreen.tsx
import type { KioskTheme } from './types/kiosk.types'

type OrderType = 'PICKUP' | 'DELIVERY'

type Props = {
  selected: OrderType
  onSelect: (type: OrderType) => void
  onNext: () => void
  onBack: () => void
  theme: KioskTheme
}

const OPTIONS: { type: OrderType; label: string }[] = [
  { type: 'PICKUP', label: '🏪 Retirar en tienda' },
  { type: 'DELIVERY', label: '🛵 Envío a domicilio' },
]

export function DeliveryTypeScreen({ selected, onSelect, onNext, onBack, theme }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-6">
        <h2 className="text-xl md:text-2xl font-bold text-center text-slate-800">
          ¿Cómo quieres recibir tu pedido?
        </h2>

        <div className="flex flex-col gap-3">
          {OPTIONS.map(({ type, label }) => {
            const isSelected = selected === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                className="flex items-center gap-4 p-4 md:p-5 rounded-xl border-2 text-left w-full cursor-pointer bg-white transition-all active:scale-95"
                style={
                  isSelected
                    ? { borderColor: theme.primary, backgroundColor: '#fff7ed' }
                    : { borderColor: '#e2e8f0' }
                }
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                  style={
                    isSelected
                      ? { borderColor: theme.primary, backgroundColor: theme.primary }
                      : { borderColor: '#cbd5e1' }
                  }
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="text-base md:text-lg font-medium text-slate-800">{label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/kiosk/DeliveryTypeScreen.tsx
git commit -m "feat(kiosk): add DeliveryTypeScreen component"
```

---

## Task 5: Crear `CustomerDataScreen`

**Files:**
- Create: `apps/ui/src/components/kiosk/CustomerDataScreen.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// apps/ui/src/components/kiosk/CustomerDataScreen.tsx
import React, { useState } from 'react'
import type { KioskTheme } from './types/kiosk.types'

type ContactResult = {
  email?: string
  phone?: string
  address?: string
  references?: string
}

type Props = {
  orderType: 'PICKUP' | 'DELIVERY'
  initialContact: string
  initialAddress: string
  initialReferences: string
  onConfirm: (data: ContactResult) => void
  onBack: () => void
  theme: KioskTheme
}

function detectContactType(value: string): 'email' | 'phone' {
  return value.includes('@') ? 'email' : 'phone'
}

export function CustomerDataScreen({
  orderType,
  initialContact,
  initialAddress,
  initialReferences,
  onConfirm,
  onBack,
  theme,
}: Props) {
  const [contact, setContact] = useState(initialContact)
  const [address, setAddress] = useState(initialAddress)
  const [references, setReferences] = useState(initialReferences)
  const [errors, setErrors] = useState<{ contact?: string; address?: string }>({})

  function handleConfirm() {
    const newErrors: { contact?: string; address?: string } = {}

    if (!contact.trim()) {
      newErrors.contact = 'Ingresa un teléfono o email de contacto'
    }
    if (orderType === 'DELIVERY' && !address.trim()) {
      newErrors.address = 'La dirección es requerida para envío a domicilio'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const type = detectContactType(contact.trim())
    onConfirm({
      email: type === 'email' ? contact.trim() : undefined,
      phone: type === 'phone' ? contact.trim() : undefined,
      address: orderType === 'DELIVERY' ? address.trim() : undefined,
      references: orderType === 'DELIVERY' && references.trim() ? references.trim() : undefined,
    })
  }

  const inputBase =
    'w-full px-4 py-3 md:py-4 border rounded-xl text-base focus:outline-none focus:ring-2'
  const ringStyle = { '--tw-ring-color': theme.primary, fontSize: '16px' } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-5">
        <h2 className="text-xl md:text-2xl font-bold text-center text-slate-800">
          {orderType === 'DELIVERY' ? 'Datos de entrega' : 'Datos de contacto'}
        </h2>

        <div>
          <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
            Teléfono o email{' '}
            <span style={{ color: theme.primary }}>*</span>
          </label>
          <input
            type="text"
            inputMode="email"
            value={contact}
            onChange={(e) => {
              setContact(e.target.value)
              setErrors((prev) => ({ ...prev, contact: undefined }))
            }}
            placeholder="Ej. 555-1234 o tu@email.com"
            className={`${inputBase} ${errors.contact ? 'border-red-400' : 'border-slate-300'}`}
            style={ringStyle}
          />
          {errors.contact && (
            <p className="text-red-500 text-sm mt-1">{errors.contact}</p>
          )}
        </div>

        {orderType === 'DELIVERY' && (
          <>
            <div>
              <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
                Dirección{' '}
                <span style={{ color: theme.primary }}>*</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  setErrors((prev) => ({ ...prev, address: undefined }))
                }}
                placeholder="Calle, número, colonia..."
                className={`${inputBase} ${errors.address ? 'border-red-400' : 'border-slate-300'}`}
                style={ringStyle}
              />
              {errors.address && (
                <p className="text-red-500 text-sm mt-1">{errors.address}</p>
              )}
            </div>

            <div>
              <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
                Referencias{' '}
                <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={references}
                onChange={(e) => setReferences(e.target.value)}
                placeholder="Ej. puerta azul, 2do piso..."
                className={`${inputBase} border-slate-300`}
                style={ringStyle}
              />
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            ← Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/kiosk/CustomerDataScreen.tsx
git commit -m "feat(kiosk): add CustomerDataScreen component with smart contact field"
```

---

## Task 6: Cablear las nuevas pantallas en `KioskApp` y limpiar `PaymentMethodSelector`

**Files:**
- Modify: `apps/ui/src/components/kiosk/KioskApp.tsx`
- Modify: `apps/ui/src/components/kiosk/PaymentMethodSelector.tsx`

- [ ] **Step 1: Actualizar los imports en `KioskApp.tsx`**

Reemplazar los imports actuales por:

```typescript
import { useEffect, useMemo } from 'react'
import { useKioskStore } from './store/kiosk.store'
import type { KioskTheme } from './types/kiosk.types'
import { KioskView } from './types/kiosk.types'
import { useViewport } from './hooks/useViewport'
import { LoadingScreen } from './LoadingScreen'
import { SessionClosedScreen } from './SessionClosedScreen'
import { KioskHeader } from './KioskHeader'
import { MenuTabs } from './MenuTabs'
import { ProductGrid } from './ProductGrid'
import { CartFab } from './CartFab'
import { CartPanel } from './CartPanel'
import { OrderConfirmation } from './OrderConfirmation'
import { PaymentMethodSelector } from './PaymentMethodSelector'
import { DeliveryTypeScreen } from './DeliveryTypeScreen'
import { CustomerDataScreen } from './CustomerDataScreen'
```

- [ ] **Step 2: Agregar selectores del store para los nuevos campos**

En `KioskApp`, agregar después del selector `customerEmail`:

```typescript
  const customerPhone = useKioskStore(s => s.customerPhone)
  const orderType = useKioskStore(s => s.orderType)
  const deliveryAddress = useKioskStore(s => s.deliveryAddress)
  const deliveryReferences = useKioskStore(s => s.deliveryReferences)
```

Y agregar las acciones después de `setCustomerEmail`:

```typescript
  const setCustomerPhone = useKioskStore(s => s.setCustomerPhone)
  const setOrderType = useKioskStore(s => s.setOrderType)
  const setDeliveryAddress = useKioskStore(s => s.setDeliveryAddress)
  const setDeliveryReferences = useKioskStore(s => s.setDeliveryReferences)
```

- [ ] **Step 3: Agregar handler para la vista `DELIVERY_TYPE`**

En `KioskApp`, después del bloque `if (view === KioskView.CHECKOUT)` (alrededor de línea 104), agregar:

```typescript
  if (view === KioskView.DELIVERY_TYPE) {
    return (
      <>
        <DeliveryTypeScreen
          selected={orderType}
          onSelect={setOrderType}
          onNext={() => setView(KioskView.CUSTOMER_DATA)}
          onBack={() => setView(isSidebarMode ? KioskView.MENU : KioskView.CART)}
          theme={theme}
        />
        {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
      </>
    )
  }
```

- [ ] **Step 4: Agregar handler para la vista `CUSTOMER_DATA`**

Inmediatamente después del bloque anterior:

```typescript
  if (view === KioskView.CUSTOMER_DATA) {
    const initialContact = customerEmail || customerPhone
    return (
      <>
        <CustomerDataScreen
          orderType={orderType}
          initialContact={initialContact}
          initialAddress={deliveryAddress}
          initialReferences={deliveryReferences}
          onConfirm={(data) => {
            setCustomerEmail(data.email ?? '')
            setCustomerPhone(data.phone ?? '')
            if (data.address !== undefined) setDeliveryAddress(data.address)
            if (data.references !== undefined) setDeliveryReferences(data.references)
            setView(KioskView.CHECKOUT)
          }}
          onBack={() => setView(KioskView.DELIVERY_TYPE)}
          theme={theme}
        />
        {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
      </>
    )
  }
```

- [ ] **Step 5: Actualizar el `onBack` de `PaymentMethodSelector`**

En el bloque `if (view === KioskView.CHECKOUT)`, cambiar el `onBack`:

```typescript
  if (view === KioskView.CHECKOUT) {
    return (
      <>
        <PaymentMethodSelector
          selectedMethod={selectedPayment}
          onSelect={setPayment}
          onConfirm={placeOrder}
          onBack={() => setView(KioskView.CUSTOMER_DATA)}
          isLoading={isSubmitting}
          theme={theme}
        />
        {errorMessage && <ErrorToast message={errorMessage} onDismiss={clearError} />}
      </>
    )
  }
```

- [ ] **Step 6: Actualizar `onCheckout` del `CartPanel` para ir a `DELIVERY_TYPE`**

En ambos `<CartPanel>` (sidebar y mobile), cambiar:

```typescript
onCheckout={() => setView(KioskView.DELIVERY_TYPE)}
```

- [ ] **Step 7: Limpiar `PaymentMethodSelector` — eliminar el campo de email**

`PaymentMethodSelector` ahora no necesita el campo de email (se captura en `CustomerDataScreen`). Reemplazar el archivo completo:

```typescript
// apps/ui/src/components/kiosk/PaymentMethodSelector.tsx
import type { KioskTheme, PaymentMethod } from './types/kiosk.types'

type PaymentOption = {
  method: PaymentMethod
  icon: string
  label: string
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { method: 'CASH', icon: '💵', label: 'Efectivo' },
  { method: 'CARD', icon: '💳', label: 'Tarjeta' },
  { method: 'DIGITAL_WALLET', icon: '📱', label: 'Billetera Digital' },
]

type Props = {
  selectedMethod: PaymentMethod | null
  onSelect: (m: PaymentMethod) => void
  onConfirm: () => void
  onBack: () => void
  isLoading: boolean
  theme: KioskTheme
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelect,
  onConfirm,
  onBack,
  isLoading,
  theme,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md lg:max-w-lg p-6 md:p-8 space-y-6">
        <h2 className="text-xl md:text-2xl font-bold text-center">Método de Pago</h2>

        <div className="grid grid-cols-1 gap-3">
          {PAYMENT_OPTIONS.map(({ method, icon, label }) => {
            const isSelected = selectedMethod === method
            return (
              <button
                key={method}
                onClick={() => onSelect(method)}
                className="py-4 md:py-5 px-6 rounded-xl text-lg md:text-xl font-medium flex items-center gap-3 cursor-pointer bg-white transition-all active:scale-95 w-full border-2"
                style={
                  isSelected
                    ? { borderColor: theme.primary, backgroundColor: theme.background }
                    : { borderColor: '#e2e8f0' }
                }
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 md:py-4 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700 text-base md:text-lg"
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={!selectedMethod || isLoading}
            className="flex-1 py-3 md:py-4 text-white rounded-xl font-bold cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed text-base md:text-lg"
            style={{ backgroundColor: theme.primary }}
          >
            {isLoading ? 'Procesando...' : 'Completar Pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/components/kiosk/
git commit -m "feat(kiosk): wire delivery type and customer data screens into checkout flow"
```

---

## Task 7: Actualizar tipo `Order` del dashboard y agregar botón en `OrderCard`

**Files:**
- Modify: `apps/ui/src/components/dash/orders/api.ts`
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx`

- [ ] **Step 1: Agregar campos nuevos a la interfaz `Order`**

En `apps/ui/src/components/dash/orders/api.ts`, en la interfaz `Order`, agregar después de `displayTime?`:

```typescript
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReferences?: string;
```

- [ ] **Step 2: Agregar modal state y botón "Ver datos" en `OrderCard`**

En `apps/ui/src/components/dash/orders/OrderCard.tsx`, agregar el import de `useState` y del modal al inicio del archivo:

```typescript
import { useState } from 'react';
import type { Order } from './api';
import { OrderCustomerModal } from './OrderCustomerModal';
```

Y en la función `OrderCard`, agregar el estado del modal justo antes del `return`:

```typescript
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const hasCustomerData = order.customerEmail || order.customerPhone || order.deliveryAddress;
```

En el JSX, dentro del bloque de badges (después del badge de `ORDER_TYPE_LABELS`, alrededor de línea 94), agregar el botón:

```tsx
          {hasCustomerData && (
            <button
              type="button"
              onClick={() => setCustomerModalOpen(true)}
              className="py-0.5 px-2 text-xs font-medium bg-sky-100 text-sky-700 rounded-full cursor-pointer border-none hover:bg-sky-200"
            >
              Ver datos
            </button>
          )}
```

Y al final del `return`, antes del `</div>` de cierre del componente, agregar el modal:

```tsx
      {hasCustomerData && (
        <OrderCustomerModal
          order={order}
          open={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
        />
      )}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/orders/api.ts apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "feat(dash): add customer data fields to Order type and 'Ver datos' button in OrderCard"
```

---

## Task 8: Crear `OrderCustomerModal`

**Files:**
- Create: `apps/ui/src/components/dash/orders/OrderCustomerModal.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
// apps/ui/src/components/dash/orders/OrderCustomerModal.tsx
import Modal from '../../commons/Modal';
import type { Order } from './api';

const ORDER_TYPE_LABELS: Record<string, string> = {
  PICKUP: 'Retirar en tienda',
  DELIVERY: 'Envío a domicilio',
  DINE_IN: 'En mesa',
};

interface Props {
  order: Order;
  open: boolean;
  onClose: () => void;
}

export function OrderCustomerModal({ order, open, onClose }: Props) {
  const isDelivery = order.orderType === 'DELIVERY';

  return (
    <Modal
      open={open}
      title={`Pedido #${order.orderNumber} — Datos del cliente`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Tipo de entrega
          </p>
          <p className="text-slate-800 font-medium">
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </p>
        </div>

        {(order.customerEmail || order.customerPhone) && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Contacto
            </p>
            {order.customerEmail && (
              <p className="text-slate-800">{order.customerEmail}</p>
            )}
            {order.customerPhone && (
              <p className="text-slate-800">{order.customerPhone}</p>
            )}
          </div>
        )}

        {isDelivery && order.deliveryAddress && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Dirección
            </p>
            <p className="text-slate-800">{order.deliveryAddress}</p>
          </div>
        )}

        {isDelivery && order.deliveryReferences && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Referencias
            </p>
            <p className="text-slate-800 text-sm text-slate-500">{order.deliveryReferences}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCustomerModal.tsx
git commit -m "feat(dash): add OrderCustomerModal to display customer contact and delivery info"
```

---

## Verificación final

- [ ] **Levantar los servicios en Docker**

```bash
docker compose up
```

- [ ] **Verificar flujo kiosk en mobile** — abrir `http://localhost:4321/kiosk?slug=<slug-de-prueba>` desde el navegador del celular o con DevTools en modo mobile (iPhone SE). Hacer un pedido completo eligiendo **Envío** y verificar:
  - Pantalla 1: se muestran las dos opciones sin tiempos ni costos
  - Pantalla 2: aparecen campos de dirección al elegir Envío, solo contacto al elegir Retirar
  - Validación: no deja continuar con campos vacíos
  - El campo de contacto acepta email y teléfono
  - Pantalla de pago ya no tiene campo de email

- [ ] **Verificar flujo kiosk en desktop** — hacer el mismo flujo desde escritorio.

- [ ] **Verificar en el dashboard** — abrir `http://localhost:4321/dash/orders`. La card del pedido creado debe mostrar el botón "Ver datos". Al hacer click, la modal muestra el tipo de entrega, el contacto y la dirección si aplica.

- [ ] **Verificar pedido de Retirar** — hacer un pedido como "Retirar en tienda". La modal en el dashboard no debe mostrar campos de dirección.
