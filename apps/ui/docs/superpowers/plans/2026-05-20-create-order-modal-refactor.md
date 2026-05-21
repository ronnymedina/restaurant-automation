# Create Order Modal Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix UI bugs in the dashboard "Nuevo pedido" modal: overlay z-index, fixed modal size (no layout jumps), rename PICKUP label to "Retiro", require customer name, add smart phone/email contact field, and restructure from 2 steps to 3.

**Architecture:** `CreateOrderStep2.tsx` becomes a pure order-type selector (3 large option cards). A new `CreateOrderStep3.tsx` handles all customer data with a unified contact field that casts to `customerPhone` or `customerEmail` by detecting `@`. The modal container gets a fixed large size (`max-w-2xl h-[85vh]`) and `z-[9999]` overlay so it never jumps between steps and always sits above the dashboard header.

**Tech Stack:** React, Zustand, React Hook Form, Zod, TailwindCSS, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/ui/src/components/dash/orders/CreateOrderStep2.tsx` | **Modify** | Pure order type selector — 3 card buttons, exports `OrderType` |
| `apps/ui/src/components/dash/orders/CreateOrderStep3.tsx` | **Create** | Customer data form: name (required), smart contact, table/address by type |
| `apps/ui/src/components/dash/orders/CreateOrderStep3.test.ts` | **Create** | Unit tests for `detectContactType` |
| `apps/ui/src/components/dash/orders/CreateOrderModal.tsx` | **Modify** | Orchestrates 3 steps, fixed size, `z-[9999]` overlay, builds API payload |

---

## Task 1: Create `CreateOrderStep3.tsx`

**Files:**
- Create: `apps/ui/src/components/dash/orders/CreateOrderStep3.tsx`

- [ ] **Step 1.1: Write the file**

```tsx
// apps/ui/src/components/dash/orders/CreateOrderStep3.tsx
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateOrderStore, selectTotal } from './create-order-store';
import type { OrderType } from './CreateOrderStep2';

export type Step3Values = {
  customerName: string;
  contact: string;
  tableNumber: string;
  deliveryAddress: string;
  deliveryReferences: string;
};

export function detectContactType(value: string): 'email' | 'phone' {
  return value.includes('@') ? 'email' : 'phone';
}

function makeSchema(orderType: OrderType) {
  return z
    .object({
      customerName: z.string().min(1, 'El nombre es requerido'),
      contact: z.string().optional(),
      tableNumber: z.string().optional(),
      deliveryAddress: z.string().optional(),
      deliveryReferences: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (orderType === 'DINE_IN' && !data.tableNumber?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['tableNumber'], message: 'Número de mesa requerido' });
      }
      if (orderType === 'DELIVERY' && !data.contact?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['contact'], message: 'Teléfono o email requerido' });
      }
      if (orderType === 'DELIVERY' && !data.deliveryAddress?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'Dirección requerida' });
      }
    });
}

interface Props {
  orderType: OrderType;
  onBack: () => void;
  onSubmit: (values: Step3Values) => void;
  isSubmitting: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  PICKUP: 'Retiro',
  DINE_IN: 'En mesa',
  DELIVERY: 'Delivery',
};

export default function CreateOrderStep3({ orderType, onBack, onSubmit, isSubmitting }: Props) {
  const items = useCreateOrderStore((s) => s.items);
  const total = useCreateOrderStore(selectTotal);

  const schema = useMemo(() => makeSchema(orderType), [orderType]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step3Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      contact: '',
      tableNumber: '',
      deliveryAddress: '',
      deliveryReferences: '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="bg-slate-50 rounded-xl px-4 py-2 text-sm text-slate-500">
        Tipo:{' '}
        <span className="font-semibold text-slate-800">{ORDER_TYPE_LABELS[orderType]}</span>
      </div>

      {/* Name — required for all types */}
      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Nombre del cliente <span className="text-red-500">*</span>
        </label>
        <input
          {...register('customerName')}
          placeholder="Nombre del cliente"
          className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <FieldError message={errors.customerName?.message} />
      </div>

      {/* Table number — DINE_IN only */}
      {orderType === 'DINE_IN' && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Número de mesa <span className="text-red-500">*</span>
          </label>
          <input
            {...register('tableNumber')}
            placeholder="Ej: 5"
            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FieldError message={errors.tableNumber?.message} />
        </div>
      )}

      {/* Smart contact — PICKUP (optional) and DELIVERY (required) */}
      {(orderType === 'PICKUP' || orderType === 'DELIVERY') && (
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Teléfono o email{' '}
            {orderType === 'DELIVERY' ? (
              <span className="text-red-500">*</span>
            ) : (
              <span className="text-slate-400 normal-case font-normal">(opcional)</span>
            )}
          </label>
          <input
            {...register('contact')}
            placeholder="Ej: 555-1234 o tu@email.com"
            className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FieldError message={errors.contact?.message} />
        </div>
      )}

      {/* Address and references — DELIVERY only */}
      {orderType === 'DELIVERY' && (
        <>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Dirección <span className="text-red-500">*</span>
            </label>
            <input
              {...register('deliveryAddress')}
              placeholder="Calle, número, colonia"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <FieldError message={errors.deliveryAddress?.message} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Referencias{' '}
              <span className="text-slate-400 normal-case font-normal">(opcional)</span>
            </label>
            <input
              {...register('deliveryReferences')}
              placeholder="Ej. puerta azul, 2do piso"
              className="mt-1 w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {/* Order summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resumen</p>
        {items.map((item) => (
          <div key={item.productId} className="flex justify-between text-slate-700">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>${((item.price * item.quantity) / 100).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-slate-800 mt-2 pt-2 border-t border-slate-200">
          <span>Total</span>
          <span>${(total / 100).toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm cursor-pointer hover:bg-slate-50 disabled:opacity-40"
        >
          ← Volver
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creando...' : 'Confirmar pedido'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 1.2: Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderStep3.tsx
git commit -m "feat(ui): add CreateOrderStep3 — customer data form with smart contact casting"
```

---

## Task 2: Write unit tests for `detectContactType`

**Files:**
- Create: `apps/ui/src/components/dash/orders/CreateOrderStep3.test.ts`

- [ ] **Step 2.1: Write the test file**

```ts
// apps/ui/src/components/dash/orders/CreateOrderStep3.test.ts
import { detectContactType } from './CreateOrderStep3';

describe('detectContactType', () => {
  it('returns "email" when value contains @', () => {
    expect(detectContactType('user@example.com')).toBe('email');
  });

  it('returns "phone" when value has no @', () => {
    expect(detectContactType('555-1234')).toBe('phone');
  });

  it('returns "phone" for a plain number string', () => {
    expect(detectContactType('1234567890')).toBe('phone');
  });
});
```

- [ ] **Step 2.2: Run the tests**

```bash
cd apps/ui && pnpm test -- --run CreateOrderStep3
```

Expected output: 3 tests pass, 0 fail.

- [ ] **Step 2.3: Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderStep3.test.ts
git commit -m "test(ui): add detectContactType unit tests"
```

---

## Task 3: Refactor `CreateOrderStep2.tsx` — pure order type selector

**Files:**
- Modify: `apps/ui/src/components/dash/orders/CreateOrderStep2.tsx`

The old Step2 combined order type selection with all customer fields in one form. The new version is only a type selector. It exports `OrderType` so Step3 and the modal can import it.

- [ ] **Step 3.1: Replace the entire file**

```tsx
// apps/ui/src/components/dash/orders/CreateOrderStep2.tsx
import { useState } from 'react';

export type OrderType = 'PICKUP' | 'DINE_IN' | 'DELIVERY';

interface Props {
  onNext: (orderType: OrderType) => void;
  onBack: () => void;
}

const ORDER_OPTIONS: { type: OrderType; label: string; description: string }[] = [
  { type: 'PICKUP', label: 'Retiro', description: 'El cliente retira en el local' },
  { type: 'DINE_IN', label: 'En mesa', description: 'Consumo dentro del local' },
  { type: 'DELIVERY', label: 'Delivery', description: 'Envío a domicilio' },
];

export default function CreateOrderStep2({ onNext, onBack }: Props) {
  const [selected, setSelected] = useState<OrderType>('PICKUP');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        ¿Cómo se entrega?
      </p>
      <div className="flex flex-col gap-3">
        {ORDER_OPTIONS.map(({ type, label, description }) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelected(type)}
            className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors cursor-pointer w-full ${
              selected === type
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <div>
              <p
                className={`font-semibold text-sm ${
                  selected === type ? 'text-blue-700' : 'text-slate-800'
                }`}
              >
                {label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm cursor-pointer hover:bg-slate-50"
        >
          ← Volver
        </button>
        <button
          type="button"
          onClick={() => onNext(selected)}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm cursor-pointer"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderStep2.tsx
git commit -m "feat(ui): refactor CreateOrderStep2 — pure order type selector, label PICKUP as Retiro"
```

---

## Task 4: Update `CreateOrderModal.tsx` — 3 steps, fixed size, overlay z-index

**Files:**
- Modify: `apps/ui/src/components/dash/orders/CreateOrderModal.tsx`

Changes from current version:
- `step` state is now `1 | 2 | 3`
- New `orderType` state carries the selection from Step2 to Step3
- Overlay: `z-[9999]` (was `z-50`) — sits above the dashboard's fixed top bar
- Modal inner div: `max-w-2xl h-[85vh]` (was `max-w-lg max-h-[90vh]`) — fixed size, no layout jumps
- Step indicator: 3 bubbles instead of 2
- `handleConfirm` applies `detectContactType` to build `customerEmail` or `customerPhone`
- The old `Step2Values` import is replaced with `Step3Values` + `OrderType`

- [ ] **Step 4.1: Replace the entire file**

```tsx
// apps/ui/src/components/dash/orders/CreateOrderModal.tsx
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import { useCreateOrderStore } from './create-order-store';
import { createStaffOrder } from './create-order-api';
import CreateOrderStep1 from './CreateOrderStep1';
import CreateOrderStep2, { type OrderType } from './CreateOrderStep2';
import CreateOrderStep3, { detectContactType, type Step3Values } from './CreateOrderStep3';

interface Props {
  onClose: () => void;
  onCreated: (orderNumber: number) => void;
}

function ModalContent({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [orderType, setOrderType] = useState<OrderType>('PICKUP');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { items, reset } = useCreateOrderStore();

  function handleClose() {
    reset();
    onClose();
  }

  function handleStep2Next(type: OrderType) {
    setOrderType(type);
    setStep(3);
  }

  async function handleConfirm(formValues: Step3Values) {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const contactRaw = formValues.contact?.trim() ?? '';
      const contactType = contactRaw ? detectContactType(contactRaw) : null;

      const payload = {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderType,
        ...(formValues.customerName.trim() ? { customerName: formValues.customerName.trim() } : {}),
        ...(contactType === 'email' ? { customerEmail: contactRaw } : {}),
        ...(contactType === 'phone' ? { customerPhone: contactRaw } : {}),
        ...(formValues.tableNumber?.trim() ? { tableNumber: formValues.tableNumber.trim() } : {}),
        ...(formValues.deliveryAddress?.trim() ? { deliveryAddress: formValues.deliveryAddress.trim() } : {}),
        ...(formValues.deliveryReferences?.trim() ? { deliveryReferences: formValues.deliveryReferences.trim() } : {}),
      };

      const result = await createStaffOrder(payload);
      if (!result.ok) {
        setErrorMsg(result.error.message ?? 'Error al crear el pedido');
        return;
      }
      reset();
      onCreated(result.data.order.orderNumber);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">Nuevo pedido</h2>
          <div className="flex items-center gap-4">
            {/* Step indicator: 3 bubbles */}
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 1 ? 'bg-blue-600 text-white' : 'bg-blue-200 text-blue-700'}`}>1</span>
              <span className="text-slate-300">—</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 2 ? 'bg-blue-600 text-white' : step > 2 ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>2</span>
              <span className="text-slate-300">—</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body — scrolls internally, modal height stays fixed */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {errorMsg && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">
              {errorMsg}
            </div>
          )}

          {step === 1 && <CreateOrderStep1 onNext={() => setStep(2)} />}
          {step === 2 && (
            <CreateOrderStep2 onNext={handleStep2Next} onBack={() => setStep(1)} />
          )}
          {step === 3 && (
            <CreateOrderStep3
              orderType={orderType}
              onBack={() => setStep(2)}
              onSubmit={handleConfirm}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateOrderModal({ onClose, onCreated }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ModalContent onClose={onClose} onCreated={onCreated} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4.2: Commit**

```bash
git add apps/ui/src/components/dash/orders/CreateOrderModal.tsx
git commit -m "feat(ui): update CreateOrderModal — 3-step flow, fixed size, z-[9999] overlay"
```

---

## Task 5: Verify in browser

- [ ] **Step 5.1: Start the dev server**

```bash
docker compose up res-ui
```

Open `http://localhost:4321/dash/orders`.

- [ ] **Step 5.2: Verify each scenario**

| Scenario | Expected |
|---|---|
| Open modal | Dark overlay covers the full screen — no white line at top |
| Step 1 → 2 → 3 | Modal stays the same size throughout (no layout jump) |
| Step 2 labels | Cards read "Retiro", "En mesa", "Delivery" |
| Step 3 — PICKUP | Name field required (error if empty). Contact field labeled "Teléfono o email (opcional)" |
| Step 3 — DINE_IN | Name required, table number required, no contact field |
| Step 3 — DELIVERY | Name required, contact required, address required |
| Submit with empty name | Validation error shown, form does not submit |
| Submit DELIVERY with `user@test.com` | Order created with `customerEmail: "user@test.com"` (check Network tab) |
| Submit DELIVERY with `555-1234` | Order created with `customerPhone: "555-1234"` |

- [ ] **Step 5.3: Commit any tweaks**

```bash
git add -p
git commit -m "fix(ui): post-review tweaks to create order modal"
```
