# Reservations Module Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement table management and reservation booking for the restaurant platform, including backend modules and dashboard UI pages.

**Architecture:** Two NestJS modules (`tables`, `reservations`) follow the repository-service-controller pattern established by `orders` and `cash-register`. `ReservationsService` depends on `TablesRepository` and `RestaurantsService` for validation. The dashboard adds two Astro pages with vanilla JS following the `users.astro` pattern.

**Tech Stack:** NestJS 11, Prisma 7 with SQLite (better-sqlite3 adapter), class-validator, Astro + Tailwind CSS.

---

## File Structure

### New files
```
apps/api-core/prisma/schema.prisma                         (modified)
apps/api-core/src/app.module.ts                            (modified)

apps/api-core/src/tables/
  README.md
  tables.module.ts
  tables.controller.ts
  tables.service.ts
  tables.service.spec.ts
  tables.repository.ts
  dto/create-table.dto.ts
  dto/update-table.dto.ts
  dto/table.dto.ts
  exceptions/tables.exceptions.ts

apps/api-core/src/reservations/
  README.md
  reservations.module.ts
  reservations.controller.ts
  reservations.service.ts
  reservations.service.spec.ts
  reservations.repository.ts
  dto/create-reservation.dto.ts
  dto/update-reservation.dto.ts
  dto/reservation.dto.ts
  exceptions/reservations.exceptions.ts

apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts  (new)
apps/api-core/src/restaurants/restaurants.controller.ts               (modified)

apps/ui-dashboard/src/pages/dash/tables.astro
apps/ui-dashboard/src/pages/dash/reservations.astro
apps/ui-dashboard/src/pages/dash/settings.astro                       (new)
apps/ui-dashboard/src/layouts/DashboardLayout.astro                   (modified)
```

---

## Chunk 1: Database Schema

### Task 1: Update Prisma schema

**Files:**
- Modify: `apps/api-core/prisma/schema.prisma`

- [ ] **Step 1: Add `defaultReservationDuration` to `Restaurant`, add `ReservationStatus` enum, `Table` model, and `Reservation` model**

  In `schema.prisma`, add the following after the existing `RegisterSessionStatus` enum:

  ```prisma
  enum ReservationStatus {
    PENDING
    CONFIRMED
    SEATED
    COMPLETED
    NO_SHOW
    CANCELLED
  }
  ```

  Add to the `Restaurant` model (after the existing fields, before `createdAt`):

  ```prisma
  defaultReservationDuration Int    @default(90)
  tables       Table[]
  reservations Reservation[]
  ```

  Add new models after `PendingOperation`:

  ```prisma
  model Table {
    id           String        @id @default(uuid())
    name         String
    capacity     Int
    active       Boolean       @default(true)

    restaurantId String
    restaurant   Restaurant    @relation(fields: [restaurantId], references: [id])
    reservations Reservation[]

    createdAt    DateTime      @default(now())
    updatedAt    DateTime      @updatedAt

    @@index([restaurantId])
  }

  model Reservation {
    id           String            @id @default(uuid())
    guestName    String
    guestPhone   String
    guestEmail   String?
    partySize    Int
    date         DateTime
    duration     Int
    status       ReservationStatus @default(PENDING)
    notes        String?

    isPaid           Boolean  @default(false)
    paymentReference String?
    paymentPlatform  String?

    cancellationReason String?

    tableId      String
    table        Table             @relation(fields: [tableId], references: [id])
    restaurantId String
    restaurant   Restaurant        @relation(fields: [restaurantId], references: [id])

    createdAt    DateTime          @default(now())
    updatedAt    DateTime          @updatedAt

    @@index([restaurantId, date])
    @@index([tableId, date])
  }
  ```

- [ ] **Step 2: Push schema to database**

  ```bash
  cd apps/api-core && pnpm exec prisma db push
  ```

  Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

  ```bash
  cd apps/api-core && pnpm exec prisma generate
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api-core/prisma/schema.prisma
  git commit -m "feat(db): add Table and Reservation models with ReservationStatus enum"
  ```

---

## Chunk 2: Tables Backend Module

### Task 2: Tables README

**Files:**
- Create: `apps/api-core/src/tables/README.md`

- [ ] **Step 1: Create README**

  `apps/api-core/src/tables/README.md`:

  ```markdown
  # Tables Module

  Manages the physical tables in a restaurant.

  ## Endpoints (ADMIN, MANAGER)

  | Method | Route | Description |
  |--------|-------|-------------|
  | GET | /v1/tables | List restaurant tables |
  | POST | /v1/tables | Create table |
  | PATCH | /v1/tables/:id | Update name / capacity / active |
  | DELETE | /v1/tables/:id | Delete table (blocked if future reservations exist) |
  ```

### Task 3: Tables exceptions and DTOs

**Files:**
- Create: `apps/api-core/src/tables/exceptions/tables.exceptions.ts`
- Create: `apps/api-core/src/tables/dto/create-table.dto.ts`
- Create: `apps/api-core/src/tables/dto/update-table.dto.ts`
- Create: `apps/api-core/src/tables/dto/table.dto.ts`

- [ ] **Step 1: Create exceptions**

  `apps/api-core/src/tables/exceptions/tables.exceptions.ts`:

  ```typescript
  import { HttpStatus } from '@nestjs/common';
  import { BaseException } from '../../common/exceptions';

  export class TableNotFoundException extends BaseException {
    constructor(tableId: string) {
      super(
        `Table '${tableId}' not found`,
        HttpStatus.NOT_FOUND,
        'TABLE_NOT_FOUND',
        { tableId },
      );
    }
  }

  export class TableHasFutureReservationsException extends BaseException {
    constructor(tableId: string) {
      super(
        `Table '${tableId}' has future reservations and cannot be deleted`,
        HttpStatus.CONFLICT,
        'TABLE_HAS_FUTURE_RESERVATIONS',
        { tableId },
      );
    }
  }
  ```

- [ ] **Step 2: Create `CreateTableDto`**

  `apps/api-core/src/tables/dto/create-table.dto.ts`:

  ```typescript
  import { IsString, IsInt, Min, MaxLength } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';

  export class CreateTableDto {
    @ApiProperty({ example: 'Mesa 1' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({ example: 4, minimum: 1 })
    @IsInt()
    @Min(1)
    capacity: number;
  }
  ```

- [ ] **Step 3: Create `UpdateTableDto`**

  `apps/api-core/src/tables/dto/update-table.dto.ts`:

  ```typescript
  import { PartialType } from '@nestjs/mapped-types';
  import { IsBoolean, IsOptional } from 'class-validator';
  import { ApiPropertyOptional } from '@nestjs/swagger';
  import { CreateTableDto } from './create-table.dto';

  export class UpdateTableDto extends PartialType(CreateTableDto) {
    @ApiPropertyOptional()
    @IsBoolean()
    @IsOptional()
    active?: boolean;
  }
  ```

- [ ] **Step 4: Create `TableDto` (response shape)**

  `apps/api-core/src/tables/dto/table.dto.ts`:

  ```typescript
  import { ApiProperty } from '@nestjs/swagger';

  export class TableDto {
    @ApiProperty() id: string;
    @ApiProperty() name: string;
    @ApiProperty() capacity: number;
    @ApiProperty() active: boolean;
    @ApiProperty() restaurantId: string;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
  }
  ```

### Task 4: Tables repository

**Files:**
- Create: `apps/api-core/src/tables/tables.repository.ts`

- [ ] **Step 1: Create repository**

  `apps/api-core/src/tables/tables.repository.ts`:

  ```typescript
  import { Injectable } from '@nestjs/common';
  import { Table, ReservationStatus } from '@prisma/client';
  import { PrismaService } from '../prisma/prisma.service';

  @Injectable()
  export class TablesRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(restaurantId: string): Promise<Table[]> {
      return this.prisma.table.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      });
    }

    async findById(id: string): Promise<Table | null> {
      return this.prisma.table.findUnique({ where: { id } });
    }

    async create(data: {
      name: string;
      capacity: number;
      restaurantId: string;
    }): Promise<Table> {
      return this.prisma.table.create({ data });
    }

    async update(
      id: string,
      data: { name?: string; capacity?: number; active?: boolean },
    ): Promise<Table> {
      return this.prisma.table.update({ where: { id }, data });
    }

    async delete(id: string): Promise<Table> {
      return this.prisma.table.delete({ where: { id } });
    }

    async countFutureReservations(tableId: string): Promise<number> {
      return this.prisma.reservation.count({
        where: {
          tableId,
          date: { gte: new Date() },
          status: {
            notIn: [
              ReservationStatus.CANCELLED,
              ReservationStatus.NO_SHOW,
              ReservationStatus.COMPLETED,
            ],
          },
        },
      });
    }
  }
  ```

### Task 5: Tables service + tests (TDD)

**Files:**
- Create: `apps/api-core/src/tables/tables.service.spec.ts`
- Create: `apps/api-core/src/tables/tables.service.ts`

- [ ] **Step 1: Write failing tests**

  `apps/api-core/src/tables/tables.service.spec.ts`:

  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { TablesService } from './tables.service';
  import { TablesRepository } from './tables.repository';
  import {
    TableNotFoundException,
    TableHasFutureReservationsException,
  } from './exceptions/tables.exceptions';
  import { ForbiddenAccessException } from '../common/exceptions';

  const mockRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    countFutureReservations: jest.fn(),
  };

  const makeTable = (overrides = {}) => ({
    id: 't1',
    name: 'Mesa 1',
    capacity: 4,
    active: true,
    restaurantId: 'r1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('TablesService', () => {
    let service: TablesService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TablesService,
          { provide: TablesRepository, useValue: mockRepo },
        ],
      }).compile();

      service = module.get<TablesService>(TablesService);
      jest.clearAllMocks();
    });

    describe('findById', () => {
      it('throws TableNotFoundException when table not found', async () => {
        mockRepo.findById.mockResolvedValue(null);
        await expect(service.findById('t1', 'r1')).rejects.toThrow(TableNotFoundException);
      });

      it('throws ForbiddenAccessException when restaurant mismatch', async () => {
        mockRepo.findById.mockResolvedValue(makeTable({ restaurantId: 'other' }));
        await expect(service.findById('t1', 'r1')).rejects.toThrow(ForbiddenAccessException);
      });

      it('returns table when found and restaurantId matches', async () => {
        const table = makeTable();
        mockRepo.findById.mockResolvedValue(table);
        const result = await service.findById('t1', 'r1');
        expect(result).toBe(table);
      });
    });

    describe('create', () => {
      it('creates table with restaurantId', async () => {
        const created = makeTable();
        mockRepo.create.mockResolvedValue(created);
        await service.create('r1', { name: 'Mesa 1', capacity: 4 });
        expect(mockRepo.create).toHaveBeenCalledWith({
          name: 'Mesa 1',
          capacity: 4,
          restaurantId: 'r1',
        });
      });
    });

    describe('update', () => {
      it('validates ownership before updating', async () => {
        mockRepo.findById.mockResolvedValue(null);
        await expect(service.update('t1', 'r1', { name: 'X' })).rejects.toThrow(
          TableNotFoundException,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
      });

      it('updates table when authorized', async () => {
        mockRepo.findById.mockResolvedValue(makeTable());
        mockRepo.update.mockResolvedValue(makeTable({ name: 'Mesa X' }));
        await service.update('t1', 'r1', { name: 'Mesa X' });
        expect(mockRepo.update).toHaveBeenCalledWith('t1', { name: 'Mesa X' });
      });
    });

    describe('delete', () => {
      it('throws TableHasFutureReservationsException when future reservations exist', async () => {
        mockRepo.findById.mockResolvedValue(makeTable());
        mockRepo.countFutureReservations.mockResolvedValue(2);
        await expect(service.delete('t1', 'r1')).rejects.toThrow(
          TableHasFutureReservationsException,
        );
        expect(mockRepo.delete).not.toHaveBeenCalled();
      });

      it('deletes table when no future reservations', async () => {
        const table = makeTable();
        mockRepo.findById.mockResolvedValue(table);
        mockRepo.countFutureReservations.mockResolvedValue(0);
        mockRepo.delete.mockResolvedValue(table);
        await service.delete('t1', 'r1');
        expect(mockRepo.delete).toHaveBeenCalledWith('t1');
      });
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm they fail**

  ```bash
  cd apps/api-core && pnpm test -- --testPathPattern=tables.service
  ```

  Expected: FAIL — `Cannot find module './tables.service'`

- [ ] **Step 3: Implement `TablesService`**

  `apps/api-core/src/tables/tables.service.ts`:

  ```typescript
  import { Injectable } from '@nestjs/common';
  import { TablesRepository } from './tables.repository';
  import { CreateTableDto } from './dto/create-table.dto';
  import { UpdateTableDto } from './dto/update-table.dto';
  import {
    TableNotFoundException,
    TableHasFutureReservationsException,
  } from './exceptions/tables.exceptions';
  import { ForbiddenAccessException } from '../common/exceptions';

  @Injectable()
  export class TablesService {
    constructor(private readonly tablesRepository: TablesRepository) {}

    async findAll(restaurantId: string) {
      return this.tablesRepository.findAll(restaurantId);
    }

    async findById(id: string, restaurantId: string) {
      const table = await this.tablesRepository.findById(id);
      if (!table) throw new TableNotFoundException(id);
      if (table.restaurantId !== restaurantId) throw new ForbiddenAccessException();
      return table;
    }

    async create(restaurantId: string, dto: CreateTableDto) {
      return this.tablesRepository.create({ ...dto, restaurantId });
    }

    async update(id: string, restaurantId: string, dto: UpdateTableDto) {
      await this.findById(id, restaurantId);
      return this.tablesRepository.update(id, dto);
    }

    async delete(id: string, restaurantId: string) {
      await this.findById(id, restaurantId);
      const futureCount = await this.tablesRepository.countFutureReservations(id);
      if (futureCount > 0) throw new TableHasFutureReservationsException(id);
      return this.tablesRepository.delete(id);
    }
  }
  ```

- [ ] **Step 4: Run tests and confirm they pass**

  ```bash
  cd apps/api-core && pnpm test -- --testPathPattern=tables.service
  ```

  Expected: PASS — all 8 tests pass.

### Task 6: Tables controller, module, and wiring

**Files:**
- Create: `apps/api-core/src/tables/tables.controller.ts`
- Create: `apps/api-core/src/tables/tables.module.ts`
- Modify: `apps/api-core/src/app.module.ts`

- [ ] **Step 1: Create controller**

  `apps/api-core/src/tables/tables.controller.ts`:

  ```typescript
  import {
    Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
  } from '@nestjs/common';
  import { Role } from '@prisma/client';
  import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

  import { TablesService } from './tables.service';
  import { CreateTableDto } from './dto/create-table.dto';
  import { UpdateTableDto } from './dto/update-table.dto';
  import { TableDto } from './dto/table.dto';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { CurrentUser } from '../auth/decorators/current-user.decorator';
  import { Roles } from '../auth/decorators/roles.decorator';

  @ApiTags('tables')
  @ApiBearerAuth()
  @Controller({ version: '1', path: 'tables' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  export class TablesController {
    constructor(private readonly tablesService: TablesService) {}

    @Get()
    @ApiOperation({ summary: 'Listar mesas del restaurante' })
    @ApiResponse({ status: 200, type: [TableDto] })
    findAll(@CurrentUser() user: { restaurantId: string }) {
      return this.tablesService.findAll(user.restaurantId);
    }

    @Post()
    @ApiOperation({ summary: 'Crear mesa' })
    @ApiResponse({ status: 201, type: TableDto })
    create(
      @CurrentUser() user: { restaurantId: string },
      @Body() dto: CreateTableDto,
    ) {
      return this.tablesService.create(user.restaurantId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Actualizar mesa (nombre, capacidad o estado activo)' })
    @ApiParam({ name: 'id', type: String })
    @ApiResponse({ status: 200, type: TableDto })
    update(
      @Param('id') id: string,
      @CurrentUser() user: { restaurantId: string },
      @Body() dto: UpdateTableDto,
    ) {
      return this.tablesService.update(id, user.restaurantId, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Eliminar mesa (solo si no tiene reservas futuras)' })
    @ApiParam({ name: 'id', type: String })
    @ApiResponse({ status: 204 })
    @ApiResponse({ status: 409, description: 'La mesa tiene reservas futuras' })
    delete(
      @Param('id') id: string,
      @CurrentUser() user: { restaurantId: string },
    ) {
      return this.tablesService.delete(id, user.restaurantId);
    }
  }
  ```

- [ ] **Step 2: Create module**

  `apps/api-core/src/tables/tables.module.ts`:

  ```typescript
  import { Module } from '@nestjs/common';
  import { TablesService } from './tables.service';
  import { TablesController } from './tables.controller';
  import { TablesRepository } from './tables.repository';

  @Module({
    controllers: [TablesController],
    providers: [TablesService, TablesRepository],
    exports: [TablesService, TablesRepository],
  })
  export class TablesModule {}
  ```

- [ ] **Step 3: Register in `AppModule`**

  In `apps/api-core/src/app.module.ts`, import `TablesModule`:

  ```typescript
  import { TablesModule } from './tables/tables.module';
  ```

  Add `TablesModule` to the `imports` array (after `UploadsModule`):

  ```typescript
  TablesModule,
  ```

- [ ] **Step 4: Run all unit tests to confirm nothing is broken**

  ```bash
  cd apps/api-core && pnpm test
  ```

  Expected: all existing tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api-core/src/tables/ apps/api-core/src/app.module.ts
  git commit -m "feat(tables): add tables module with CRUD endpoints"
  ```

---

## Chunk 3: Reservations Backend Module

### Task 7: Reservations README + exceptions and DTOs

**Files:**
- Create: `apps/api-core/src/reservations/README.md`
- Create: `apps/api-core/src/reservations/exceptions/reservations.exceptions.ts`
- Create: `apps/api-core/src/reservations/dto/create-reservation.dto.ts`
- Create: `apps/api-core/src/reservations/dto/update-reservation.dto.ts`
- Create: `apps/api-core/src/reservations/dto/reservation.dto.ts`

- [ ] **Step 1: Create README**

  `apps/api-core/src/reservations/README.md`:

  ```markdown
  # Reservations Module

  Manages table reservations for the restaurant.

  ## Endpoints (ADMIN, MANAGER)

  | Method | Route | Description |
  |--------|-------|-------------|
  | GET | /v1/reservations | List reservations (filters: date, status, tableId) |
  | POST | /v1/reservations | Create reservation with full validation |
  | PATCH | /v1/reservations/:id | Edit data or change status |
  | DELETE | /v1/reservations/:id | Cancel reservation |

  ## Validation on creation (ordered)
  1. Table exists and belongs to restaurant
  2. Table is active
  3. Party size ≤ table capacity
  4. No time overlap with existing active reservations
  5. Fire-and-forget email stub (extend when email template is ready)

  ## Status transitions
  PENDING → CONFIRMED → SEATED → COMPLETED
                                ↘ NO_SHOW
             ↘ CANCELLED (from any active status)
  ```

- [ ] **Step 2: Create exceptions**

  `apps/api-core/src/reservations/exceptions/reservations.exceptions.ts`:

  ```typescript
  import { HttpStatus } from '@nestjs/common';
  import { BaseException } from '../../common/exceptions';

  export class ReservationNotFoundException extends BaseException {
    constructor(id: string) {
      super(
        `Reservation '${id}' not found`,
        HttpStatus.NOT_FOUND,
        'RESERVATION_NOT_FOUND',
        { id },
      );
    }
  }

  export class ReservationTableInactiveException extends BaseException {
    constructor(tableId: string) {
      super(
        `Table '${tableId}' is inactive and cannot accept reservations`,
        HttpStatus.BAD_REQUEST,
        'TABLE_INACTIVE',
        { tableId },
      );
    }
  }

  export class ReservationCapacityExceededException extends BaseException {
    constructor(partySize: number, capacity: number) {
      super(
        `Party size (${partySize}) exceeds table capacity (${capacity})`,
        HttpStatus.CONFLICT,
        'CAPACITY_EXCEEDED',
        { partySize, capacity },
      );
    }
  }

  export class ReservationTimeOverlapException extends BaseException {
    constructor(existingStart: Date, existingEnd: Date) {
      super(
        `Time slot conflicts with existing reservation from ${existingStart.toISOString()} to ${existingEnd.toISOString()}`,
        HttpStatus.CONFLICT,
        'RESERVATION_TIME_OVERLAP',
        { existingStart, existingEnd },
      );
    }
  }

  export class ReservationInvalidStatusTransitionException extends BaseException {
    constructor(current: string, target: string) {
      super(
        `Cannot transition reservation from '${current}' to '${target}'`,
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS_TRANSITION',
        { current, target },
      );
    }
  }
  ```

- [ ] **Step 3: Create `CreateReservationDto`**

  `apps/api-core/src/reservations/dto/create-reservation.dto.ts`:

  ```typescript
  import {
    IsString, IsInt, IsOptional, IsEmail, IsDateString,
    IsBoolean, Min, MaxLength,
  } from 'class-validator';
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

  export class CreateReservationDto {
    @ApiProperty({ example: 'Juan Pérez' })
    @IsString()
    @MaxLength(200)
    guestName: string;

    @ApiProperty({ example: '+54 9 11 1234-5678' })
    @IsString()
    @MaxLength(50)
    guestPhone: string;

    @ApiPropertyOptional({ example: 'juan@email.com' })
    @IsEmail()
    @IsOptional()
    guestEmail?: string;

    @ApiProperty({ example: 3, minimum: 1 })
    @IsInt()
    @Min(1)
    partySize: number;

    @ApiProperty({ example: '2026-03-15T20:00:00.000Z' })
    @IsDateString()
    date: string;

    @ApiPropertyOptional({ example: 'Aniversario, traer torta' })
    @IsString()
    @IsOptional()
    notes?: string;

    @ApiProperty({ example: 'uuid-de-la-mesa' })
    @IsString()
    tableId: string;

    @ApiPropertyOptional({ example: true })
    @IsBoolean()
    @IsOptional()
    isPaid?: boolean;

    @ApiPropertyOptional({ example: 'MP-123456' })
    @IsString()
    @IsOptional()
    paymentReference?: string;

    @ApiPropertyOptional({ example: 'MercadoPago' })
    @IsString()
    @IsOptional()
    paymentPlatform?: string;
  }
  ```

- [ ] **Step 4: Create `UpdateReservationDto`**

  `apps/api-core/src/reservations/dto/update-reservation.dto.ts`:

  ```typescript
  import {
    IsString, IsInt, IsOptional, IsEmail, IsDateString,
    IsBoolean, Min, IsEnum, MaxLength,
  } from 'class-validator';
  import { ApiPropertyOptional } from '@nestjs/swagger';
  import { ReservationStatus } from '@prisma/client';

  export class UpdateReservationDto {
    @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() guestName?: string;
    @ApiPropertyOptional() @IsString() @MaxLength(50) @IsOptional() guestPhone?: string;
    @ApiPropertyOptional() @IsEmail() @IsOptional() guestEmail?: string;
    @ApiPropertyOptional({ minimum: 1 }) @IsInt() @Min(1) @IsOptional() partySize?: number;
    @ApiPropertyOptional() @IsDateString() @IsOptional() date?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
    @ApiPropertyOptional({ enum: ReservationStatus }) @IsEnum(ReservationStatus) @IsOptional() status?: ReservationStatus;
    @ApiPropertyOptional() @IsBoolean() @IsOptional() isPaid?: boolean;
    @ApiPropertyOptional() @IsString() @IsOptional() paymentReference?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() paymentPlatform?: string;
    @ApiPropertyOptional() @IsString() @IsOptional() cancellationReason?: string;
  }
  ```

- [ ] **Step 5: Create `ReservationDto` (response shape)**

  `apps/api-core/src/reservations/dto/reservation.dto.ts`:

  ```typescript
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

  export class ReservationDto {
    @ApiProperty() id: string;
    @ApiProperty() guestName: string;
    @ApiProperty() guestPhone: string;
    @ApiPropertyOptional() guestEmail?: string | null;
    @ApiProperty() partySize: number;
    @ApiProperty() date: Date;
    @ApiProperty() duration: number;
    @ApiProperty() status: string;
    @ApiPropertyOptional() notes?: string | null;
    @ApiProperty() isPaid: boolean;
    @ApiPropertyOptional() paymentReference?: string | null;
    @ApiPropertyOptional() paymentPlatform?: string | null;
    @ApiPropertyOptional() cancellationReason?: string | null;
    @ApiProperty() tableId: string;
    @ApiProperty() restaurantId: string;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
  }
  ```

### Task 8: Reservations repository

**Files:**
- Create: `apps/api-core/src/reservations/reservations.repository.ts`

- [ ] **Step 1: Create repository**

  `apps/api-core/src/reservations/reservations.repository.ts`:

  ```typescript
  import { Injectable } from '@nestjs/common';
  import { Reservation, ReservationStatus } from '@prisma/client';
  import { PrismaService } from '../prisma/prisma.service';

  const ACTIVE_STATUSES: ReservationStatus[] = [
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
    ReservationStatus.SEATED,
  ];

  @Injectable()
  export class ReservationsRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(
      restaurantId: string,
      filters: { date?: string; status?: ReservationStatus; tableId?: string },
    ) {
      const where: Record<string, any> = { restaurantId };

      if (filters.status) where.status = filters.status;
      if (filters.tableId) where.tableId = filters.tableId;
      if (filters.date) {
        const start = new Date(filters.date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.date);
        end.setHours(23, 59, 59, 999);
        where.date = { gte: start, lte: end };
      }

      return this.prisma.reservation.findMany({
        where,
        include: { table: true },
        orderBy: { date: 'asc' },
      });
    }

    async findById(id: string) {
      return this.prisma.reservation.findUnique({
        where: { id },
        include: { table: true },
      });
    }

    async create(data: {
      guestName: string;
      guestPhone: string;
      guestEmail?: string;
      partySize: number;
      date: Date;
      duration: number;
      notes?: string;
      isPaid?: boolean;
      paymentReference?: string;
      paymentPlatform?: string;
      tableId: string;
      restaurantId: string;
    }) {
      return this.prisma.reservation.create({
        data,
        include: { table: true },
      });
    }

    async update(id: string, data: Partial<Record<string, any>>) {
      return this.prisma.reservation.update({
        where: { id },
        data,
        include: { table: true },
      });
    }

    /**
     * Returns reservations for a table whose time range overlaps with [newStart, newEnd).
     * Overlap condition: existing.date < newEnd AND (existing.date + existing.duration) > newStart
     * Excludes `excludeId` to allow editing an existing reservation.
     */
    async findOverlapping(
      tableId: string,
      newStart: Date,
      newEnd: Date,
      excludeId?: string,
    ): Promise<Reservation[]> {
      const candidates = await this.prisma.reservation.findMany({
        where: {
          tableId,
          status: { in: ACTIVE_STATUSES },
          date: { lt: newEnd },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });

      return candidates.filter((r) => {
        const existingEnd = new Date(r.date.getTime() + r.duration * 60_000);
        return existingEnd > newStart;
      });
    }
  }
  ```

### Task 9: Reservations service + tests (TDD)

**Files:**
- Create: `apps/api-core/src/reservations/reservations.service.spec.ts`
- Create: `apps/api-core/src/reservations/reservations.service.ts`

- [ ] **Step 1: Write failing tests**

  `apps/api-core/src/reservations/reservations.service.spec.ts`:

  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { ReservationStatus } from '@prisma/client';
  import { ReservationsService } from './reservations.service';
  import { ReservationsRepository } from './reservations.repository';
  import { TablesRepository } from '../tables/tables.repository';
  import { RestaurantsService } from '../restaurants/restaurants.service';
  import {
    ReservationNotFoundException,
    ReservationTableInactiveException,
    ReservationCapacityExceededException,
    ReservationTimeOverlapException,
    ReservationInvalidStatusTransitionException,
  } from './exceptions/reservations.exceptions';
  import { TableNotFoundException } from '../tables/exceptions/tables.exceptions';
  import { ForbiddenAccessException } from '../common/exceptions';

  const mockReservationsRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findOverlapping: jest.fn(),
  };
  const mockTablesRepo = {
    findById: jest.fn(),
  };
  const mockRestaurantsService = {
    findById: jest.fn(),
  };

  const makeTable = (overrides = {}) => ({
    id: 't1',
    name: 'Mesa 1',
    capacity: 4,
    active: true,
    restaurantId: 'r1',
    ...overrides,
  });

  const makeReservation = (overrides = {}) => ({
    id: 'res1',
    restaurantId: 'r1',
    tableId: 't1',
    guestName: 'Juan',
    guestPhone: '1234',
    partySize: 2,
    date: new Date('2026-03-15T20:00:00Z'),
    duration: 90,
    status: ReservationStatus.PENDING,
    isPaid: false,
    ...overrides,
  });

  const makeCreateDto = (overrides = {}) => ({
    guestName: 'Juan',
    guestPhone: '1234',
    partySize: 2,
    date: '2026-03-15T20:00:00.000Z',
    tableId: 't1',
    ...overrides,
  });

  describe('ReservationsService', () => {
    let service: ReservationsService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ReservationsService,
          { provide: ReservationsRepository, useValue: mockReservationsRepo },
          { provide: TablesRepository, useValue: mockTablesRepo },
          { provide: RestaurantsService, useValue: mockRestaurantsService },
        ],
      }).compile();

      service = module.get<ReservationsService>(ReservationsService);
      jest.clearAllMocks();

      // Default happy-path mocks
      mockTablesRepo.findById.mockResolvedValue(makeTable());
      mockRestaurantsService.findById.mockResolvedValue({ defaultReservationDuration: 90 });
      mockReservationsRepo.findOverlapping.mockResolvedValue([]);
      mockReservationsRepo.create.mockResolvedValue(makeReservation());
    });

    describe('findById', () => {
      it('throws ReservationNotFoundException when not found', async () => {
        mockReservationsRepo.findById.mockResolvedValue(null);
        await expect(service.findById('res1', 'r1')).rejects.toThrow(ReservationNotFoundException);
      });

      it('throws ForbiddenAccessException on restaurant mismatch', async () => {
        mockReservationsRepo.findById.mockResolvedValue(makeReservation({ restaurantId: 'other' }));
        await expect(service.findById('res1', 'r1')).rejects.toThrow(ForbiddenAccessException);
      });
    });

    describe('create', () => {
      it('throws TableNotFoundException when table not found', async () => {
        mockTablesRepo.findById.mockResolvedValue(null);
        await expect(service.create('r1', makeCreateDto())).rejects.toThrow(TableNotFoundException);
      });

      it('throws TableNotFoundException when table belongs to different restaurant', async () => {
        mockTablesRepo.findById.mockResolvedValue(makeTable({ restaurantId: 'other' }));
        await expect(service.create('r1', makeCreateDto())).rejects.toThrow(TableNotFoundException);
      });

      it('throws ReservationTableInactiveException when table is inactive', async () => {
        mockTablesRepo.findById.mockResolvedValue(makeTable({ active: false }));
        await expect(service.create('r1', makeCreateDto())).rejects.toThrow(
          ReservationTableInactiveException,
        );
      });

      it('throws ReservationCapacityExceededException when party size exceeds capacity', async () => {
        mockTablesRepo.findById.mockResolvedValue(makeTable({ capacity: 2 }));
        await expect(service.create('r1', makeCreateDto({ partySize: 5 }))).rejects.toThrow(
          ReservationCapacityExceededException,
        );
      });

      it('throws ReservationTimeOverlapException when slot is taken', async () => {
        const conflicting = makeReservation();
        mockReservationsRepo.findOverlapping.mockResolvedValue([conflicting]);
        await expect(service.create('r1', makeCreateDto())).rejects.toThrow(
          ReservationTimeOverlapException,
        );
      });

      it('creates reservation using restaurant default duration', async () => {
        await service.create('r1', makeCreateDto());
        expect(mockReservationsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ duration: 90, restaurantId: 'r1' }),
        );
      });
    });

    describe('update', () => {
      it('throws ReservationInvalidStatusTransitionException for invalid transition', async () => {
        mockReservationsRepo.findById.mockResolvedValue(
          makeReservation({ status: ReservationStatus.COMPLETED }),
        );
        await expect(
          service.update('res1', 'r1', { status: ReservationStatus.PENDING }),
        ).rejects.toThrow(ReservationInvalidStatusTransitionException);
      });

      it('updates reservation when transition is valid', async () => {
        mockReservationsRepo.findById.mockResolvedValue(
          makeReservation({ status: ReservationStatus.PENDING }),
        );
        mockReservationsRepo.update.mockResolvedValue(
          makeReservation({ status: ReservationStatus.CONFIRMED }),
        );
        await service.update('res1', 'r1', { status: ReservationStatus.CONFIRMED });
        expect(mockReservationsRepo.update).toHaveBeenCalledWith(
          'res1',
          expect.objectContaining({ status: ReservationStatus.CONFIRMED }),
        );
      });
    });

    describe('cancel', () => {
      it('throws ReservationInvalidStatusTransitionException when cancelling from COMPLETED', async () => {
        mockReservationsRepo.findById.mockResolvedValue(
          makeReservation({ status: ReservationStatus.COMPLETED }),
        );
        await expect(service.cancel('res1', 'r1')).rejects.toThrow(
          ReservationInvalidStatusTransitionException,
        );
      });

      it('cancels reservation from CONFIRMED status', async () => {
        mockReservationsRepo.findById.mockResolvedValue(
          makeReservation({ status: ReservationStatus.CONFIRMED }),
        );
        mockReservationsRepo.update.mockResolvedValue(
          makeReservation({ status: ReservationStatus.CANCELLED }),
        );
        await service.cancel('res1', 'r1', 'cliente canceló');
        expect(mockReservationsRepo.update).toHaveBeenCalledWith(
          'res1',
          expect.objectContaining({
            status: ReservationStatus.CANCELLED,
            cancellationReason: 'cliente canceló',
          }),
        );
      });
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm they fail**

  ```bash
  cd apps/api-core && pnpm test -- --testPathPattern=reservations.service
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ReservationsService`**

  `apps/api-core/src/reservations/reservations.service.ts`:

  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { ReservationStatus } from '@prisma/client';

  import { ReservationsRepository } from './reservations.repository';
  import { TablesRepository } from '../tables/tables.repository';
  import { CreateReservationDto } from './dto/create-reservation.dto';
  import { UpdateReservationDto } from './dto/update-reservation.dto';
  import {
    ReservationNotFoundException,
    ReservationTableInactiveException,
    ReservationCapacityExceededException,
    ReservationTimeOverlapException,
    ReservationInvalidStatusTransitionException,
  } from './exceptions/reservations.exceptions';
  import { TableNotFoundException } from '../tables/exceptions/tables.exceptions';
  import { ForbiddenAccessException } from '../common/exceptions';
  import { RestaurantsService } from '../restaurants/restaurants.service';

  // NOTE: EmailService is intentionally NOT injected here.
  // Reservation confirmation emails are a stub (logger only).
  // Wire EmailService in when an email template for reservations is ready.

  const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
    [ReservationStatus.PENDING]: [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
    [ReservationStatus.CONFIRMED]: [ReservationStatus.SEATED, ReservationStatus.CANCELLED],
    [ReservationStatus.SEATED]: [
      ReservationStatus.COMPLETED,
      ReservationStatus.NO_SHOW,
      ReservationStatus.CANCELLED,
    ],
    [ReservationStatus.COMPLETED]: [],
    [ReservationStatus.NO_SHOW]: [],
    [ReservationStatus.CANCELLED]: [],
  };

  @Injectable()
  export class ReservationsService {
    private readonly logger = new Logger(ReservationsService.name);

    constructor(
      private readonly reservationsRepository: ReservationsRepository,
      private readonly tablesRepository: TablesRepository,
      private readonly restaurantsService: RestaurantsService,
    ) {}

    async findAll(
      restaurantId: string,
      filters: { date?: string; status?: ReservationStatus; tableId?: string },
    ) {
      return this.reservationsRepository.findAll(restaurantId, filters);
    }

    async findById(id: string, restaurantId: string) {
      const reservation = await this.reservationsRepository.findById(id);
      if (!reservation) throw new ReservationNotFoundException(id);
      if (reservation.restaurantId !== restaurantId) throw new ForbiddenAccessException();
      return reservation;
    }

    async create(restaurantId: string, dto: CreateReservationDto) {
      // 1. Table exists and belongs to restaurant
      const table = await this.tablesRepository.findById(dto.tableId);
      if (!table || table.restaurantId !== restaurantId) throw new TableNotFoundException(dto.tableId);

      // 2. Table is active
      if (!table.active) throw new ReservationTableInactiveException(dto.tableId);

      // 3. Capacity check
      if (table.capacity < dto.partySize) {
        throw new ReservationCapacityExceededException(dto.partySize, table.capacity);
      }

      // 4. Get restaurant default duration
      const restaurant = await this.restaurantsService.findById(restaurantId);
      const duration = restaurant!.defaultReservationDuration;

      // 5. Overlap check
      const newStart = new Date(dto.date);
      const newEnd = new Date(newStart.getTime() + duration * 60_000);
      const overlapping = await this.reservationsRepository.findOverlapping(
        dto.tableId,
        newStart,
        newEnd,
      );
      if (overlapping.length > 0) {
        const conflict = overlapping[0];
        const conflictEnd = new Date(conflict.date.getTime() + conflict.duration * 60_000);
        throw new ReservationTimeOverlapException(conflict.date, conflictEnd);
      }

      // 6. Persist
      const reservation = await this.reservationsRepository.create({
        guestName: dto.guestName,
        guestPhone: dto.guestPhone,
        guestEmail: dto.guestEmail,
        partySize: dto.partySize,
        date: newStart,
        duration,
        notes: dto.notes,
        isPaid: dto.isPaid ?? false,
        paymentReference: dto.paymentReference,
        paymentPlatform: dto.paymentPlatform,
        tableId: dto.tableId,
        restaurantId,
      });

      // 7. Fire-and-forget confirmation email
      if (dto.guestEmail) {
        void this.sendConfirmationEmail(dto.guestEmail, reservation).catch((err) =>
          this.logger.warn(
            `Confirmation email failed for reservation ${reservation.id}: ${err.message}`,
          ),
        );
      }

      return reservation;
    }

    async update(id: string, restaurantId: string, dto: UpdateReservationDto) {
      const reservation = await this.findById(id, restaurantId);

      if (dto.status !== undefined) {
        const allowed = VALID_TRANSITIONS[reservation.status];
        if (!allowed.includes(dto.status)) {
          throw new ReservationInvalidStatusTransitionException(reservation.status, dto.status);
        }
      }

      const updateData: Record<string, any> = {};
      if (dto.guestName !== undefined) updateData.guestName = dto.guestName;
      if (dto.guestPhone !== undefined) updateData.guestPhone = dto.guestPhone;
      if (dto.guestEmail !== undefined) updateData.guestEmail = dto.guestEmail;
      if (dto.partySize !== undefined) updateData.partySize = dto.partySize;
      if (dto.date !== undefined) updateData.date = new Date(dto.date);
      if (dto.notes !== undefined) updateData.notes = dto.notes;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.isPaid !== undefined) updateData.isPaid = dto.isPaid;
      if (dto.paymentReference !== undefined) updateData.paymentReference = dto.paymentReference;
      if (dto.paymentPlatform !== undefined) updateData.paymentPlatform = dto.paymentPlatform;
      if (dto.cancellationReason !== undefined) updateData.cancellationReason = dto.cancellationReason;

      return this.reservationsRepository.update(id, updateData);
    }

    async cancel(id: string, restaurantId: string, reason?: string) {
      const reservation = await this.findById(id, restaurantId);
      const allowed = VALID_TRANSITIONS[reservation.status];
      if (!allowed.includes(ReservationStatus.CANCELLED)) {
        throw new ReservationInvalidStatusTransitionException(
          reservation.status,
          ReservationStatus.CANCELLED,
        );
      }
      return this.reservationsRepository.update(id, {
        status: ReservationStatus.CANCELLED,
        cancellationReason: reason ?? null,
      });
    }

    private async sendConfirmationEmail(email: string, reservation: any): Promise<void> {
      this.logger.log(
        `[DEV] Would send confirmation to ${email} for reservation ${reservation.id}`,
      );
    }
  }
  ```

- [ ] **Step 4: Run tests and confirm they pass**

  ```bash
  cd apps/api-core && pnpm test -- --testPathPattern=reservations.service
  ```

  Expected: PASS — all 12 tests pass.

### Task 10: Reservations controller and module

**Files:**
- Create: `apps/api-core/src/reservations/reservations.controller.ts`
- Create: `apps/api-core/src/reservations/reservations.module.ts`
- Modify: `apps/api-core/src/app.module.ts`

- [ ] **Step 1: Create controller**

  `apps/api-core/src/reservations/reservations.controller.ts`:

  ```typescript
  import {
    Controller, Get, Post, Patch, Delete, Param, Query,
    Body, UseGuards, HttpCode, HttpStatus,
  } from '@nestjs/common';
  import { Role, ReservationStatus } from '@prisma/client';
  import {
    ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
    ApiParam, ApiQuery,
  } from '@nestjs/swagger';

  import { ReservationsService } from './reservations.service';
  import { CreateReservationDto } from './dto/create-reservation.dto';
  import { UpdateReservationDto } from './dto/update-reservation.dto';
  import { ReservationDto } from './dto/reservation.dto';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { CurrentUser } from '../auth/decorators/current-user.decorator';
  import { Roles } from '../auth/decorators/roles.decorator';

  @ApiTags('reservations')
  @ApiBearerAuth()
  @Controller({ version: '1', path: 'reservations' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  export class ReservationsController {
    constructor(private readonly reservationsService: ReservationsService) {}

    @Get()
    @ApiOperation({ summary: 'Listar reservas (filtros: date, status, tableId)' })
    @ApiQuery({ name: 'date', required: false, type: String, description: 'Formato YYYY-MM-DD (default: hoy)' })
    @ApiQuery({ name: 'status', required: false, enum: ReservationStatus })
    @ApiQuery({ name: 'tableId', required: false, type: String })
    @ApiResponse({ status: 200, type: [ReservationDto] })
    findAll(
      @CurrentUser() user: { restaurantId: string },
      @Query('date') date?: string,
      @Query('status') status?: ReservationStatus,
      @Query('tableId') tableId?: string,
    ) {
      return this.reservationsService.findAll(user.restaurantId, { date, status, tableId });
    }

    @Post()
    @ApiOperation({ summary: 'Crear reserva con validación completa' })
    @ApiResponse({ status: 201, type: ReservationDto })
    @ApiResponse({ status: 400, description: 'Mesa inactiva o capacidad insuficiente' })
    @ApiResponse({ status: 409, description: 'Solapamiento de horario' })
    create(
      @CurrentUser() user: { restaurantId: string },
      @Body() dto: CreateReservationDto,
    ) {
      return this.reservationsService.create(user.restaurantId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Editar datos o cambiar estado de la reserva' })
    @ApiParam({ name: 'id', type: String })
    @ApiResponse({ status: 200, type: ReservationDto })
    update(
      @Param('id') id: string,
      @CurrentUser() user: { restaurantId: string },
      @Body() dto: UpdateReservationDto,
    ) {
      return this.reservationsService.update(id, user.restaurantId, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Cancelar reserva' })
    @ApiParam({ name: 'id', type: String })
    @ApiQuery({ name: 'reason', required: false, type: String })
    @ApiResponse({ status: 204 })
    cancel(
      @Param('id') id: string,
      @CurrentUser() user: { restaurantId: string },
      @Query('reason') reason?: string,
    ) {
      return this.reservationsService.cancel(id, user.restaurantId, reason);
    }
  }
  ```

- [ ] **Step 2: Create module**

  `apps/api-core/src/reservations/reservations.module.ts`:

  ```typescript
  import { Module } from '@nestjs/common';
  import { ReservationsService } from './reservations.service';
  import { ReservationsController } from './reservations.controller';
  import { ReservationsRepository } from './reservations.repository';
  import { TablesModule } from '../tables/tables.module';
  import { RestaurantsModule } from '../restaurants/restaurants.module';

  @Module({
    imports: [TablesModule, RestaurantsModule],
    controllers: [ReservationsController],
    providers: [ReservationsService, ReservationsRepository],
    exports: [ReservationsService, ReservationsRepository],
  })
  export class ReservationsModule {}
  ```

- [ ] **Step 3: Register in `AppModule`**

  In `apps/api-core/src/app.module.ts`, import `ReservationsModule`:

  ```typescript
  import { ReservationsModule } from './reservations/reservations.module';
  ```

  Add to the `imports` array (after `TablesModule`):

  ```typescript
  ReservationsModule,
  ```

- [ ] **Step 4: Run all unit tests**

  ```bash
  cd apps/api-core && pnpm test
  ```

  Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api-core/src/reservations/ apps/api-core/src/app.module.ts
  git commit -m "feat(reservations): add reservations module with full validation"
  ```

---

## Chunk 4: Restaurant Settings Endpoint

### Task 11: Add `PATCH /v1/restaurants/settings` endpoint

**Files:**
- Create: `apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts`
- Modify: `apps/api-core/src/restaurants/restaurants.controller.ts`

- [ ] **Step 1: Create settings DTO**

  `apps/api-core/src/restaurants/dto/update-restaurant-settings.dto.ts`:

  ```typescript
  import { IsInt, IsOptional, Min, Max } from 'class-validator';
  import { ApiPropertyOptional } from '@nestjs/swagger';

  export class UpdateRestaurantSettingsDto {
    @ApiPropertyOptional({
      example: 90,
      description: 'Duración estimada por reserva en minutos',
      minimum: 15,
      maximum: 480,
    })
    @IsInt()
    @Min(15)
    @Max(480)
    @IsOptional()
    defaultReservationDuration?: number;
  }
  ```

- [ ] **Step 2: Add settings endpoint to `RestaurantsController`**

  In `apps/api-core/src/restaurants/restaurants.controller.ts`, add the import and endpoint:

  ```typescript
  // Add to imports:
  import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';
  ```

  Add endpoint after the existing `rename` method. Note: `RestaurantsService.update` expects `Prisma.RestaurantUpdateInput` — build the update object explicitly to avoid type errors:

  ```typescript
  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update restaurant settings (ADMIN only)' })
  @ApiResponse({ status: 200 })
  async updateSettings(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateRestaurantSettingsDto,
  ) {
    const data: Record<string, unknown> = {};
    if (dto.defaultReservationDuration !== undefined) {
      data.defaultReservationDuration = dto.defaultReservationDuration;
    }
    return this.restaurantsService.update(user.restaurantId, data);
  }
  ```

  Also add `Role` to the existing import if not already present:

  ```typescript
  import { Role } from '@prisma/client';
  ```

- [ ] **Step 3: Run all unit tests**

  ```bash
  cd apps/api-core && pnpm test
  ```

  Expected: PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api-core/src/restaurants/
  git commit -m "feat(restaurants): add PATCH /settings endpoint for defaultReservationDuration"
  ```

---

## Chunk 5: Dashboard UI

### Task 12: Tables page

**Files:**
- Create: `apps/ui-dashboard/src/pages/dash/tables.astro`

- [ ] **Step 1: Create tables page**

  `apps/ui-dashboard/src/pages/dash/tables.astro`:

  ```astro
  ---
  export const prerender = true;
  import DashboardLayout from '../../layouts/DashboardLayout.astro';
  import DataTable from '../../components/dash/DataTable.astro';
  ---

  <DashboardLayout>
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-slate-800">Mesas</h2>
        <button id="newTableBtn"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none">
          Nueva mesa
        </button>
      </div>

      <!-- Create / Edit Form -->
      <div id="tableForm" class="hidden bg-white rounded-xl border border-slate-200 p-6">
        <h3 id="formTitle" class="text-lg font-semibold text-slate-800 mb-4">Nueva mesa</h3>
        <form id="tableFormEl" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <input type="hidden" id="tableId" />
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input type="text" id="tableName" required maxlength="100"
              placeholder="Mesa 1"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Capacidad</label>
            <input type="number" id="tableCapacity" required min="1"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div id="activeField" class="hidden">
            <label class="block text-sm font-medium text-slate-700 mb-1">Activa</label>
            <select id="tableActive"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>
          <div class="flex gap-2">
            <button type="submit"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none">
              Guardar
            </button>
            <button type="button" id="cancelFormBtn"
              class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors cursor-pointer border-none">
              Cancelar
            </button>
          </div>
        </form>
        <p id="formError" class="hidden mt-3 text-sm text-red-600"></p>
      </div>

      <DataTable
        tbodyId="tablesTableBody"
        minWidth="400px"
        columns={[
          { label: 'Nombre' },
          { label: 'Capacidad', nowrap: true },
          { label: 'Estado', nowrap: true },
          { label: 'Acciones', align: 'right', nowrap: true },
        ]}
      />
    </div>
  </DashboardLayout>

  <script>
    import { apiFetch } from '../../lib/api';
    import { setTableLoading, setTableEmpty, setTableError } from '../../lib/pagination';

    const COLSPAN = 4;
    const tableBody = document.getElementById('tablesTableBody')!;
    const tableForm = document.getElementById('tableForm')!;
    const formEl = document.getElementById('tableFormEl') as HTMLFormElement;
    const formTitle = document.getElementById('formTitle')!;
    const formError = document.getElementById('formError')!;
    const activeField = document.getElementById('activeField')!;

    function showForm(mode: 'create' | 'edit', data?: any) {
      formTitle.textContent = mode === 'create' ? 'Nueva mesa' : 'Editar mesa';
      activeField.classList.toggle('hidden', mode === 'create');
      formError.classList.add('hidden');
      if (data) {
        (document.getElementById('tableId') as HTMLInputElement).value = data.id;
        (document.getElementById('tableName') as HTMLInputElement).value = data.name;
        (document.getElementById('tableCapacity') as HTMLInputElement).value = String(data.capacity);
        (document.getElementById('tableActive') as HTMLSelectElement).value = String(data.active);
      } else {
        formEl.reset();
        (document.getElementById('tableId') as HTMLInputElement).value = '';
      }
      tableForm.classList.remove('hidden');
    }

    function hideForm() {
      tableForm.classList.add('hidden');
      formEl.reset();
      formError.classList.add('hidden');
    }

    async function loadTables() {
      setTableLoading(tableBody, COLSPAN);
      const res = await apiFetch('/v1/tables');
      if (!res.ok) {
        setTableError(tableBody, COLSPAN, 'Error al cargar las mesas');
        return;
      }
      const tables = await res.json();
      if (tables.length === 0) {
        setTableEmpty(tableBody, COLSPAN, 'No hay mesas registradas');
        return;
      }
      tableBody.innerHTML = tables.map((t: any) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="px-4 py-3 font-medium text-slate-800">${t.name}</td>
          <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${t.capacity} personas</td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="px-2 py-0.5 text-xs rounded-full ${t.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
              ${t.active ? 'Activa' : 'Inactiva'}
            </span>
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
            <button data-edit='${JSON.stringify(t)}' class="edit-btn text-indigo-600 hover:text-indigo-800 cursor-pointer bg-transparent border-none text-sm">Editar</button>
            <button data-delete="${t.id}" class="delete-btn text-red-600 hover:text-red-800 cursor-pointer bg-transparent border-none text-sm">Eliminar</button>
          </td>
        </tr>
      `).join('');
      bindTableEvents();
    }

    function bindTableEvents() {
      tableBody.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const data = JSON.parse((btn as HTMLElement).dataset.edit!);
          showForm('edit', data);
        });
      });
      tableBody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.delete!;
          if (!confirm('¿Eliminar esta mesa?')) return;
          const res = await apiFetch(`/v1/tables/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.message || 'No se pudo eliminar la mesa');
            return;
          }
          loadTables();
        });
      });
    }

    document.getElementById('newTableBtn')!.addEventListener('click', () => showForm('create'));
    document.getElementById('cancelFormBtn')!.addEventListener('click', hideForm);

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.classList.add('hidden');

      const id = (document.getElementById('tableId') as HTMLInputElement).value;
      const isEdit = !!id;
      const body: Record<string, any> = {
        name: (document.getElementById('tableName') as HTMLInputElement).value,
        capacity: Number((document.getElementById('tableCapacity') as HTMLInputElement).value),
      };
      if (isEdit) {
        body.active = (document.getElementById('tableActive') as HTMLSelectElement).value === 'true';
      }

      const res = await apiFetch(
        isEdit ? `/v1/tables/${id}` : '/v1/tables',
        { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        formError.textContent = data?.message || 'Error al guardar';
        formError.classList.remove('hidden');
        return;
      }

      hideForm();
      loadTables();
    });

    loadTables();
  </script>
  ```

### Task 13: Reservations page

**Files:**
- Create: `apps/ui-dashboard/src/pages/dash/reservations.astro`

- [ ] **Step 1: Create reservations page**

  `apps/ui-dashboard/src/pages/dash/reservations.astro`:

  ```astro
  ---
  export const prerender = true;
  import DashboardLayout from '../../layouts/DashboardLayout.astro';
  import DataTable from '../../components/dash/DataTable.astro';
  ---

  <DashboardLayout>
    <div class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-slate-800">Reservas</h2>
        <button id="newReservationBtn"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none">
          Nueva reserva
        </button>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
          <input type="date" id="filterDate"
            class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Estado</label>
          <select id="filterStatus"
            class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="CONFIRMED">Confirmada</option>
            <option value="SEATED">En mesa</option>
            <option value="COMPLETED">Completada</option>
            <option value="NO_SHOW">No se presentó</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Mesa</label>
          <select id="filterTable"
            class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Todas</option>
          </select>
        </div>
        <button id="applyFiltersBtn"
          class="px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors cursor-pointer border-none">
          Filtrar
        </button>
      </div>

      <!-- Create / Edit Form -->
      <div id="reservationForm" class="hidden bg-white rounded-xl border border-slate-200 p-6">
        <h3 id="reservationFormTitle" class="text-lg font-semibold text-slate-800 mb-4">Nueva reserva</h3>
        <form id="reservationFormEl" class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="hidden" id="reservationId" />

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Mesa</label>
            <select id="resTable" required
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Fecha y hora</label>
            <input type="datetime-local" id="resDate" required
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Personas</label>
            <input type="number" id="resPartySize" required min="1"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Nombre del cliente</label>
            <input type="text" id="resGuestName" required maxlength="200"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
            <input type="text" id="resGuestPhone" required maxlength="50"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Email (opcional)</label>
            <input type="email" id="resGuestEmail"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div class="md:col-span-3">
            <label class="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
            <input type="text" id="resNotes" maxlength="500"
              placeholder="Ej: cumpleaños, traer torta"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <!-- Payment section -->
          <div class="md:col-span-3 border-t border-slate-100 pt-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="resPaid" class="rounded" />
              <span class="text-sm font-medium text-slate-700">Ya pagó</span>
            </label>
          </div>
          <div id="paymentFields" class="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4 hidden">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Referencia de pago</label>
              <input type="text" id="resPaymentRef"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Plataforma</label>
              <input type="text" id="resPaymentPlatform" placeholder="MercadoPago, Efectivo…"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div class="md:col-span-3 flex gap-2 pt-2">
            <button type="submit"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none">
              Guardar
            </button>
            <button type="button" id="cancelResFormBtn"
              class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors cursor-pointer border-none">
              Cancelar
            </button>
          </div>
        </form>
        <p id="resFormError" class="hidden mt-3 text-sm text-red-600"></p>
      </div>

      <DataTable
        tbodyId="reservationsTableBody"
        minWidth="700px"
        columns={[
          { label: 'Hora', nowrap: true },
          { label: 'Mesa', nowrap: true },
          { label: 'Cliente' },
          { label: 'Personas', nowrap: true },
          { label: 'Estado', nowrap: true },
          { label: 'Pagó', nowrap: true },
          { label: 'Acciones', align: 'right', nowrap: true },
        ]}
      />
    </div>
  </DashboardLayout>

  <script>
    import { apiFetch } from '../../lib/api';
    import { setTableLoading, setTableEmpty, setTableError } from '../../lib/pagination';

    const COLSPAN = 7;
    const tableBody = document.getElementById('reservationsTableBody')!;
    const resForm = document.getElementById('reservationForm')!;
    const resFormEl = document.getElementById('reservationFormEl') as HTMLFormElement;
    const resFormError = document.getElementById('resFormError')!;
    const resFormTitle = document.getElementById('reservationFormTitle')!;
    const paymentFields = document.getElementById('paymentFields')!;
    const resPaid = document.getElementById('resPaid') as HTMLInputElement;

    const STATUS_LABELS: Record<string, string> = {
      PENDING: 'Pendiente',
      CONFIRMED: 'Confirmada',
      SEATED: 'En mesa',
      COMPLETED: 'Completada',
      NO_SHOW: 'No se presentó',
      CANCELLED: 'Cancelada',
    };

    const STATUS_COLORS: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-700',
      CONFIRMED: 'bg-blue-100 text-blue-700',
      SEATED: 'bg-indigo-100 text-indigo-700',
      COMPLETED: 'bg-green-100 text-green-700',
      NO_SHOW: 'bg-red-100 text-red-700',
      CANCELLED: 'bg-slate-100 text-slate-500',
    };

    const NEXT_STATUS: Record<string, string | null> = {
      PENDING: 'CONFIRMED',
      CONFIRMED: 'SEATED',
      SEATED: 'COMPLETED',
      COMPLETED: null,
      NO_SHOW: null,
      CANCELLED: null,
    };

    const NEXT_STATUS_LABEL: Record<string, string> = {
      CONFIRMED: 'Confirmar',
      SEATED: 'Sentar',
      COMPLETED: 'Completar',
    };

    let allTables: any[] = [];

    // Set default filter date to today
    const filterDate = document.getElementById('filterDate') as HTMLInputElement;
    filterDate.value = new Date().toISOString().split('T')[0];

    async function loadTables() {
      const res = await apiFetch('/v1/tables');
      if (!res.ok) return;
      allTables = await res.json();

      const filterTableEl = document.getElementById('filterTable') as HTMLSelectElement;
      const firstOpt = filterTableEl.querySelector('option')!;
      filterTableEl.innerHTML = '';
      filterTableEl.appendChild(firstOpt);
      allTables.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.capacity} pers.)`;
        filterTableEl.appendChild(opt);
      });

      const resTableEl = document.getElementById('resTable') as HTMLSelectElement;
      resTableEl.innerHTML = '<option value="">Seleccionar mesa…</option>';
      allTables.filter(t => t.active).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.capacity} pers.)`;
        resTableEl.appendChild(opt);
      });
    }

    async function loadReservations() {
      setTableLoading(tableBody, COLSPAN);

      const date = (document.getElementById('filterDate') as HTMLInputElement).value;
      const status = (document.getElementById('filterStatus') as HTMLSelectElement).value;
      const tableId = (document.getElementById('filterTable') as HTMLSelectElement).value;

      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (status) params.set('status', status);
      if (tableId) params.set('tableId', tableId);

      const res = await apiFetch(`/v1/reservations?${params}`);
      if (!res.ok) {
        setTableError(tableBody, COLSPAN, 'Error al cargar las reservas');
        return;
      }
      const reservations = await res.json();

      if (reservations.length === 0) {
        setTableEmpty(tableBody, COLSPAN, 'No hay reservas para los filtros seleccionados');
        return;
      }

      tableBody.innerHTML = reservations.map((r: any) => {
        const time = new Date(r.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const nextStatus = NEXT_STATUS[r.status];
        const nextLabel = nextStatus ? NEXT_STATUS_LABEL[nextStatus] ?? nextStatus : null;
        const isActive = !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(r.status);

        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">${time}</td>
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${r.table?.name ?? '-'}</td>
            <td class="px-4 py-3 text-slate-800">
              <div class="font-medium">${r.guestName}</div>
              <div class="text-xs text-slate-500">${r.guestPhone}</div>
            </td>
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${r.partySize} pers.</td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-500'}">
                ${STATUS_LABELS[r.status] ?? r.status}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="px-2 py-0.5 text-xs rounded-full ${r.isPaid ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}">
                ${r.isPaid ? 'Sí' : 'No'}
              </span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
              ${nextLabel ? `<button data-advance="${r.id}" data-next="${nextStatus}" class="advance-btn text-indigo-600 hover:text-indigo-800 cursor-pointer bg-transparent border-none text-sm">${nextLabel}</button>` : ''}
              ${isActive && r.status === 'SEATED' ? `<button data-noshow="${r.id}" class="noshow-btn text-orange-600 hover:text-orange-800 cursor-pointer bg-transparent border-none text-sm">No show</button>` : ''}
              ${isActive ? `<button data-edit='${JSON.stringify(r)}' class="edit-res-btn text-slate-600 hover:text-slate-800 cursor-pointer bg-transparent border-none text-sm">Editar</button>` : ''}
              ${isActive ? `<button data-cancel="${r.id}" class="cancel-res-btn text-red-600 hover:text-red-800 cursor-pointer bg-transparent border-none text-sm">Cancelar</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      bindReservationEvents();
    }

    function bindReservationEvents() {
      tableBody.querySelectorAll('.advance-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const el = btn as HTMLElement;
          const res = await apiFetch(`/v1/reservations/${el.dataset.advance}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: el.dataset.next }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.message || 'Error al cambiar estado');
            return;
          }
          loadReservations();
        });
      });

      tableBody.querySelectorAll('.noshow-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.noshow!;
          const res = await apiFetch(`/v1/reservations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'NO_SHOW' }),
          });
          if (res.ok) loadReservations();
        });
      });

      tableBody.querySelectorAll('.edit-res-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const data = JSON.parse((btn as HTMLElement).dataset.edit!);
          showResForm('edit', data);
        });
      });

      tableBody.querySelectorAll('.cancel-res-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.cancel!;
          const reason = prompt('Motivo de cancelación (opcional):') ?? undefined;
          const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
          const res = await apiFetch(`/v1/reservations/${id}${params}`, { method: 'DELETE' });
          if (res.ok) {
            loadReservations();
          } else {
            const data = await res.json().catch(() => null);
            alert(data?.message || 'Error al cancelar');
          }
        });
      });
    }

    function showResForm(mode: 'create' | 'edit', data?: any) {
      resFormTitle.textContent = mode === 'create' ? 'Nueva reserva' : 'Editar reserva';
      resFormError.classList.add('hidden');
      resFormEl.reset();

      if (data) {
        (document.getElementById('reservationId') as HTMLInputElement).value = data.id;
        (document.getElementById('resTable') as HTMLSelectElement).value = data.tableId;
        const localDate = new Date(data.date);
        const offset = localDate.getTimezoneOffset();
        const adjusted = new Date(localDate.getTime() - offset * 60_000);
        (document.getElementById('resDate') as HTMLInputElement).value = adjusted.toISOString().slice(0, 16);
        (document.getElementById('resPartySize') as HTMLInputElement).value = String(data.partySize);
        (document.getElementById('resGuestName') as HTMLInputElement).value = data.guestName;
        (document.getElementById('resGuestPhone') as HTMLInputElement).value = data.guestPhone;
        (document.getElementById('resGuestEmail') as HTMLInputElement).value = data.guestEmail ?? '';
        (document.getElementById('resNotes') as HTMLInputElement).value = data.notes ?? '';
        resPaid.checked = data.isPaid;
        (document.getElementById('resPaymentRef') as HTMLInputElement).value = data.paymentReference ?? '';
        (document.getElementById('resPaymentPlatform') as HTMLInputElement).value = data.paymentPlatform ?? '';
        paymentFields.classList.toggle('hidden', !data.isPaid);
      } else {
        (document.getElementById('reservationId') as HTMLInputElement).value = '';
        paymentFields.classList.add('hidden');
      }

      resForm.classList.remove('hidden');
    }

    function hideResForm() {
      resForm.classList.add('hidden');
      resFormEl.reset();
      paymentFields.classList.add('hidden');
    }

    resPaid.addEventListener('change', () => {
      paymentFields.classList.toggle('hidden', !resPaid.checked);
    });

    document.getElementById('newReservationBtn')!.addEventListener('click', () => showResForm('create'));
    document.getElementById('cancelResFormBtn')!.addEventListener('click', hideResForm);
    document.getElementById('applyFiltersBtn')!.addEventListener('click', loadReservations);

    resFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      resFormError.classList.add('hidden');

      const id = (document.getElementById('reservationId') as HTMLInputElement).value;
      const isEdit = !!id;
      const isPaid = resPaid.checked;

      const body: Record<string, any> = {
        tableId: (document.getElementById('resTable') as HTMLSelectElement).value,
        date: new Date((document.getElementById('resDate') as HTMLInputElement).value).toISOString(),
        partySize: Number((document.getElementById('resPartySize') as HTMLInputElement).value),
        guestName: (document.getElementById('resGuestName') as HTMLInputElement).value,
        guestPhone: (document.getElementById('resGuestPhone') as HTMLInputElement).value,
        isPaid,
      };

      const email = (document.getElementById('resGuestEmail') as HTMLInputElement).value;
      if (email) body.guestEmail = email;

      const notes = (document.getElementById('resNotes') as HTMLInputElement).value;
      if (notes) body.notes = notes;

      if (isPaid) {
        const ref = (document.getElementById('resPaymentRef') as HTMLInputElement).value;
        const platform = (document.getElementById('resPaymentPlatform') as HTMLInputElement).value;
        if (ref) body.paymentReference = ref;
        if (platform) body.paymentPlatform = platform;
      }

      const res = await apiFetch(
        isEdit ? `/v1/reservations/${id}` : '/v1/reservations',
        { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        resFormError.textContent = data?.message || 'Error al guardar la reserva';
        resFormError.classList.remove('hidden');
        return;
      }

      hideResForm();
      loadReservations();
    });

    await loadTables();
    loadReservations();
  </script>
  ```

### Task 14: Settings UI page

**Files:**
- Create: `apps/ui-dashboard/src/pages/dash/settings.astro`

- [ ] **Step 1: Create settings page**

  `apps/ui-dashboard/src/pages/dash/settings.astro`:

  ```astro
  ---
  export const prerender = true;
  import DashboardLayout from '../../layouts/DashboardLayout.astro';
  ---

  <DashboardLayout>
    <div class="space-y-6 max-w-lg">
      <h2 class="text-2xl font-bold text-slate-800">Configuración</h2>

      <div class="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 class="text-base font-semibold text-slate-800">Reservas</h3>
        <form id="settingsForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">
              Duración estimada por reserva (minutos)
            </label>
            <input type="number" id="reservationDuration" required min="15" max="480"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p class="mt-1 text-xs text-slate-500">
              Esta duración se asigna a nuevas reservas automáticamente (mín. 15 min, máx. 480 min).
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button type="submit"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none">
              Guardar
            </button>
            <p id="saveSuccess" class="hidden text-sm text-green-600">Guardado correctamente.</p>
            <p id="saveError" class="hidden text-sm text-red-600"></p>
          </div>
        </form>
      </div>
    </div>
  </DashboardLayout>

  <script>
    import { apiFetch } from '../../lib/api';

    const form = document.getElementById('settingsForm') as HTMLFormElement;
    const durationInput = document.getElementById('reservationDuration') as HTMLInputElement;
    const saveSuccess = document.getElementById('saveSuccess')!;
    const saveError = document.getElementById('saveError')!;

    // Load current settings
    async function loadSettings() {
      // Fetch restaurant info — the profile endpoint returns restaurantId context
      // We use GET /v1/auth/profile which includes the restaurant's settings
      const res = await apiFetch('/v1/restaurants/settings');
      if (res.ok) {
        const data = await res.json();
        durationInput.value = String(data.defaultReservationDuration ?? 90);
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveSuccess.classList.add('hidden');
      saveError.classList.add('hidden');

      const res = await apiFetch('/v1/restaurants/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          defaultReservationDuration: Number(durationInput.value),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        saveError.textContent = data?.message || 'Error al guardar';
        saveError.classList.remove('hidden');
        return;
      }

      saveSuccess.classList.remove('hidden');
      setTimeout(() => saveSuccess.classList.add('hidden'), 3000);
    });

    loadSettings();
  </script>
  ```

  > **Note:** The settings page uses `GET /v1/restaurants/settings` to pre-load the current value. Add a `GET /v1/restaurants/settings` endpoint to `RestaurantsController` that returns `{ defaultReservationDuration }` from `restaurantsService.findById(user.restaurantId)`.

- [ ] **Step 2: Add `GET /v1/restaurants/settings` endpoint**

  In `apps/api-core/src/restaurants/restaurants.controller.ts`, add before the `PATCH settings` endpoint:

  ```typescript
  @Get('settings')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get restaurant settings' })
  async getSettings(@CurrentUser() user: { restaurantId: string }) {
    const restaurant = await this.restaurantsService.findById(user.restaurantId);
    return { defaultReservationDuration: restaurant!.defaultReservationDuration };
  }
  ```

  Also add `Get` to the `@nestjs/common` imports in the controller.

### Task 15: Update navigation

**Files:**
- Modify: `apps/ui-dashboard/src/layouts/DashboardLayout.astro`

- [ ] **Step 1: Add nav links for Tables, Reservations, and Settings**

  In `apps/ui-dashboard/src/layouts/DashboardLayout.astro`, find the `navItems` array and add:

  ```typescript
  { href: '/dash/tables', label: 'Mesas' },
  { href: '/dash/reservations', label: 'Reservas' },
  { href: '/dash/settings', label: 'Configuración' },
  ```

  Insert them after `{ href: '/dash/users', label: 'Usuarios' }`.

- [ ] **Step 2: Build UI and verify no compilation errors**

  ```bash
  cd apps/ui-dashboard && pnpm build
  ```

  Expected: build succeeds with no errors.

- [ ] **Step 3: Run all backend tests one final time**

  ```bash
  cd apps/api-core && pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Final commit**

  ```bash
  git add apps/ui-dashboard/src/pages/dash/tables.astro \
          apps/ui-dashboard/src/pages/dash/reservations.astro \
          apps/ui-dashboard/src/pages/dash/settings.astro \
          apps/ui-dashboard/src/layouts/DashboardLayout.astro
  git commit -m "feat(ui): add tables, reservations, and settings dashboard pages"
  ```
