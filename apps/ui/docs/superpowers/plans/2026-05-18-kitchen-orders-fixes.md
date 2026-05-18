# Kitchen & Orders Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four issues in the dashboard orders view, kitchen display, and kiosk order-source handling.

**Architecture:** Issues 1–3 are pure frontend label/button changes in React and Astro. Issue 4 requires a backend change (kiosk service + controller accept a `?source=` query param) and a frontend change (kiosk store appends `?source=WEB`). TDD applies to the backend portion of issue 4 — the kiosk service already has a unit test suite.

**Tech Stack:** React (OrderCard), Astro (kitchen page), NestJS (kiosk controller/service), Zustand (kiosk store), Jest/Docker for backend tests.

---

## File Map

| File | Change |
|------|--------|
| `apps/ui/src/components/dash/orders/OrderCard.tsx` | Issues 1 & 2: conditional button label + new "Completar" button |
| `apps/ui/src/pages/kitchen/index.astro` | Issue 3: rename "ENTREGADO" → "LISTO" |
| `apps/api-core/src/kiosk/kiosk.service.spec.ts` | Issue 4: new tests for source validation |
| `apps/api-core/src/kiosk/kiosk.service.ts` | Issue 4: accept + validate `source` param |
| `apps/api-core/src/kiosk/kiosk.controller.ts` | Issue 4: read `@Query('source')` and forward it |
| `apps/ui/src/components/kiosk/store/kiosk.store.ts` | Issue 4: append `?source=WEB` to order creation URL |

---

## Task 1: Fix OrderCard SERVED-state buttons (Issues 1 & 2)

**Files:**
- Modify: `apps/ui/src/components/dash/orders/OrderCard.tsx:127-144`

**Context:** Two problems exist for orders in `SERVED` status:
1. The "Marcar Pagado" button actually also completes the order (the backend's `markAsPaid` auto-advances `SERVED → COMPLETED`), but the label doesn't say so.
2. When the order is already paid, there is no button to complete it — only "Desmarcar Pago" is shown.

- [ ] **Step 1: Apply both button changes**

Replace the block at lines 127–144 of `apps/ui/src/components/dash/orders/OrderCard.tsx`:

```tsx
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onUnpay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg cursor-pointer border-none hover:bg-amber-200"
            >
              Desmarcar Pago
            </button>
          )}
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onPay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer border-none hover:bg-emerald-200"
            >
              Marcar Pagado
            </button>
          )}
```

With:

```tsx
          {isActive && order.isPaid && (
            <button
              type="button"
              onClick={() => onUnpay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg cursor-pointer border-none hover:bg-amber-200"
            >
              Desmarcar Pago
            </button>
          )}
          {order.status === 'SERVED' && order.isPaid && (
            <button
              type="button"
              onClick={() => onAdvance(order.id, 'COMPLETED')}
              className="flex-1 py-1.5 text-xs font-medium bg-green-500 text-white rounded-lg cursor-pointer border-none hover:bg-green-600"
            >
              Completar
            </button>
          )}
          {isActive && !order.isPaid && (
            <button
              type="button"
              onClick={() => onPay(order.id)}
              className="py-1.5 px-2 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer border-none hover:bg-emerald-200"
            >
              {order.status === 'SERVED' ? 'Cobrar y Completar' : 'Marcar Pagado'}
            </button>
          )}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/dash/orders/OrderCard.tsx
git commit -m "fix(ui): clarify SERVED-state buttons in OrderCard"
```

---

## Task 2: Fix kitchen button text (Issue 3)

**Files:**
- Modify: `apps/ui/src/pages/kitchen/index.astro:155-158`

**Context:** The button that moves a `PROCESSING` order to `SERVED` says "✓ ENTREGADO" (delivered). From the cook's perspective, their job is done when the food is ready — not when it's delivered to the table. The label should reflect that.

- [ ] **Step 1: Change the button label**

In `apps/ui/src/pages/kitchen/index.astro`, find the `renderCard` function. Replace the `SERVED` action button text:

```javascript
      : `<button data-advance="${order.id}" data-next="SERVED"
           style="width:100%;padding:20px;font-size:20px;font-weight:900;background:#ea580c;color:white;border:none;border-radius:12px;cursor:pointer;margin-top:8px;">
           ✓ ENTREGADO
         </button>`;
```

With:

```javascript
      : `<button data-advance="${order.id}" data-next="SERVED"
           style="width:100%;padding:20px;font-size:20px;font-weight:900;background:#ea580c;color:white;border:none;border-radius:12px;cursor:pointer;margin-top:8px;">
           ✓ LISTO
         </button>`;
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/pages/kitchen/index.astro
git commit -m "fix(ui): rename kitchen PROCESSING button to LISTO"
```

---

## Task 3: Backend — kiosk source validation, TDD (Issue 4)

**Files:**
- Modify: `apps/api-core/src/kiosk/kiosk.service.spec.ts`
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts`
- Modify: `apps/api-core/src/kiosk/kiosk.controller.ts`

**Context:** `createKioskOrder` currently hardcodes `orderSource: 'KIOSK'`. The goal is to accept `source` as an optional parameter, default it to `'KIOSK'`, and reject any value that isn't `'KIOSK'` or `'WEB'` — especially `'STAFF'`, which would grant auto-confirmation privileges to a public endpoint.

- [ ] **Step 1: Write failing tests**

Add `BadRequestException` to the imports at the top of `apps/api-core/src/kiosk/kiosk.service.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
```

Then replace the existing `createKioskOrder` describe block (lines 420–441) with:

```typescript
  // ── createKioskOrder ──────────────────────────────────────────────

  describe('createKioskOrder', () => {
    const mockDto = { items: [], paymentMethod: 'cash' } as any;

    it('throws RegisterNotOpenException when no session is open', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue(null);
      await expect(service.createKioskOrder('test-rest', mockDto)).rejects.toThrow(
        RegisterNotOpenException,
      );
    });

    it('uses KIOSK as default source when source is not provided', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue({ id: 's1' });
      mockOrdersService.createOrder.mockResolvedValue({ id: 'o1' });

      await service.createKioskOrder('test-rest', mockDto);
      expect(mockOrdersService.createOrder).toHaveBeenCalledWith('r1', 's1', {
        ...mockDto,
        orderSource: 'KIOSK',
      });
    });

    it('delegates to ordersService.createOrder when session is open', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue({ id: 's1' });
      const mockOrder = { id: 'o1' };
      mockOrdersService.createOrder.mockResolvedValue(mockOrder);

      const result = await service.createKioskOrder('test-rest', mockDto);
      expect(mockOrdersService.createOrder).toHaveBeenCalledWith('r1', 's1', {
        ...mockDto,
        orderSource: 'KIOSK',
      });
      expect(result).toEqual(mockOrder);
    });

    it('passes WEB as orderSource when source=WEB', async () => {
      mockRestaurantsService.findBySlugWithSettings.mockResolvedValue(mockRestaurant);
      mockRegisterSessionRepo.findOpen.mockResolvedValue({ id: 's1' });
      mockOrdersService.createOrder.mockResolvedValue({ id: 'o1' });

      await service.createKioskOrder('test-rest', mockDto, 'WEB');
      expect(mockOrdersService.createOrder).toHaveBeenCalledWith('r1', 's1', {
        ...mockDto,
        orderSource: 'WEB',
      });
    });

    it('throws BadRequestException when source=STAFF is provided', async () => {
      await expect(service.createKioskOrder('test-rest', mockDto, 'STAFF')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOrdersService.createOrder).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when source is an unknown value', async () => {
      await expect(service.createKioskOrder('test-rest', mockDto, 'INVALID')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOrdersService.createOrder).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests — expect failures on the new source tests**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern="kiosk.service.spec"
```

Expected: 4 new tests fail (`passes WEB`, `throws BadRequestException when STAFF`, `throws BadRequestException when INVALID`, `uses KIOSK as default`).

- [ ] **Step 3: Update kiosk.service.ts**

Add `BadRequestException` to the import in `apps/api-core/src/kiosk/kiosk.service.ts`:

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
```

Replace the `createKioskOrder` method (lines 63–68):

```typescript
  async createKioskOrder(slug: string, dto: CreateOrderDto, source?: string) {
    const ALLOWED_SOURCES = ['KIOSK', 'WEB'];
    const resolvedSource = source ?? 'KIOSK';
    if (!ALLOWED_SOURCES.includes(resolvedSource)) {
      throw new BadRequestException(`Invalid order source: ${resolvedSource}`);
    }
    const restaurant = await this.resolveRestaurant(slug);
    const session = await this.registerSessionRepository.findOpen(restaurant.id);
    if (!session) throw new RegisterNotOpenException();
    return this.ordersService.createOrder(restaurant.id, session.id, { ...dto, orderSource: resolvedSource });
  }
```

- [ ] **Step 4: Update kiosk.controller.ts**

Add `Query` to the `@nestjs/common` import in `apps/api-core/src/kiosk/kiosk.controller.ts`:

```typescript
import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
```

Replace the `createOrder` handler (lines 56–64):

```typescript
  @Post(':slug/orders')
  @ApiOperation({ summary: 'Crear una orden desde el kiosk' })
  @ApiParam({ name: 'slug', description: 'Slug del restaurante', type: String })
  @ApiResponse({ status: 201, description: 'Orden creada exitosamente', type: OrderWithItemsDto })
  @ApiResponse({ status: 400, description: 'Origen de pedido inválido' })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  @ApiResponse({ status: 409, description: 'No hay caja registradora abierta' })
  async createOrder(
    @Param('slug') slug: string,
    @Body() dto: CreateOrderDto,
    @Query('source') source?: string,
  ) {
    return this.kioskService.createKioskOrder(slug, dto, source);
  }
```

- [ ] **Step 5: Run tests — all must pass**

```bash
docker compose exec res-api-core pnpm test -- --testPathPattern="kiosk.service.spec"
```

Expected: all tests pass, including the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/kiosk/kiosk.service.spec.ts \
        apps/api-core/src/kiosk/kiosk.service.ts \
        apps/api-core/src/kiosk/kiosk.controller.ts
git commit -m "feat(api-core): accept ?source= query param on kiosk order creation"
```

---

## Task 4: Frontend — kiosk store sends source=WEB (Issue 4)

**Files:**
- Modify: `apps/ui/src/components/kiosk/store/kiosk.store.ts:276`

**Context:** The web-based kiosk page creates orders via `POST /v1/kiosk/${slug}/orders`. Now that the backend accepts a `?source=` query param, the kiosk web app must send `source=WEB` so orders are tagged with the correct origin.

- [ ] **Step 1: Append ?source=WEB to the order creation URL**

In `apps/ui/src/components/kiosk/store/kiosk.store.ts`, find the order creation fetch call (around line 276). Change:

```typescript
      const res = await kioskFetch(`/v1/kiosk/${slug}/orders`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
```

To:

```typescript
      const res = await kioskFetch(`/v1/kiosk/${slug}/orders?source=WEB`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/components/kiosk/store/kiosk.store.ts
git commit -m "fix(ui): send source=WEB when creating kiosk orders"
```
