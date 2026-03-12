# Kitchen Display & Auto-Print Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a token-authenticated kitchen display (real-time WebSocket, full order operations) and automatic ticket printing on order creation.

**Architecture:** New `KitchenModule` with `KitchenTokenGuard` for public token-based access; `EventsGateway` extended with `kitchen:${restaurantId}` Socket.IO room; `PrintService` extended with `KitchenTicket` and fire-and-forget print on `createOrder`; standalone Astro page for the kitchen display UI.

**Tech Stack:** NestJS, Prisma (SQLite), Socket.IO, Astro, Tailwind CSS

**ADRs:** `docs/adr/2026-03-09-kitchen-display.md`, `docs/adr/2026-03-09-auto-print-on-order.md`

---

## Chunk 1: Schema, Config & Print Foundation

### Task 1: Schema + Config + DB Reset

**Files:**
- Modify: `apps/api-core/prisma/schema.prisma`
- Modify: `apps/api-core/src/config.ts`
- Modify: `apps/api-core/docs/environments.md`

- [ ] **Step 1: Add kitchenToken fields to Restaurant model**

In `apps/api-core/prisma/schema.prisma`, add inside `model Restaurant` after the `slug` line:

```prisma
  kitchenToken          String?   @unique
  kitchenTokenExpiresAt DateTime?
```

- [ ] **Step 2: Add KITCHEN_TOKEN_EXPIRY_DAYS to config.ts**

In `apps/api-core/src/config.ts`, add after the `BCRYPT_SALT_ROUNDS` line:

```ts
// kitchen
export const KITCHEN_TOKEN_EXPIRY_DAYS = Number(process.env.KITCHEN_TOKEN_EXPIRY_DAYS) || 60;
```

- [ ] **Step 3: Reset DB and regenerate Prisma client**

```bash
cd apps/api-core
npx prisma db push --force-reset
npx prisma generate
```

Expected: `✓ Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Update environments.md**

Add to `apps/api-core/docs/environments.md` under a new `### KITCHEN MODULE` section:

```markdown
### KITCHEN MODULE

- **KITCHEN_TOKEN_EXPIRY_DAYS**: Días de validez del token de cocina.
  - Default: `60`
  - Required: `false`
```

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/prisma/schema.prisma apps/api-core/src/config.ts apps/api-core/docs/environments.md docs/adr/
git commit -m "feat(schema): add kitchenToken fields to Restaurant + KITCHEN_TOKEN_EXPIRY_DAYS config"
```

---

### Task 2: PrintService — KitchenTicket interface + generateBoth

**Files:**
- Create: `apps/api-core/src/print/interfaces/kitchen-ticket.interface.ts`
- Modify: `apps/api-core/src/print/print.service.ts`
- Modify: `apps/api-core/src/print/print.controller.ts`

- [ ] **Step 1: Create KitchenTicket interface**

Create `apps/api-core/src/print/interfaces/kitchen-ticket.interface.ts`:

```ts
export interface KitchenTicket {
  orderNumber: number;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    notes?: string;
  }>;
}
```

- [ ] **Step 2: Add generateKitchenTicket, printKitchenTicket, generateBoth to PrintService**

Replace the full content of `apps/api-core/src/print/print.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OrderRepository } from '../orders/order.repository';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { Receipt } from './interfaces/receipt.interface';
import { KitchenTicket } from './interfaces/kitchen-ticket.interface';
import { EntityNotFoundException } from '../common/exceptions';

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async generateReceipt(orderId: string): Promise<Receipt> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);

    const restaurant = await this.restaurantsService.findById(order.restaurantId);
    if (!restaurant) throw new EntityNotFoundException('Restaurant', order.restaurantId);

    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      restaurantName: restaurant.name,
      orderNumber: order.orderNumber,
      date: order.createdAt.toISOString(),
      items: orderWithItems.items.map((item) => ({
        productName: item.product?.name || 'Unknown',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        notes: item.notes || undefined,
      })),
      totalAmount: Number(order.totalAmount),
      paymentMethod: order.paymentMethod || 'UNKNOWN',
      customerEmail: order.customerEmail || undefined,
    };
  }

  async generateKitchenTicket(orderId: string): Promise<KitchenTicket> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new EntityNotFoundException('Order', orderId);

    const orderWithItems = order as typeof order & {
      items: Prisma.OrderItemGetPayload<{ include: { product: true } }>[];
    };
    return {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      items: orderWithItems.items.map((item) => ({
        productName: item.product?.name || 'Unknown',
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
    };
  }

  async generateBoth(orderId: string): Promise<{ receipt: Receipt; kitchenTicket: KitchenTicket }> {
    const [receipt, kitchenTicket] = await Promise.all([
      this.generateReceipt(orderId),
      this.generateKitchenTicket(orderId),
    ]);
    return { receipt, kitchenTicket };
  }

  async printReceipt(orderId: string): Promise<{ success: boolean; message: string }> {
    const receipt = await this.generateReceipt(orderId);
    this.logger.log(`[PRINT STUB] Receipt for order #${receipt.orderNumber}: ${JSON.stringify(receipt)}`);
    return {
      success: true,
      message: `Receipt for order #${receipt.orderNumber} sent to printer (stub)`,
    };
  }

  async printKitchenTicket(orderId: string): Promise<{ success: boolean; message: string }> {
    const ticket = await this.generateKitchenTicket(orderId);
    this.logger.log(`[PRINT STUB] Kitchen ticket for order #${ticket.orderNumber}: ${JSON.stringify(ticket)}`);
    return {
      success: true,
      message: `Kitchen ticket for order #${ticket.orderNumber} sent to printer (stub)`,
    };
  }
}
```

- [ ] **Step 3: Add kitchen ticket endpoint to PrintController**

In `apps/api-core/src/print/print.controller.ts`, add after the existing `printReceipt` method:

```ts
  @Get('kitchen-ticket/:orderId')
  async getKitchenTicket(@Param('orderId') orderId: string) {
    return this.printService.generateKitchenTicket(orderId);
  }

  @Post('kitchen-ticket/:orderId/print')
  async printKitchenTicket(@Param('orderId') orderId: string) {
    return this.printService.printKitchenTicket(orderId);
  }
```

- [ ] **Step 4: Run existing print-related tests to verify nothing broke**

```bash
cd apps/api-core
npx jest --testPathPattern="print|orders" --passWithNoTests
```

Expected: PASS (or no tests for print yet — OK)

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/print/
git commit -m "feat(print): add KitchenTicket interface, generateKitchenTicket, generateBoth, printKitchenTicket"
```

---

## Chunk 2: Events Gateway + OrdersService

### Task 3: EventsGateway — kitchen room + kitchenToken auth

**Files:**
- Modify: `apps/api-core/src/events/events.gateway.ts`
- Modify: `apps/api-core/src/events/orders.events.ts`

- [ ] **Step 1: Extend EventsGateway with kitchen room support**

Replace full content of `apps/api-core/src/events/events.gateway.ts`:

```ts
import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { FRONTEND_URL } from '../config';

@WebSocketGateway({
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly restaurantsService: RestaurantsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const slug = client.handshake.query?.slug as string | undefined;
      const kitchenToken = client.handshake.auth?.kitchenToken as string | undefined;

      // Dashboard: JWT auth
      if (token) {
        const payload = this.jwtService.verify<{ restaurantId: string }>(token);
        client.join(`restaurant:${payload.restaurantId}`);
        this.logger.log(`Dashboard connected: ${client.id} → restaurant:${payload.restaurantId}`);
        return;
      }

      // Kitchen display: kitchenToken + slug auth
      if (kitchenToken && slug) {
        const restaurant = await this.restaurantsService.findBySlug(slug);
        if (!restaurant || restaurant.kitchenToken !== kitchenToken) {
          client.disconnect();
          return;
        }
        if (restaurant.kitchenTokenExpiresAt && restaurant.kitchenTokenExpiresAt < new Date()) {
          this.logger.warn(`Kitchen token expired for slug: ${slug}`);
          client.disconnect();
          return;
        }
        client.join(`kitchen:${restaurant.id}`);
        this.logger.log(`Kitchen connected: ${client.id} → kitchen:${restaurant.id}`);
        return;
      }

      // Kiosk: slug only
      if (slug) {
        const restaurant = await this.restaurantsService.findBySlug(slug);
        if (!restaurant) {
          client.disconnect();
          return;
        }
        client.join(`kiosk:${restaurant.id}`);
        this.logger.log(`Kiosk connected: ${client.id} → kiosk:${restaurant.id}`);
        return;
      }

      client.disconnect();
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToRestaurant(restaurantId: string, event: string, data: unknown) {
    this.server.to(`restaurant:${restaurantId}`).emit(event, data);
  }

  emitToKiosk(restaurantId: string, event: string, data: unknown) {
    this.server.to(`kiosk:${restaurantId}`).emit(event, data);
  }

  emitToKitchen(restaurantId: string, event: string, data: unknown) {
    this.server.to(`kitchen:${restaurantId}`).emit(event, data);
  }
}
```

- [ ] **Step 2: Emit order events to kitchen room in OrderEventsService**

Replace full content of `apps/api-core/src/events/orders.events.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Order } from '@prisma/client';
import { EventsGateway } from './events.gateway';

export const ORDER_EVENTS = {
  NEW: 'order:new',
  UPDATED: 'order:updated',
} as const;

@Injectable()
export class OrderEventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitOrderCreated(restaurantId: string, order: Order): void {
    this.gateway.emitToRestaurant(restaurantId, ORDER_EVENTS.NEW, { order });
    this.gateway.emitToKitchen(restaurantId, ORDER_EVENTS.NEW, { order });
  }

  emitOrderUpdated(restaurantId: string, order: Order): void {
    this.gateway.emitToRestaurant(restaurantId, ORDER_EVENTS.UPDATED, { order });
    this.gateway.emitToKitchen(restaurantId, ORDER_EVENTS.UPDATED, { order });
  }
}
```

- [ ] **Step 3: Run events tests**

```bash
cd apps/api-core
npx jest --testPathPattern="events" --passWithNoTests
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/events/
git commit -m "feat(events): add kitchen WebSocket room with kitchenToken auth, emit order events to kitchen"
```

---

### Task 4: OrdersService — fire-and-forget print + enriched createOrder response + kitchenAdvanceStatus

**Files:**
- Modify: `apps/api-core/src/orders/orders.service.ts`
- Modify: `apps/api-core/src/orders/orders.service.spec.ts`

- [ ] **Step 1: Update createOrder to be fire-and-forget print + enriched response**

In `apps/api-core/src/orders/orders.service.ts`, replace `createOrder`:

```ts
  async createOrder(restaurantId: string, registerSessionId: string, dto: CreateOrderDto) {
    const order = await this.prisma.$transaction(async (tx) => {
      const { orderItems, stockEntries, totalAmount } = await this.validateAndBuildItems(restaurantId, dto, tx);
      this.validateExpectedTotal(totalAmount, dto.expectedTotal);
      await this.decrementAllStock(stockEntries, tx);
      const created = await this.persistOrder({ restaurantId, registerSessionId, totalAmount, dto, orderItems }, tx);
      this.orderEventsService.emitOrderCreated(restaurantId, created);
      return created;
    });

    // Fire-and-forget: physical print — never blocks the response
    void this.printService.printKitchenTicket(order.id).catch((err) =>
      this.logger.warn(`Kitchen print failed for order #${order.orderNumber}: ${err.message}`),
    );

    // Generate tickets for frontend — null-safe, never blocks
    const tickets = await this.printService.generateBoth(order.id).catch(() => null);

    return {
      order,
      receipt: tickets?.receipt ?? null,
      kitchenTicket: tickets?.kitchenTicket ?? null,
    };
  }
```

- [ ] **Step 2: Add kitchenAdvanceStatus method**

In `apps/api-core/src/orders/orders.service.ts`, add after `cancelOrder`:

```ts
  async kitchenAdvanceStatus(id: string, restaurantId: string, newStatus: OrderStatus) {
    const order = await this.findById(id, restaurantId);

    if (order.status === OrderStatus.CANCELLED) throw new OrderAlreadyCancelledException(id);

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    const targetIdx = STATUS_ORDER.indexOf(newStatus);
    if (targetIdx !== currentIdx + 1 || targetIdx === -1) {
      throw new InvalidStatusTransitionException(order.status, newStatus);
    }

    // Kitchen can complete without payment check — payment is handled by the cashier
    const updated = await this.orderRepository.updateStatus(id, newStatus);
    this.orderEventsService.emitOrderUpdated(restaurantId, updated);
    return updated;
  }
```

- [ ] **Step 3: Update the mock in orders.service.spec.ts to include generateBoth**

In `apps/api-core/src/orders/orders.service.spec.ts`, change:
```ts
const mockPrint = { generateReceipt: jest.fn() };
```
to:
```ts
const mockPrint = {
  generateReceipt: jest.fn(),
  generateBoth: jest.fn().mockResolvedValue({ receipt: {}, kitchenTicket: {} }),
  printKitchenTicket: jest.fn().mockResolvedValue({ success: true, message: '' }),
};
```

- [ ] **Step 4: Run orders tests**

```bash
cd apps/api-core
npx jest --testPathPattern="orders" --passWithNoTests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/orders/
git commit -m "feat(orders): fire-and-forget kitchen print on createOrder, enriched response, kitchenAdvanceStatus"
```

---

## Chunk 3: KitchenModule

### Task 5: KitchenModule — guard, DTOs, service, controller, module

**Files:**
- Create: `apps/api-core/src/kitchen/guards/kitchen-token.guard.ts`
- Create: `apps/api-core/src/kitchen/dto/update-kitchen-status.dto.ts`
- Create: `apps/api-core/src/kitchen/dto/cancel-kitchen-order.dto.ts`
- Create: `apps/api-core/src/kitchen/kitchen.service.ts`
- Create: `apps/api-core/src/kitchen/kitchen.controller.ts`
- Create: `apps/api-core/src/kitchen/kitchen.module.ts`
- Create: `apps/api-core/src/kitchen/kitchen.service.spec.ts`

- [ ] **Step 1: Create KitchenTokenGuard**

Create `apps/api-core/src/kitchen/guards/kitchen-token.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RestaurantsService } from '../../restaurants/restaurants.service';

export const KITCHEN_RESTAURANT_KEY = 'kitchenRestaurant';

@Injectable()
export class KitchenTokenGuard implements CanActivate {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const slug = req.params['slug'];
    const token = req.query['token'] as string | undefined;

    if (!slug || !token) throw new UnauthorizedException('Kitchen token required');

    const restaurant = await this.restaurantsService.findBySlug(slug);
    if (!restaurant || restaurant.kitchenToken !== token) {
      throw new UnauthorizedException('Invalid kitchen token');
    }

    if (restaurant.kitchenTokenExpiresAt && restaurant.kitchenTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Kitchen token expired');
    }

    req[KITCHEN_RESTAURANT_KEY] = restaurant;
    return true;
  }
}
```

- [ ] **Step 2: Create DTOs**

Create `apps/api-core/src/kitchen/dto/update-kitchen-status.dto.ts`:

```ts
import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateKitchenStatusDto {
  @IsEnum([OrderStatus.PROCESSING, OrderStatus.COMPLETED], {
    message: 'Kitchen can only advance to PROCESSING or COMPLETED',
  })
  status: OrderStatus.PROCESSING | OrderStatus.COMPLETED;
}
```

Create `apps/api-core/src/kitchen/dto/cancel-kitchen-order.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class CancelKitchenOrderDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
```

- [ ] **Step 3: Create KitchenService**

Create `apps/api-core/src/kitchen/kitchen.service.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, Restaurant } from '@prisma/client';
import { randomBytes } from 'crypto';

import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { EventsGateway } from '../events/events.gateway';
import { KITCHEN_TOKEN_EXPIRY_DAYS } from '../config';

@Injectable()
export class KitchenService {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly ordersService: OrdersService,
    private readonly orderRepository: OrderRepository,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async getActiveOrders(restaurant: Restaurant) {
    const orders = await this.orderRepository.findByRestaurantId(restaurant.id);
    return orders.filter(
      (o) => o.status === OrderStatus.CREATED || o.status === OrderStatus.PROCESSING,
    );
  }

  async advanceStatus(restaurant: Restaurant, orderId: string, status: OrderStatus) {
    return this.ordersService.kitchenAdvanceStatus(orderId, restaurant.id, status);
  }

  async cancelOrder(restaurant: Restaurant, orderId: string, reason: string) {
    return this.ordersService.cancelOrder(orderId, restaurant.id, reason);
  }

  async generateToken(restaurantId: string): Promise<{ token: string; expiresAt: Date; kitchenUrl: string }> {
    const restaurant = await this.restaurantsService.findById(restaurantId);
    if (!restaurant) throw new UnauthorizedException();

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + KITCHEN_TOKEN_EXPIRY_DAYS);

    await this.restaurantsService.update(restaurantId, {
      kitchenToken: token,
      kitchenTokenExpiresAt: expiresAt,
    } as any);

    return {
      token,
      expiresAt,
      kitchenUrl: `/kitchen/${restaurant.slug}?token=${token}`,
    };
  }

  async notifyOffline(restaurant: Restaurant) {
    this.eventsGateway.emitToRestaurant(restaurant.id, 'kitchen:offline', {
      slug: restaurant.slug,
      since: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Create KitchenController**

Create `apps/api-core/src/kitchen/kitchen.controller.ts`:

```ts
import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@prisma/client';

import { KitchenService } from './kitchen.service';
import { KitchenTokenGuard, KITCHEN_RESTAURANT_KEY } from './guards/kitchen-token.guard';
import { UpdateKitchenStatusDto } from './dto/update-kitchen-status.dto';
import { CancelKitchenOrderDto } from './dto/cancel-kitchen-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller({ version: '1', path: 'kitchen' })
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  // ── ADMIN: generate token ──────────────────────────────────────────
  @Post('token/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async generateToken(@Req() req: Request) {
    const user = (req as any).user;
    return this.kitchenService.generateToken(user.restaurantId);
  }

  // ── Kitchen display: token-authenticated ───────────────────────────
  @Get(':slug/orders')
  @UseGuards(KitchenTokenGuard)
  async getActiveOrders(@Req() req: Request) {
    return this.kitchenService.getActiveOrders(req[KITCHEN_RESTAURANT_KEY]);
  }

  @Patch(':slug/orders/:id/status')
  @UseGuards(KitchenTokenGuard)
  async advanceStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStatusDto,
  ) {
    return this.kitchenService.advanceStatus(req[KITCHEN_RESTAURANT_KEY], id, dto.status);
  }

  @Patch(':slug/orders/:id/cancel')
  @UseGuards(KitchenTokenGuard)
  async cancelOrder(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelKitchenOrderDto,
  ) {
    return this.kitchenService.cancelOrder(req[KITCHEN_RESTAURANT_KEY], id, dto.reason);
  }

  @Post(':slug/notify-offline')
  @UseGuards(KitchenTokenGuard)
  async notifyOffline(@Req() req: Request) {
    await this.kitchenService.notifyOffline(req[KITCHEN_RESTAURANT_KEY]);
    return { notified: true };
  }
}
```

- [ ] **Step 5: Create KitchenModule**

Create `apps/api-core/src/kitchen/kitchen.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { KitchenTokenGuard } from './guards/kitchen-token.guard';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { OrdersModule } from '../orders/orders.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [RestaurantsModule, OrdersModule, EventsModule],
  controllers: [KitchenController],
  providers: [KitchenService, KitchenTokenGuard],
})
export class KitchenModule {}
```

- [ ] **Step 6: Register KitchenModule in AppModule**

In `apps/api-core/src/app.module.ts`, add:

```ts
import { KitchenModule } from './kitchen/kitchen.module';
```

And add `KitchenModule` to the `imports` array after `KioskModule`.

- [ ] **Step 7: Write KitchenService unit tests**

Create `apps/api-core/src/kitchen/kitchen.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/order.repository';
import { EventsGateway } from '../events/events.gateway';

const mockRestaurantsService = {
  findById: jest.fn(),
  findBySlug: jest.fn(),
  update: jest.fn(),
};
const mockOrdersService = {
  kitchenAdvanceStatus: jest.fn(),
  cancelOrder: jest.fn(),
};
const mockOrderRepository = {
  findByRestaurantId: jest.fn(),
};
const mockEventsGateway = {
  emitToRestaurant: jest.fn(),
};

const makeRestaurant = (overrides = {}) => ({
  id: 'r1',
  slug: 'test-restaurant',
  name: 'Test Restaurant',
  kitchenToken: 'token123',
  kitchenTokenExpiresAt: new Date(Date.now() + 86400000),
  ...overrides,
});

describe('KitchenService', () => {
  let service: KitchenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: OrderRepository, useValue: mockOrderRepository },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();
    service = module.get(KitchenService);
  });

  describe('getActiveOrders', () => {
    it('returns only CREATED and PROCESSING orders', async () => {
      const orders = [
        { id: '1', status: OrderStatus.CREATED },
        { id: '2', status: OrderStatus.PROCESSING },
        { id: '3', status: OrderStatus.COMPLETED },
        { id: '4', status: OrderStatus.CANCELLED },
      ];
      mockOrderRepository.findByRestaurantId.mockResolvedValue(orders);
      const result = await service.getActiveOrders(makeRestaurant() as any);
      expect(result).toHaveLength(2);
      expect(result.map((o) => o.status)).toEqual([OrderStatus.CREATED, OrderStatus.PROCESSING]);
    });
  });

  describe('generateToken', () => {
    it('generates a token and returns kitchenUrl', async () => {
      mockRestaurantsService.findById.mockResolvedValue(makeRestaurant());
      mockRestaurantsService.update.mockResolvedValue({});
      const result = await service.generateToken('r1');
      expect(result.token).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(result.kitchenUrl).toContain('/kitchen/test-restaurant?token=');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('throws UnauthorizedException if restaurant not found', async () => {
      mockRestaurantsService.findById.mockResolvedValue(null);
      await expect(service.generateToken('bad-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('notifyOffline', () => {
    it('emits kitchen:offline to restaurant room', async () => {
      await service.notifyOffline(makeRestaurant() as any);
      expect(mockEventsGateway.emitToRestaurant).toHaveBeenCalledWith(
        'r1',
        'kitchen:offline',
        expect.objectContaining({ slug: 'test-restaurant' }),
      );
    });
  });
});
```

- [ ] **Step 8: Run kitchen tests**

```bash
cd apps/api-core
npx jest --testPathPattern="kitchen" --passWithNoTests
```

Expected: PASS (3 test suites)

- [ ] **Step 9: Run full test suite**

```bash
cd apps/api-core
npx jest --passWithNoTests
```

Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api-core/src/kitchen/ apps/api-core/src/app.module.ts
git commit -m "feat(kitchen): add KitchenModule with token guard, service, controller, and unit tests"
```

---

## Chunk 4: Frontend Kitchen Display

### Task 6: Frontend — Kitchen Page (Astro)

**Files:**
- Modify: `apps/ui-dashboard/src/lib/socket.ts`
- Create: `apps/ui-dashboard/src/pages/kitchen/[slug].astro`

- [ ] **Step 1: Add createKitchenSocket to socket.ts**

In `apps/ui-dashboard/src/lib/socket.ts`, add after `createDashboardSocket`:

```ts
export function createKitchenSocket(kitchenToken: string, slug: string): Socket {
  return io(WS_URL, {
    auth: { kitchenToken, slug },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
```

- [ ] **Step 2: Create the kitchen display page**

Create `apps/ui-dashboard/src/pages/kitchen/[slug].astro`:

```astro
---
export const prerender = true;
---

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cocina</title>
  <link rel="stylesheet" href="/styles/global.css" />
  <style>
    body { background: #111827; color: #f9fafb; font-family: system-ui, sans-serif; margin: 0; }
  </style>
</head>
<body class="min-h-screen bg-gray-900 text-white">

  <!-- Connection status banner -->
  <div id="connBanner" class="hidden fixed top-0 left-0 right-0 z-50 text-center py-2 text-sm font-semibold"></div>

  <!-- Offline overlay -->
  <div id="offlineOverlay" class="hidden fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center gap-4 p-8">
    <div class="text-6xl">📡</div>
    <h2 class="text-2xl font-bold text-white">Sin conexión</h2>
    <p class="text-gray-400 text-center max-w-sm">La pantalla de cocina está desconectada.<br/>El equipo del restaurante fue notificado.</p>
    <p class="text-gray-600 text-sm">Reconectando automáticamente...</p>
  </div>

  <!-- Header -->
  <header class="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
    <h1 class="text-xl font-bold tracking-wide">🍳 COCINA</h1>
    <div id="connDot" class="w-3 h-3 rounded-full bg-green-400"></div>
  </header>

  <!-- Kanban: NUEVOS | EN PROCESO -->
  <main class="grid grid-cols-2 gap-0 min-h-[calc(100vh-64px)]">

    <!-- NUEVOS (CREATED) -->
    <div class="border-r border-gray-700 flex flex-col">
      <div class="bg-yellow-500/20 border-b border-yellow-500/30 px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-bold text-yellow-400 uppercase tracking-widest">Nuevos</h2>
        <span id="countCreated" class="bg-yellow-500/30 text-yellow-300 text-sm font-bold px-3 py-1 rounded-full">0</span>
      </div>
      <div id="colCreated" class="flex-1 p-4 space-y-4 overflow-y-auto">
        <p class="text-gray-600 text-center py-8">Cargando...</p>
      </div>
    </div>

    <!-- EN PROCESO (PROCESSING) -->
    <div class="flex flex-col">
      <div class="bg-blue-500/20 border-b border-blue-500/30 px-6 py-4 flex items-center justify-between">
        <h2 class="text-lg font-bold text-blue-400 uppercase tracking-widest">En Proceso</h2>
        <span id="countProcessing" class="bg-blue-500/30 text-blue-300 text-sm font-bold px-3 py-1 rounded-full">0</span>
      </div>
      <div id="colProcessing" class="flex-1 p-4 space-y-4 overflow-y-auto">
        <p class="text-gray-600 text-center py-8">Cargando...</p>
      </div>
    </div>
  </main>

  <!-- Cancel Modal -->
  <div id="cancelModal" class="hidden fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
    <div class="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-md p-8 space-y-6">
      <h3 class="text-2xl font-bold">Cancelar pedido</h3>
      <div>
        <label class="block text-sm font-medium text-gray-400 mb-2">Motivo de cancelación *</label>
        <input
          id="cancelReasonInput"
          type="text"
          placeholder="Ej: Sin ingredientes, error del cliente..."
          class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white text-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <p id="cancelReasonError" class="hidden mt-2 text-sm text-red-400">El motivo es requerido</p>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <button id="cancelModalDismiss"
          class="py-4 text-lg font-bold bg-gray-700 hover:bg-gray-600 rounded-xl cursor-pointer border-none text-white">
          Volver
        </button>
        <button id="cancelModalConfirm"
          class="py-4 text-lg font-bold bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer border-none text-white">
          Confirmar
        </button>
      </div>
    </div>
  </div>

</body>
</html>

<script>
  import { createKitchenSocket } from '../../lib/socket';

  const API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

  // Read slug and token from URL
  const slug = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  if (!token) {
    document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:#ef4444;font-size:1.5rem">Token de cocina requerido</div>';
    throw new Error('No kitchen token');
  }

  // Persist token in sessionStorage so page refresh keeps it
  sessionStorage.setItem(`kitchen_token_${slug}`, token);

  const colCreated = document.getElementById('colCreated')!;
  const colProcessing = document.getElementById('colProcessing')!;
  const countCreated = document.getElementById('countCreated')!;
  const countProcessing = document.getElementById('countProcessing')!;
  const connBanner = document.getElementById('connBanner')!;
  const connDot = document.getElementById('connDot')!;
  const offlineOverlay = document.getElementById('offlineOverlay')!;
  const cancelModal = document.getElementById('cancelModal')!;
  const cancelReasonInput = document.getElementById('cancelReasonInput') as HTMLInputElement;
  const cancelReasonError = document.getElementById('cancelReasonError')!;
  const cancelModalDismiss = document.getElementById('cancelModalDismiss')!;
  const cancelModalConfirm = document.getElementById('cancelModalConfirm')!;

  let pendingCancelId: string | null = null;
  let reconnectAttempts = 0;
  let notifiedOffline = false;

  // ── Helpers ───────────────────────────────────────────────────────

  async function kitchenFetch(path: string, options: RequestInit = {}) {
    const separator = path.includes('?') ? '&' : '?';
    return fetch(`${API_URL}${path}${separator}token=${token}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  }

  function showBanner(msg: string, color: 'yellow' | 'red' | 'green') {
    const colors = {
      yellow: 'bg-yellow-500 text-black',
      red: 'bg-red-600 text-white',
      green: 'bg-green-600 text-white',
    };
    connBanner.textContent = msg;
    connBanner.className = `fixed top-0 left-0 right-0 z-50 text-center py-2 text-sm font-semibold ${colors[color]}`;
    connBanner.classList.remove('hidden');
  }

  function hideBanner() { connBanner.classList.add('hidden'); }

  function setConnected() {
    connDot.className = 'w-3 h-3 rounded-full bg-green-400';
    hideBanner();
    offlineOverlay.classList.add('hidden');
    reconnectAttempts = 0;
    notifiedOffline = false;
  }

  // ── Cancel Modal ─────────────────────────────────────────────────

  function openCancelModal(orderId: string) {
    pendingCancelId = orderId;
    cancelReasonInput.value = '';
    cancelReasonError.classList.add('hidden');
    cancelModal.classList.remove('hidden');
    setTimeout(() => cancelReasonInput.focus(), 50);
  }

  function closeCancelModal() {
    cancelModal.classList.add('hidden');
    pendingCancelId = null;
  }

  cancelModalDismiss.addEventListener('click', closeCancelModal);
  cancelModal.addEventListener('click', (e) => { if (e.target === cancelModal) closeCancelModal(); });

  cancelModalConfirm.addEventListener('click', async () => {
    const reason = cancelReasonInput.value.trim();
    if (!reason) {
      cancelReasonError.classList.remove('hidden');
      cancelReasonInput.focus();
      return;
    }
    if (!pendingCancelId) return;

    (cancelModalConfirm as HTMLButtonElement).disabled = true;
    cancelModalConfirm.textContent = 'Cancelando...';

    const res = await kitchenFetch(`/v1/kitchen/${slug}/orders/${pendingCancelId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });

    (cancelModalConfirm as HTMLButtonElement).disabled = false;
    cancelModalConfirm.textContent = 'Confirmar';

    if (res.ok) {
      closeCancelModal();
      loadOrders();
    }
  });

  // ── Render ───────────────────────────────────────────────────────

  function renderCard(order: any): string {
    const time = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const items = (order.items || []).map((i: any) => {
      const notes = i.notes ? `<p class="text-yellow-400 text-base italic ml-4 mt-0.5">${i.notes}</p>` : '';
      return `<p class="text-white text-xl font-medium"><span class="text-2xl font-black">${i.quantity}×</span> ${i.product?.name || i.productName || '?'}</p>${notes}`;
    }).join('');

    const actionBtn = order.status === 'CREATED'
      ? `<button data-advance="${order.id}" data-next="PROCESSING"
           class="advance-btn w-full py-5 text-xl font-black bg-blue-600 hover:bg-blue-700 text-white rounded-2xl cursor-pointer border-none mt-2">
           EN PROCESO →
         </button>`
      : `<button data-advance="${order.id}" data-next="COMPLETED"
           class="advance-btn w-full py-5 text-xl font-black bg-green-600 hover:bg-green-700 text-white rounded-2xl cursor-pointer border-none mt-2">
           ✓ LISTO
         </button>`;

    const cancelBtn = `<button data-cancel="${order.id}"
      class="cancel-btn w-full py-3 text-base font-bold bg-red-900/50 hover:bg-red-800 text-red-300 rounded-2xl cursor-pointer border border-red-700/50 mt-1">
      Cancelar
    </button>`;

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-3" data-order-id="${order.id}">
        <div class="flex items-center justify-between">
          <span class="text-3xl font-black text-white">#${order.orderNumber}</span>
          <span class="text-gray-500 text-base">${time}</span>
        </div>
        <div class="space-y-1 border-t border-gray-700 pt-3">${items}</div>
        ${actionBtn}
        ${cancelBtn}
      </div>
    `;
  }

  function bindCardEvents(container: Element) {
    container.querySelectorAll('.advance-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const el = btn as HTMLElement;
        const id = el.dataset.advance!;
        const next = el.dataset.next!;
        (btn as HTMLButtonElement).disabled = true;
        const res = await kitchenFetch(`/v1/kitchen/${slug}/orders/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: next }),
        });
        (btn as HTMLButtonElement).disabled = false;
        if (res.ok) loadOrders();
      });
    });

    container.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openCancelModal((btn as HTMLElement).dataset.cancel!);
      });
    });
  }

  // ── Load orders ──────────────────────────────────────────────────

  async function loadOrders() {
    const res = await kitchenFetch(`/v1/kitchen/${slug}/orders`).catch(() => null);
    if (!res || !res.ok) return;

    const orders: any[] = await res.json();
    const created = orders.filter((o) => o.status === 'CREATED');
    const processing = orders.filter((o) => o.status === 'PROCESSING');

    countCreated.textContent = String(created.length);
    countProcessing.textContent = String(processing.length);

    const empty = '<p class="text-gray-600 text-center py-12 text-lg">Sin pedidos</p>';
    colCreated.innerHTML = created.length ? created.map(renderCard).join('') : empty;
    colProcessing.innerHTML = processing.length ? processing.map(renderCard).join('') : empty;

    bindCardEvents(colCreated);
    bindCardEvents(colProcessing);
  }

  // ── Socket.IO ────────────────────────────────────────────────────

  const socket = createKitchenSocket(token, slug);

  socket.on('connect', () => {
    setConnected();
    loadOrders();
  });

  socket.on('order:new', () => loadOrders());
  socket.on('order:updated', () => loadOrders());

  socket.on('disconnect', () => {
    connDot.className = 'w-3 h-3 rounded-full bg-yellow-400';
  });

  socket.on('reconnect_attempt', (attempt: number) => {
    reconnectAttempts = attempt;
    if (attempt <= 3) {
      showBanner(`Reconectando... (intento ${attempt})`, 'yellow');
    } else {
      showBanner('Sin conexión', 'red');
      offlineOverlay.classList.remove('hidden');
      connDot.className = 'w-3 h-3 rounded-full bg-red-500';
      if (!notifiedOffline) {
        notifiedOffline = true;
        kitchenFetch(`/v1/kitchen/${slug}/notify-offline`, { method: 'POST' }).catch(() => {});
      }
    }
  });

  socket.on('reconnect', () => {
    setConnected();
    loadOrders();
  });

  loadOrders();
</script>
```

- [ ] **Step 3: Commit**

```bash
git add apps/ui-dashboard/src/lib/socket.ts apps/ui-dashboard/src/pages/kitchen/
git commit -m "feat(ui): add kitchen display page with Socket.IO real-time, touch-friendly UI, offline detection"
```

---

## Chunk 5: Verification

### Task 7: Full verification

- [ ] **Step 1: Run full test suite**

```bash
cd apps/api-core
npx jest --passWithNoTests
```

Expected: all PASS

- [ ] **Step 2: Build api-core**

```bash
cd apps/api-core
npx nest build
```

Expected: no TypeScript errors

- [ ] **Step 3: Build ui-dashboard**

```bash
cd apps/ui-dashboard
npx astro build
```

Expected: no build errors

- [ ] **Step 4: Final commit with docs update**

```bash
git add .
git commit -m "feat: kitchen display + auto-print on order — full implementation"
```
