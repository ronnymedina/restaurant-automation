# React Island — KioskApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el kiosk de ~380 líneas de vanilla JS con manipulación directa del DOM a un componente React con estado gestionado. El resultado es `KioskApp.tsx` — un island reutilizable con props tipadas, montado en `kiosk/index.astro` con `client:load`.

**Architecture:** `KioskApp.tsx` recibe el `slug` como prop (leído desde el query param en el frontmatter de Astro). El componente gestiona todo el estado interno: menús, carrito, checkout, confirmación. Las llamadas a la API se mantienen con `fetch` directo — sin librerías extra de estado global. El CSS se mantiene con Tailwind (mismas clases que el HTML actual).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `fetch` nativo, Astro `client:load`

**Prerequisito:** Plan 2 completado — `kiosk/index.astro` existe y lee el slug de `?r=`.

**Spec:** `docs/superpowers/specs/2026-04-16-unify-platform-design.md` — sección "React islands"

---

## File Map

**Creados:**
- `apps/ui/src/components/kiosk/KioskApp.tsx` — componente React completo
- `apps/ui/src/components/kiosk/kiosk-api.ts` — funciones fetch del kiosk (extraídas de `src/lib/kiosk-api.ts`)

**Modificados:**
- `apps/ui/src/pages/kiosk/index.astro` — reemplazar `<script>` vanilla por `<KioskApp client:load />`

---

## Task 1: Crear kiosk-api.ts

**Archivo:** `apps/ui/src/components/kiosk/kiosk-api.ts`

Extraer las funciones de fetch del kiosk en un módulo separado para que `KioskApp.tsx` pueda importarlas limpiamente.

- [ ] **Step 1.1 — Crear el archivo**

```typescript
const API_URL = import.meta.env.PUBLIC_API_URL || '';

export async function kioskFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

export interface Menu {
  id: string;
  name: string;
}

export interface MenuItem {
  id: string;
  menuItemId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stockStatus: 'available' | 'low_stock' | 'out_of_stock';
}

export interface MenuSections {
  menuId: string;
  menuName: string;
  sections: Record<string, MenuItem[]>;
}

export interface CreateOrderPayload {
  items: { productId: string; menuItemId?: string; quantity: number; notes?: string }[];
  paymentMethod: string;
  customerEmail?: string;
}

export interface CreatedOrder {
  id: string;
  orderNumber: number;
  totalAmount: string;
}
```

- [ ] **Step 1.2 — Commit**

```bash
git add apps/ui/src/components/kiosk/kiosk-api.ts
git commit -m "feat(kiosk): add kiosk-api module with types"
```

---

## Task 2: Crear KioskApp.tsx

**Archivo:** `apps/ui/src/components/kiosk/KioskApp.tsx`

Este componente contiene todo el estado y la UI del kiosk. Es una migración 1:1 del vanilla JS existente en `kiosk/index.astro` a React hooks y JSX.

- [ ] **Step 2.1 — Crear el archivo completo**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { kioskFetch, type Menu, type MenuItem, type MenuSections, type CreateOrderPayload, type CreatedOrder } from './kiosk-api';

interface CartItem {
  productId: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

interface Props {
  slug: string;
}

export default function KioskApp({ slug }: Props) {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<string, MenuItem[]>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<CreatedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('Cargando...');
  const [menuLabel, setMenuLabel] = useState('');

  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }, []);

  useEffect(() => {
    async function loadMenus() {
      const res = await kioskFetch(`/v1/kiosk/${slug}/menus`);
      if (!res.ok) { showError('No se pudieron cargar los menús'); return; }
      const data: Menu[] = await res.json();
      setMenus(data);
      if (data.length > 0) selectMenu(data[0].id);
    }
    if (slug) loadMenus();
  }, [slug]);

  const selectMenu = useCallback(async (menuId: string) => {
    setActiveMenuId(menuId);
    setSections({});
    const res = await kioskFetch(`/v1/kiosk/${slug}/menus/${menuId}/items`);
    if (!res.ok) { showError('Error al cargar productos'); return; }
    const data: MenuSections = await res.json();
    setRestaurantName(data.menuName || 'Menú');
    setMenuLabel(data.menuName || '');
    setSections(data.sections);
  }, [slug, showError]);

  const addToCart = useCallback((item: Omit<CartItem, 'quantity' | 'notes'>) => {
    setCart(prev => {
      const existing = prev.find(c => c.productId === item.productId && c.menuItemId === item.menuItemId);
      if (existing) {
        return prev.map(c =>
          c.productId === item.productId && c.menuItemId === item.menuItemId
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { ...item, quantity: 1, notes: '' }];
    });
  }, []);

  const updateQty = useCallback((idx: number, delta: number) => {
    setCart(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + delta };
      if (next[idx].quantity <= 0) next.splice(idx, 1);
      return next;
    });
  }, []);

  const updateNotes = useCallback((idx: number, notes: string) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, notes } : c));
  }, []);

  const totalQty = cart.reduce((s, c) => s + c.quantity, 0);
  const totalPrice = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  async function confirmOrder() {
    if (!selectedPayment || cart.length === 0) return;
    const payload: CreateOrderPayload = {
      items: cart.map(c => ({
        productId: c.productId,
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        notes: c.notes || undefined,
      })),
      paymentMethod: selectedPayment,
      customerEmail: customerEmail || undefined,
    };

    const res = await kioskFetch(`/v1/kiosk/${slug}/orders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      showError(err?.message || 'Error al crear el pedido');
      return;
    }

    const order: CreatedOrder = await res.json();
    setCheckoutOpen(false);
    setConfirmedOrder(order);
  }

  function newOrder() {
    setCart([]);
    setSelectedPayment(null);
    setCustomerEmail('');
    setConfirmedOrder(null);
    if (activeMenuId) selectMenu(activeMenuId);
  }

  return (
    <div className="h-screen flex flex-col bg-amber-50 text-slate-800">
      {/* Header */}
      <header className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <h1 className="text-lg font-bold truncate">{restaurantName}</h1>
        <span className="text-sm opacity-80">{menuLabel}</span>
      </header>

      {/* Menu Tabs */}
      <div className="bg-white border-b border-slate-200 px-2 overflow-x-auto flex gap-1 py-2 shrink-0">
        {menus.length === 0 ? (
          <span className="text-sm text-slate-400 px-3 py-2">Cargando menús...</span>
        ) : (
          menus.map(m => (
            <button
              key={m.id}
              onClick={() => selectMenu(m.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border-none ${
                m.id === activeMenuId ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m.name}
            </button>
          ))
        )}
      </div>

      {/* Products Grid */}
      <main className="flex-1 overflow-y-auto p-4">
        {Object.keys(sections).length === 0 ? (
          <div className="text-center text-slate-400 py-12">Selecciona un menú para ver los productos</div>
        ) : (
          Object.entries(sections).map(([sectionName, items]) => (
            <div key={sectionName}>
              <h3 className="text-lg font-bold text-slate-700 mt-6 mb-3 first:mt-0">{sectionName}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {items.map(item => {
                  const isOut = item.stockStatus === 'out_of_stock';
                  const isLow = item.stockStatus === 'low_stock';
                  return (
                    <div key={item.menuItemId} className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${isOut ? 'opacity-50' : ''} flex flex-col`}>
                      <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center text-4xl">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                          : '🍽️'}
                      </div>
                      <div className="p-3 flex-1 flex flex-col">
                        <h4 className="font-semibold text-sm leading-tight mb-1">{item.name}</h4>
                        {item.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{item.description}</p>}
                        <div className="mt-auto flex items-center justify-between">
                          <span className="font-bold text-emerald-700">${item.price.toFixed(2)}</span>
                          {isLow && <span className="text-xs text-amber-600 font-medium">Últimos</span>}
                          {isOut && <span className="text-xs text-red-500 font-medium">Agotado</span>}
                        </div>
                        {!isOut && (
                          <button
                            onClick={() => addToCart({ productId: item.id, menuItemId: item.menuItemId, name: item.name, price: item.price })}
                            className="mt-2 w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg active:bg-emerald-700 transition-colors cursor-pointer border-none"
                          >
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Cart FAB */}
      {totalQty > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 right-6 bg-emerald-600 text-white rounded-full w-16 h-16 shadow-lg flex items-center justify-center text-2xl active:scale-95 transition-transform z-40 cursor-pointer border-none"
        >
          <span>🛒</span>
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">{totalQty}</span>
        </button>
      )}

      {/* Cart Overlay */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={e => e.target === e.currentTarget && setCartOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold">Tu Pedido</h2>
              <button onClick={() => setCartOpen(false)} className="text-2xl text-slate-400 cursor-pointer bg-transparent border-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-slate-400 text-center">El carrito está vacío</p>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-emerald-600 font-bold text-sm">${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-full bg-white border border-slate-300 text-lg cursor-pointer flex items-center justify-center">−</button>
                        <span className="font-bold text-sm w-6 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-full bg-white border border-slate-300 text-lg cursor-pointer flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={item.notes}
                      onChange={e => updateNotes(idx, e.target.value)}
                      placeholder="Notas (ej: sin cebolla)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
              <button
                onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                disabled={cart.length === 0}
                className="w-full py-4 bg-emerald-600 text-white font-bold text-lg rounded-xl active:bg-emerald-700 transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pagar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Overlay */}
      {checkoutOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-6">
            <h2 className="text-xl font-bold text-center">Método de Pago</h2>
            <div className="grid grid-cols-1 gap-3">
              {[
                { method: 'CASH', label: 'Efectivo', icon: '💵' },
                { method: 'CARD', label: 'Tarjeta', icon: '💳' },
                { method: 'DIGITAL_WALLET', label: 'Billetera Digital', icon: '📱' },
              ].map(({ method, label, icon }) => (
                <button
                  key={method}
                  onClick={() => setSelectedPayment(method)}
                  className={`py-4 px-6 border-2 rounded-xl text-lg font-medium flex items-center gap-3 cursor-pointer bg-white transition-colors ${
                    selectedPayment === method ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'
                  }`}
                >
                  <span className="text-2xl">{icon}</span> {label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Email (opcional, para recibo)</label>
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCheckoutOpen(false)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-medium cursor-pointer bg-white text-slate-700">
                Volver
              </button>
              <button
                onClick={confirmOrder}
                disabled={!selectedPayment}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold cursor-pointer border-none disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Screen */}
      {confirmedOrder && (
        <div className="fixed inset-0 bg-emerald-600 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-md p-8 text-center space-y-6">
            <div className="text-6xl">✅</div>
            <h2 className="text-2xl font-bold text-slate-800">¡Pedido Confirmado!</h2>
            <div className="bg-emerald-50 rounded-xl p-6">
              <p className="text-sm text-emerald-600 font-medium">Tu número de pedido</p>
              <p className="text-6xl font-black text-emerald-700 my-2">#{confirmedOrder.orderNumber}</p>
            </div>
            <div className="text-left text-sm text-slate-600 space-y-1">
              {cart.map((c, i) => (
                <div key={i} className="flex justify-between">
                  <span>{c.quantity}x {c.name}</span>
                  <span>${(c.price * c.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t border-slate-200 pt-2 mt-2">
                <span>Total</span>
                <span>${Number(confirmedOrder.totalAmount).toFixed(2)}</span>
              </div>
            </div>
            <button onClick={newOrder} className="w-full py-4 bg-emerald-600 text-white font-bold text-lg rounded-xl cursor-pointer border-none active:bg-emerald-700">
              Nuevo Pedido
            </button>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-center font-medium">
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2.2 — Verificar que TypeScript compila**

```bash
pnpm --filter @restaurants/ui build
```

Esperado: build exitoso sin errores TypeScript.

- [ ] **Step 2.3 — Commit**

```bash
git add apps/ui/src/components/kiosk/KioskApp.tsx
git commit -m "feat(kiosk): add KioskApp React component — migrated from vanilla JS"
```

---

## Task 3: Actualizar kiosk/index.astro para usar el island

**Archivo:** `apps/ui/src/pages/kiosk/index.astro`

Reemplazar todo el contenido HTML y el `<script>` vanilla por el React island.

- [ ] **Step 3.1 — Reemplazar el contenido completo del archivo**

```astro
---
import KioskLayout from '../../layouts/KioskLayout.astro';
import KioskApp from '../../components/kiosk/KioskApp';

const slug = new URLSearchParams(Astro.url.search).get('r') ?? '';
---

<KioskLayout>
  {slug ? (
    <KioskApp slug={slug} client:load />
  ) : (
    <div class="flex items-center justify-center h-screen text-slate-400">
      Restaurante no especificado. Usa <code class="ml-1">/kiosk?r=tu-restaurante</code>
    </div>
  )}
</KioskLayout>
```

> `Astro.url.search` funciona en modo estático — Astro parsea la URL en build time solo para el frontmatter que lo necesita. El valor del query param en runtime se pasa como prop a React.
>
> **Importante:** en `output: 'static'`, `Astro.url.search` en el frontmatter estará vacío en build time. El componente `KioskApp` recibe un `slug` vacío y la lógica de error interno del componente lo maneja. Como alternativa más robusta, mover completamente la lectura del `slug` dentro del componente React (ya implementado en el Task 2 con `URLSearchParams`).
>
> Si el enfoque anterior genera problemas, usar este frontmatter alternativo que delega todo al componente:

```astro
---
import KioskLayout from '../../layouts/KioskLayout.astro';
import KioskApp from '../../components/kiosk/KioskApp';
---

<KioskLayout>
  <KioskApp slug="" client:load />
</KioskLayout>
```

Y en `KioskApp.tsx`, leer el slug en el `useEffect` inicial:

```tsx
useEffect(() => {
  const s = new URLSearchParams(window.location.search).get('r') ?? '';
  setSlug(s);
}, []);
```

Agregar `const [slug, setSlug] = useState('');` al estado del componente.

- [ ] **Step 3.2 — Verificar build**

```bash
pnpm --filter @restaurants/ui build
```

Esperado: build exitoso, `dist/kiosk/index.html` generado.

- [ ] **Step 3.3 — Commit**

```bash
git add apps/ui/src/pages/kiosk/index.astro
git commit -m "feat(kiosk): mount KioskApp React island in kiosk page"
```

---

## Task 4: Smoke test

- [ ] **Step 4.1 — Rebuild y copiar**

```bash
pnpm --filter @restaurants/ui build && pnpm copy-static
pnpm --filter api-core dev
```

- [ ] **Step 4.2 — Verificar que el kiosk carga con un slug real**

Abrir `http://localhost:3000/kiosk?r=<slug-de-tu-restaurante-en-la-db>`

Esperado:
- La app React carga y muestra "Cargando..."
- Luego muestra las tabs de menú
- Los productos se muestran en la grilla
- El carrito funciona (agregar, quitar, notas)
- El checkout muestra los métodos de pago
- Al confirmar, muestra la pantalla de confirmación con el número de pedido

- [ ] **Step 4.3 — Verificar que el toast de error funciona**

Abrir `http://localhost:3000/kiosk?r=slug-que-no-existe`

Esperado: toast rojo con "No se pudieron cargar los menús"
