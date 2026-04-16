# WebSocket to SSE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el WebSocket gateway (socket.io) con Server-Sent Events. El backend emite un evento cada vez que se crea una orden nueva. El frontend de órdenes se suscribe con `EventSource` nativo del browser, eliminando el polling cada 15 segundos.

**Architecture:** `EventsService` mantiene un `Subject<MessageEvent>` por restaurantId (RxJS). `KioskService` llama a `EventsService.emit()` después de crear una orden. El controller expone `GET /v1/events/:restaurantId/stream` como endpoint SSE. El token JWT viaja como query param `?token=` porque `EventSource` no soporta headers custom. La página `dash/orders.astro` reemplaza el `setInterval` con `EventSource`.

**Tech Stack:** NestJS `@Sse()`, RxJS `Subject`/`Observable`, `EventSource` (browser nativo), `@nestjs/jwt` para validar token en el endpoint SSE.

**Prerequisito:** Plan 1 completado.

**Spec:** `docs/superpowers/specs/2026-04-16-unify-platform-design.md` — sección "Server-Sent Events"

---

## File Map

**Creados:**
- `apps/api-core/src/events/events.service.ts` — mantiene streams por restaurantId
- `apps/api-core/src/events/events.controller.ts` — endpoint `@Sse`

**Modificados:**
- `apps/api-core/src/events/events.module.ts` — exportar `EventsService`, agregar controller
- `apps/api-core/src/kiosk/kiosk.module.ts` — importar `EventsModule`
- `apps/api-core/src/kiosk/kiosk.service.ts` — inyectar `EventsService`, emitir tras crear orden
- `apps/api-core/src/app.module.ts` — sin cambios (ya importa `EventsModule`)
- `apps/ui/src/pages/dash/orders.astro` — reemplazar `setInterval` con `EventSource`

**Eliminados:**
- `apps/api-core/src/events/events.gateway.ts`

**Dependencias a remover de `apps/api-core/package.json`:**
- `socket.io`
- `@nestjs/platform-socket.io`
- `@nestjs/websockets`

---

## Task 1: Crear EventsService

**Archivo:** `apps/api-core/src/events/events.service.ts` (nuevo)

- [ ] **Step 1.1 — Crear el archivo**

```typescript
import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface OrderEvent {
  type: 'new_order';
  restaurantId: string;
  orderId: string;
  orderNumber: number;
}

@Injectable()
export class EventsService {
  private streams = new Map<string, Subject<OrderEvent>>();

  getStream(restaurantId: string): Observable<OrderEvent> {
    if (!this.streams.has(restaurantId)) {
      this.streams.set(restaurantId, new Subject<OrderEvent>());
    }
    return this.streams.get(restaurantId)!.asObservable();
  }

  emit(restaurantId: string, event: OrderEvent): void {
    this.streams.get(restaurantId)?.next(event);
  }
}
```

- [ ] **Step 1.2 — Verificar que TypeScript compila**

```bash
pnpm --filter api-core build
```

Esperado: sin errores.

- [ ] **Step 1.3 — Commit**

```bash
git add apps/api-core/src/events/events.service.ts
git commit -m "feat(events): add EventsService with per-restaurant SSE streams"
```

---

## Task 2: Crear EventsController con endpoint SSE

**Archivo:** `apps/api-core/src/events/events.controller.ts` (nuevo)

El `EventSource` del browser no puede enviar headers custom, así que el JWT viaja en el query param `?token=`. NestJS valida el token con `JwtService` antes de devolver el stream.

- [ ] **Step 2.1 — Crear el archivo**

```typescript
import {
  Controller,
  Get,
  Param,
  Query,
  Sse,
  UnauthorizedException,
  MessageEvent,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';

@Controller({ version: '1', path: 'events' })
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly jwtService: JwtService,
  ) {}

  @Sse(':restaurantId/stream')
  stream(
    @Param('restaurantId') restaurantId: string,
    @Query('token') token: string,
  ): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException();

    try {
      this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException();
    }

    return this.eventsService.getStream(restaurantId).pipe(
      map((event) => ({ data: JSON.stringify(event) }) as MessageEvent),
    );
  }
}
```

- [ ] **Step 2.2 — Verificar compilación**

```bash
pnpm --filter api-core build
```

Esperado: sin errores.

- [ ] **Step 2.3 — Commit**

```bash
git add apps/api-core/src/events/events.controller.ts
git commit -m "feat(events): add SSE controller endpoint at /v1/events/:restaurantId/stream"
```

---

## Task 3: Actualizar EventsModule

**Archivo:** `apps/api-core/src/events/events.module.ts`

Reemplazar el módulo actual (que solo tenía `EventsGateway`) por uno que exponga `EventsService` y registre `EventsController`. Importar `JwtModule` para que `JwtService` esté disponible en el controller.

- [ ] **Step 3.1 — Reemplazar el contenido**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
```

- [ ] **Step 3.2 — Verificar compilación**

```bash
pnpm --filter api-core build
```

Esperado: sin errores TypeScript.

- [ ] **Step 3.3 — Commit**

```bash
git add apps/api-core/src/events/events.module.ts
git commit -m "feat(events): update EventsModule — add controller, export service, wire JwtModule"
```

---

## Task 4: Eliminar EventsGateway

**Archivo a eliminar:** `apps/api-core/src/events/events.gateway.ts`

- [ ] **Step 4.1 — Eliminar el archivo**

```bash
git rm apps/api-core/src/events/events.gateway.ts
```

- [ ] **Step 4.2 — Remover dependencias de socket.io**

```bash
pnpm --filter api-core remove socket.io @nestjs/platform-socket.io @nestjs/websockets
```

- [ ] **Step 4.3 — Verificar que el build sigue compilando**

```bash
pnpm --filter api-core build
```

Esperado: sin errores. Si hay imports rotos de `@nestjs/websockets` en otros archivos, eliminarlos también.

- [ ] **Step 4.4 — Commit**

```bash
git add -A
git commit -m "refactor(events): remove WebSocket gateway and socket.io dependencies"
```

---

## Task 5: Conectar KioskService con EventsService

**Archivos:**
- Modify: `apps/api-core/src/kiosk/kiosk.module.ts`
- Modify: `apps/api-core/src/kiosk/kiosk.service.ts`

Cuando se crea una orden desde el kiosk, `KioskService` emite un evento SSE a los clientes suscritos al restaurante.

- [ ] **Step 5.1 — Actualizar kiosk.module.ts para importar EventsModule**

Leer el archivo actual:

```bash
cat apps/api-core/src/kiosk/kiosk.module.ts
```

Agregar `EventsModule` al array `imports` del módulo. El archivo debería quedar así:

```typescript
import { Module } from '@nestjs/common';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { MenusModule } from '../menus/menus.module';
import { OrdersModule } from '../orders/orders.module';
import { RegisterModule } from '../register/register.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [RestaurantsModule, MenusModule, OrdersModule, RegisterModule, EventsModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
```

> Si el archivo actual tiene imports distintos, mantenerlos y solo agregar `EventsModule` al array.

- [ ] **Step 5.2 — Actualizar kiosk.service.ts para inyectar EventsService y emitir tras crear orden**

Encontrar el método `createKioskOrder` en `apps/api-core/src/kiosk/kiosk.service.ts`. Hacer dos cambios:

**1. Agregar `EventsService` al constructor:**

```typescript
import { EventsService } from '../events/events.service';

// En el constructor, agregar:
constructor(
  private readonly restaurantsService: RestaurantsService,
  private readonly menuRepository: MenuRepository,
  private readonly ordersService: OrdersService,
  private readonly registerSessionRepository: RegisterSessionRepository,
  private readonly eventsService: EventsService,   // ← agregar
) {}
```

**2. Emitir evento al final de `createKioskOrder`:**

```typescript
async createKioskOrder(slug: string, dto: CreateOrderDto) {
  const restaurant = await this.resolveRestaurant(slug);

  const session = await this.registerSessionRepository.findOpen(restaurant.id);
  if (!session) throw new RegisterNotOpenException();

  const order = await this.ordersService.createOrder(restaurant.id, session.id, dto);

  // Notificar al dashboard via SSE
  this.eventsService.emit(restaurant.id, {
    type: 'new_order',
    restaurantId: restaurant.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
  });

  return order;
}
```

- [ ] **Step 5.3 — Verificar compilación**

```bash
pnpm --filter api-core build
```

Esperado: sin errores TypeScript.

- [ ] **Step 5.4 — Commit**

```bash
git add apps/api-core/src/kiosk/
git commit -m "feat(kiosk): emit SSE event after order creation"
```

---

## Task 6: Actualizar el frontend de órdenes

**Archivo:** `apps/ui/src/pages/dash/orders.astro`

Reemplazar el `setInterval(loadOrders, 15000)` (polling cada 15 segundos) con `EventSource`. Al recibir un evento de nueva orden, recargar la lista.

El token JWT está en `localStorage` — se pasa como query param al crear el `EventSource`.

- [ ] **Step 6.1 — Agregar conexión SSE al script existente**

En el `<script>` de `orders.astro`, encontrar la línea:

```typescript
// Auto-refresh every 15 seconds
setInterval(loadOrders, 15000);
```

Reemplazar esas dos líneas con:

```typescript
// Real-time updates via SSE
function startSSE(restaurantId: string) {
  const token = localStorage.getItem('accessToken');
  if (!token) return;

  const es = new EventSource(`/v1/events/${restaurantId}/stream?token=${encodeURIComponent(token)}`);

  es.onmessage = () => {
    loadOrders();
  };

  es.onerror = () => {
    // On error, fall back to polling every 15 seconds
    es.close();
    setInterval(loadOrders, 15_000);
  };
}

// Read restaurantId from the auth token payload (stored as JSON in localStorage)
const rawUser = localStorage.getItem('user');
if (rawUser) {
  try {
    const user = JSON.parse(rawUser) as { restaurantId?: string };
    if (user.restaurantId) startSSE(user.restaurantId);
  } catch {
    // ignore parse error — no SSE
  }
}
```

> **Nota sobre `localStorage.getItem('user')`:** La forma exacta en que `auth.ts` almacena el usuario puede variar. Verificar en `apps/ui/src/lib/auth.ts` cómo se guarda el `restaurantId` y ajustar si es necesario.

- [ ] **Step 6.2 — Revisar auth.ts para confirmar cómo se accede al restaurantId**

```bash
cat apps/ui/src/lib/auth.ts
```

Si el `restaurantId` no está directamente en `localStorage.getItem('user')`, ajustar el Step 6.1 para usar la función/key correcta.

- [ ] **Step 6.3 — Verificar que el build compila**

```bash
pnpm --filter @restaurants/ui build
```

Esperado: build exitoso sin errores.

- [ ] **Step 6.4 — Commit**

```bash
git add apps/ui/src/pages/dash/orders.astro
git commit -m "feat(orders): replace polling with SSE EventSource for real-time updates"
```

---

## Task 7: Smoke test

- [ ] **Step 7.1 — Rebuild y copiar estáticos**

```bash
pnpm --filter @restaurants/ui build && pnpm copy-static && pnpm --filter api-core build
```

- [ ] **Step 7.2 — Levantar NestJS**

```bash
pnpm --filter api-core dev
```

- [ ] **Step 7.3 — Verificar endpoint SSE sin token**

```bash
curl -i "http://localhost:3000/v1/events/test-id/stream"
```

Esperado: `401 Unauthorized`

- [ ] **Step 7.4 — Verificar endpoint SSE con token inválido**

```bash
curl -i "http://localhost:3000/v1/events/test-id/stream?token=invalid"
```

Esperado: `401 Unauthorized`

- [ ] **Step 7.5 — Verificar flujo completo en browser**

1. Abrir `http://localhost:3000/login` y hacer login
2. Navegar a `http://localhost:3000/dash/orders`
3. Abrir DevTools → Network → filtrar por "stream"
4. Esperado: una conexión SSE activa a `/v1/events/:restaurantId/stream?token=...`
5. Desde otro tab, hacer un pedido en el kiosk (`/kiosk?r=tu-slug`)
6. Esperado: la tabla de órdenes se actualiza automáticamente sin recargar la página
