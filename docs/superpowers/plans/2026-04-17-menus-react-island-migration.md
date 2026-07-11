# Menus Module React Island Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vanilla-DOM `menus.astro` and `menus/detail.astro` with React islands backed by TanStack Query, and add pagination to `GET /v1/menus`.

**Architecture:** The api-core `GET /v1/menus` endpoint is updated to return a paginated `{ data, meta }` envelope (matching the products pattern). On the UI side, five focused React components are created under `components/dash/menus/`, plus a shared `IconButton` commons component. The two Astro pages become thin shells that mount the islands.

**Tech Stack:** NestJS, Prisma, React, TanStack Query, Vitest, Testing Library, Tailwind CSS, Astro.

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/api-core/src/menus/menu.repository.ts` |
| Modify | `apps/api-core/src/menus/menus.service.ts` |
| Modify | `apps/api-core/src/menus/menus.controller.ts` |
| Create | `apps/api-core/src/menus/serializers/paginated-menus.serializer.ts` |
| Modify | `apps/api-core/test/menus/list-menus.e2e-spec.ts` |
| Create | `apps/ui/src/components/commons/IconButton.tsx` |
| Create | `apps/ui/src/components/commons/IconButton.test.tsx` |
| Create | `apps/ui/src/lib/menus-api.ts` |
| Create | `apps/ui/src/components/dash/menus/MenuForm.tsx` |
| Create | `apps/ui/src/components/dash/menus/MenuForm.test.tsx` |
| Create | `apps/ui/src/components/dash/menus/MenusIsland.tsx` |
| Create | `apps/ui/src/components/dash/menus/MenusIsland.test.tsx` |
| Modify | `apps/ui/src/pages/dash/menus.astro` |
| Create | `apps/ui/src/components/dash/menus/MenuItemsSection.tsx` |
| Create | `apps/ui/src/components/dash/menus/ProductPickerModal.tsx` |
| Create | `apps/ui/src/components/dash/menus/MenuDetailIsland.tsx` |
| Create | `apps/ui/src/components/dash/menus/MenuDetailIsland.test.tsx` |
| Modify | `apps/ui/src/pages/dash/menus/detail.astro` |

---

## Task 1: api-core — Paginate GET /v1/menus

**Files:**
- Modify: `apps/api-core/test/menus/list-menus.e2e-spec.ts`
- Create: `apps/api-core/src/menus/serializers/paginated-menus.serializer.ts`
- Modify: `apps/api-core/src/menus/menu.repository.ts`
- Modify: `apps/api-core/src/menus/menus.service.ts`
- Modify: `apps/api-core/src/menus/menus.controller.ts`

- [ ] **Step 1: Update the e2e test to expect the paginated response shape**

Replace the full content of `apps/api-core/test/menus/list-menus.e2e-spec.ts`:

```typescript
/**
 * E2E: GET /v1/menus
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 200 ADMIN, MANAGER, BASIC can list
 *  - 200 isolation — only own restaurant menus
 *  - 200 paginated response shape { data, meta }
 *  - 200 serializer shape (fields present and absent)
 *  - 200 soft-deleted menus excluded
 *  - 200 itemsCount reflects actual count
 */

import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';

import { PrismaService } from '../../src/prisma/prisma.service';
import { bootstrapApp, seedRestaurant, login, TEST_DB_DIR } from './helpers';

const TEST_DB = path.join(TEST_DB_DIR, 'test-menus-list.db');

describe('GET /v1/menus (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminTokenA: string;
  let managerTokenA: string;
  let basicTokenA: string;
  let adminTokenB: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapApp(TEST_DB));

    const seedA = await seedRestaurant(prisma, 'listA');
    adminTokenA   = await login(app, seedA.admin.email);
    managerTokenA = await login(app, seedA.manager.email);
    basicTokenA   = await login(app, seedA.basic.email);

    const seedB = await seedRestaurant(prisma, 'listB');
    adminTokenB = await login(app, seedB.admin.email);

    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Almuerzo', startTime: '12:00', endTime: '15:00', daysOfWeek: 'MON,TUE,WED,THU,FRI' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Cena', active: false })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .send({ name: 'Menu B' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('401 — unauthenticated request is rejected', async () => {
    await request(app.getHttpServer()).get('/v1/menus').expect(401);
  });

  it('200 — ADMIN can list menus and response has data/meta shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.page).toBe('number');
    expect(typeof res.body.meta.totalPages).toBe('number');
    expect(typeof res.body.meta.limit).toBe('number');
  });

  it('200 — MANAGER can list menus', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${managerTokenA}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('200 — BASIC can list menus', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${basicTokenA}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('200 — serializer exposes correct fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const menu = res.body.data.find((m: { name: string }) => m.name === 'Almuerzo');
    expect(menu).toBeDefined();

    expect(menu.id).toBeDefined();
    expect(menu.name).toBe('Almuerzo');
    expect(typeof menu.active).toBe('boolean');
    expect(menu.startTime).toBe('12:00');
    expect(menu.endTime).toBe('15:00');
    expect(menu.daysOfWeek).toBe('MON,TUE,WED,THU,FRI');
    expect(typeof menu.itemsCount).toBe('number');

    expect(menu.restaurantId).toBeUndefined();
    expect(menu.createdAt).toBeUndefined();
    expect(menu.updatedAt).toBeUndefined();
    expect(menu.deletedAt).toBeUndefined();
  });

  it('200 — only returns menus from own restaurant (isolation)', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const resB = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    const idsA = resA.body.data.map((m: { id: string }) => m.id);
    const idsB = resB.body.data.map((m: { id: string }) => m.id);

    idsA.forEach((id: string) => expect(idsB).not.toContain(id));
  });

  it('200 — soft-deleted menus are excluded', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({ name: 'Menu para eliminar' })
      .expect(201);

    const menuId = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/v1/menus/${menuId}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const found = res.body.data.find((m: { id: string }) => m.id === menuId);
    expect(found).toBeUndefined();
  });

  it('200 — itemsCount reflects actual item count', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/menus')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const menu = res.body.data.find((m: { name: string }) => m.name === 'Almuerzo');
    expect(menu.itemsCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run e2e test to verify it fails**

Run from `apps/api-core/`:
```bash
pnpm test:e2e --testPathPattern=list-menus
```
Expected: FAIL — tests asserting `res.body.data` will fail because the endpoint currently returns a plain array.

- [ ] **Step 3: Create PaginatedMenusSerializer**

Create `apps/api-core/src/menus/serializers/paginated-menus.serializer.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { MenuListSerializer } from './menu-list.serializer';

export class PaginatedMenusSerializer {
  @ApiProperty({ type: [MenuListSerializer] })
  @Type(() => MenuListSerializer)
  data: MenuListSerializer[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(partial: Partial<PaginatedMenusSerializer>) {
    Object.assign(this, partial);
  }
}
```

- [ ] **Step 4: Add paginated query method to MenuRepository**

In `apps/api-core/src/menus/menu.repository.ts`, add the following method after `findByRestaurantId`:

```typescript
async findByRestaurantIdPaginated(
  restaurantId: string,
  page: number,
  limit: number,
): Promise<{ items: Awaited<ReturnType<typeof this.findByRestaurantId>>; total: number }> {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    this.prisma.menu.findMany({
      where: { restaurantId, deletedAt: null },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    this.prisma.menu.count({ where: { restaurantId, deletedAt: null } }),
  ]);
  return { items, total };
}
```

- [ ] **Step 5: Add listMenusPaginated to MenusService**

In `apps/api-core/src/menus/menus.service.ts`, add the import for `PaginatedResult` and a new method:

At the top, add import:
```typescript
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
```

Add method after `findByRestaurantId`:
```typescript
async listMenusPaginated(
  restaurantId: string,
  page: number,
  limit: number,
): Promise<PaginatedResult<Awaited<ReturnType<MenuRepository['findByRestaurantId']>>[number]>> {
  const { items, total } = await this.menuRepository.findByRestaurantIdPaginated(
    restaurantId,
    page,
    limit,
  );
  return {
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

- [ ] **Step 6: Update MenusController to use pagination**

Replace the full content of `apps/api-core/src/menus/menus.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { MenusService } from './menus.service';
import { CreateMenuDto, UpdateMenuDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { MenuSerializer } from './serializers/menu.serializer';
import { MenuListSerializer } from './serializers/menu-list.serializer';
import { MenuWithItemsSerializer } from './serializers/menu-with-items.serializer';
import { PaginatedMenusSerializer } from './serializers/paginated-menus.serializer';

@ApiTags('menus')
@ApiBearerAuth()
@Controller({ version: '1', path: 'menus' })
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Listar menús del restaurante (paginado)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de menús', type: PaginatedMenusSerializer })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async listMenus(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ) {
    const result = await this.menusService.listMenusPaginated(
      user.restaurantId,
      query.page ?? 1,
      query.limit ?? 50,
    );
    return new PaginatedMenusSerializer({
      data: result.data.map(menu => new MenuListSerializer(menu)),
      meta: result.meta,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER, Role.BASIC)
  @ApiOperation({ summary: 'Obtener menú por ID con sus items' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú con items', type: MenuWithItemsSerializer })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getMenu(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    const menu = await this.menusService.findByIdWithItems(id, user.restaurantId);
    return new MenuWithItemsSerializer(menu);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Crear un menú' })
  @ApiResponse({ status: 201, description: 'Menú creado', type: MenuSerializer })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async create(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: CreateMenuDto,
  ) {
    const menu = await this.menusService.createMenu(user.restaurantId, dto);
    return new MenuSerializer(menu);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Actualizar un menú' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 200, description: 'Menú actualizado', type: MenuSerializer })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateMenuDto,
  ) {
    const menu = await this.menusService.updateMenu(id, user.restaurantId, dto);
    return new MenuSerializer(menu);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un menú (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID del menú', type: String })
  @ApiResponse({ status: 204, description: 'Menú eliminado' })
  @ApiResponse({ status: 404, description: 'Menú no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos — requiere ADMIN o MANAGER' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    await this.menusService.deleteMenu(id, user.restaurantId);
  }
}
```

- [ ] **Step 7: Run e2e tests to verify they pass**

Run from `apps/api-core/`:
```bash
pnpm test:e2e --testPathPattern=list-menus
```
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
cd apps/api-core
git add src/menus/menu.repository.ts \
        src/menus/menus.service.ts \
        src/menus/menus.controller.ts \
        src/menus/serializers/paginated-menus.serializer.ts \
        test/menus/list-menus.e2e-spec.ts
git commit -m "feat(menus): paginate GET /v1/menus with data/meta envelope"
```

---

## Task 2: UI — IconButton commons component

**Files:**
- Create: `apps/ui/src/components/commons/IconButton.tsx`
- Create: `apps/ui/src/components/commons/IconButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/components/commons/IconButton.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import IconButton from './IconButton';

test('renders with aria-label and title', () => {
  render(<IconButton icon="pencil" label="Editar" />);
  const btn = screen.getByRole('button', { name: 'Editar' });
  expect(btn).toBeInTheDocument();
  expect(btn).toHaveAttribute('title', 'Editar');
});

test('calls onClick when clicked', () => {
  const handleClick = vi.fn();
  render(<IconButton icon="trash" label="Eliminar" onClick={handleClick} />);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('applies danger variant class on hover', () => {
  render(<IconButton icon="trash" label="Eliminar" variant="danger" />);
  const btn = screen.getByRole('button', { name: 'Eliminar' });
  expect(btn.className).toContain('hover:text-red');
});

test('applies primary variant class on hover', () => {
  render(<IconButton icon="eye" label="Ver" variant="primary" />);
  const btn = screen.getByRole('button', { name: 'Ver' });
  expect(btn.className).toContain('hover:text-indigo');
});

test('is disabled when disabled prop is true', () => {
  render(<IconButton icon="pencil" label="Editar" disabled />);
  expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
});

test('renders svg with sm size (w-4 h-4)', () => {
  const { container } = render(<IconButton icon="pencil" label="Editar" size="sm" />);
  const svg = container.querySelector('svg');
  expect(svg?.classList.contains('w-4')).toBe(true);
  expect(svg?.classList.contains('h-4')).toBe(true);
});

test('renders svg with lg size (w-6 h-6)', () => {
  const { container } = render(<IconButton icon="list-bullet" label="Items" size="lg" />);
  const svg = container.querySelector('svg');
  expect(svg?.classList.contains('w-6')).toBe(true);
  expect(svg?.classList.contains('h-6')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/ui/`:
```bash
pnpm test IconButton
```
Expected: FAIL — `IconButton` module not found.

- [ ] **Step 3: Implement IconButton**

Create `apps/ui/src/components/commons/IconButton.tsx`:

```tsx
type IconName = 'pencil' | 'trash' | 'list-bullet' | 'eye';
type Variant = 'default' | 'danger' | 'primary';
type Size = 'sm' | 'md' | 'lg';

interface IconButtonProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
}

const sizeClasses: Record<Size, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const variantClasses: Record<Variant, string> = {
  default: 'text-slate-500 hover:text-slate-700',
  danger: 'text-slate-500 hover:text-red-600',
  primary: 'text-slate-500 hover:text-indigo-600',
};

const ICONS: Record<IconName, JSX.Element> = {
  pencil: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
    />
  ),
  trash: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  ),
  'list-bullet': (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
    />
  ),
  eye: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </>
  ),
};

export default function IconButton({
  icon,
  label,
  onClick,
  variant = 'default',
  size = 'md',
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center bg-transparent border-none cursor-pointer p-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className={sizeClasses[size]}
      >
        {ICONS[icon]}
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test IconButton
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/ui
git add src/components/commons/IconButton.tsx src/components/commons/IconButton.test.tsx
git commit -m "feat(ui): add IconButton commons component with Heroicons SVG"
```

---

## Task 3: UI — menus-api.ts

**Files:**
- Create: `apps/ui/src/lib/menus-api.ts`

- [ ] **Step 1: Create menus-api.ts**

Create `apps/ui/src/lib/menus-api.ts`:

```typescript
import { apiFetch } from './api';

export const MENUS_QUERY_KEY = '/v1/menus';

export interface Menu {
  id: string;
  name: string;
  active: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: string | null;
  itemsCount: number;
}

export interface MenuItem {
  id: string;
  productId: string;
  sectionName: string | null;
  order: number;
  product: { name: string; price: number; category?: { name: string } };
}

export interface MenuWithItems extends Menu {
  items: MenuItem[];
}

export interface MenuPayload {
  name: string;
  active?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek?: string | null;
}

export interface UpdateMenuItemPayload {
  sectionName?: string | null;
  order?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; totalPages: number; total: number; limit: number };
}

export async function fetchMenus(
  params: Record<string, string> = {},
): Promise<PaginatedResponse<Menu>> {
  const qs = new URLSearchParams({ limit: '50', ...params }).toString();
  const res = await apiFetch(`/v1/menus?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchMenuById(id: string): Promise<MenuWithItems> {
  const res = await apiFetch(`/v1/menus/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createMenu(payload: MenuPayload): Promise<Menu> {
  const res = await apiFetch('/v1/menus', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateMenu(id: string, payload: Partial<MenuPayload>): Promise<Menu> {
  const res = await apiFetch(`/v1/menus/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteMenu(id: string): Promise<void> {
  const res = await apiFetch(`/v1/menus/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function bulkCreateMenuItems(
  menuId: string,
  payload: { productIds: string[]; sectionName: string },
): Promise<{ created: number }> {
  const res = await apiFetch(`/v1/menus/${menuId}/items/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateMenuItem(
  menuId: string,
  itemId: string,
  payload: UpdateMenuItemPayload,
): Promise<MenuItem> {
  const res = await apiFetch(`/v1/menus/${menuId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteMenuItem(menuId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`/v1/menus/${menuId}/items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
```

- [ ] **Step 2: Commit**

```bash
cd apps/ui
git add src/lib/menus-api.ts
git commit -m "feat(ui): add menus-api.ts with types and fetch functions"
```

---

## Task 4: UI — MenuForm component

**Files:**
- Create: `apps/ui/src/components/dash/menus/MenuForm.tsx`
- Create: `apps/ui/src/components/dash/menus/MenuForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/components/dash/menus/MenuForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import MenuForm from './MenuForm';
import type { Menu } from '../../../lib/menus-api';

vi.mock('../../../lib/menus-api', () => ({
  createMenu: vi.fn(),
  updateMenu: vi.fn(),
}));

import { createMenu, updateMenu } from '../../../lib/menus-api';
const mockCreate = vi.mocked(createMenu);
const mockUpdate = vi.mocked(updateMenu);

const editMenu: Menu = {
  id: 'menu-1',
  name: 'Almuerzo',
  active: true,
  startTime: '12:00',
  endTime: '15:00',
  daysOfWeek: 'MON,WED,FRI',
  itemsCount: 3,
};

let defaultProps: { onSuccess: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps = { onSuccess: vi.fn(), onCancel: vi.fn() };
});

test('renders "Nuevo menú" title in create mode', () => {
  render(<MenuForm {...defaultProps} />);
  expect(screen.getByRole('heading', { name: 'Nuevo menú' })).toBeInTheDocument();
});

test('renders "Editar menú" title in edit mode', () => {
  render(<MenuForm {...defaultProps} initialData={editMenu} />);
  expect(screen.getByRole('heading', { name: 'Editar menú' })).toBeInTheDocument();
});

test('calls onCancel when cancel button clicked', () => {
  render(<MenuForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
});

test('calls createMenu and onSuccess on submit in create mode', async () => {
  mockCreate.mockResolvedValue({
    id: 'new-menu',
    name: 'Cena',
    active: true,
    startTime: null,
    endTime: null,
    daysOfWeek: null,
    itemsCount: 0,
  });

  render(<MenuForm {...defaultProps} />);
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Cena' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Cena' }),
  ));
  expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
});

test('calls updateMenu on submit in edit mode', async () => {
  mockUpdate.mockResolvedValue(editMenu);

  render(<MenuForm {...defaultProps} initialData={editMenu} />);
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Almuerzo Ejecutivo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
    'menu-1',
    expect.objectContaining({ name: 'Almuerzo Ejecutivo' }),
  ));
  expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
});

test('shows error message when name is empty and form is submitted', async () => {
  render(<MenuForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(screen.getByText(/El nombre es requerido/i)).toBeInTheDocument(),
  );
});

test('pre-fills fields from initialData', () => {
  render(<MenuForm {...defaultProps} initialData={editMenu} />);
  expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Almuerzo');
});

test('shows time fields when allDay toggle is unchecked', () => {
  render(<MenuForm {...defaultProps} />);
  const toggle = screen.getByLabelText(/Disponible en todo el horario/i);
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(screen.getByLabelText(/Hora inicio/i)).toBeVisible();
  expect(screen.getByLabelText(/Hora fin/i)).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/ui/`:
```bash
pnpm test MenuForm
```
Expected: FAIL — `MenuForm` module not found.

- [ ] **Step 3: Implement MenuForm**

Create `apps/ui/src/components/dash/menus/MenuForm.tsx`:

```tsx
import { useState } from 'react';
import Button from '../../commons/Button';
import type { Menu, MenuPayload } from '../../../lib/menus-api';
import { createMenu, updateMenu } from '../../../lib/menus-api';

const DAY_OPTIONS = [
  { value: 'MON', label: 'Lun' },
  { value: 'TUE', label: 'Mar' },
  { value: 'WED', label: 'Mié' },
  { value: 'THU', label: 'Jue' },
  { value: 'FRI', label: 'Vie' },
  { value: 'SAT', label: 'Sáb' },
  { value: 'SUN', label: 'Dom' },
];

interface MenuFormProps {
  initialData?: Menu;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MenuForm({ initialData, onSuccess, onCancel }: MenuFormProps) {
  const isEditing = !!initialData;

  const hasTime = !!(initialData?.startTime || initialData?.endTime);

  const [name, setName] = useState(initialData?.name ?? '');
  const [allDay, setAllDay] = useState(!hasTime);
  const [startTime, setStartTime] = useState(initialData?.startTime ?? '');
  const [endTime, setEndTime] = useState(initialData?.endTime ?? '');
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialData?.daysOfWeek ? initialData.daysOfWeek.split(',') : [],
  );
  const [active, setActive] = useState(initialData?.active !== false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    const payload: MenuPayload = { name: name.trim(), active };

    if (isEditing) {
      payload.startTime = allDay ? null : startTime || null;
      payload.endTime = allDay ? null : endTime || null;
      payload.daysOfWeek = selectedDays.length > 0 ? selectedDays.join(',') : null;
    } else {
      if (!allDay && startTime) payload.startTime = startTime;
      if (!allDay && endTime) payload.endTime = endTime;
      if (selectedDays.length > 0) payload.daysOfWeek = selectedDays.join(',');
    }

    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateMenu(initialData.id, payload);
      } else {
        await createMenu(payload);
      }
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        {isEditing ? 'Editar menú' : 'Nuevo menú'}
      </h3>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="mf-name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre *
          </label>
          <input
            id="mf-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="mf-allday"
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="mf-allday" className="text-sm font-medium text-slate-700">
            Disponible en todo el horario
          </label>
        </div>

        {!allDay && (
          <>
            <div>
              <label htmlFor="mf-start" className="block text-sm font-medium text-slate-700 mb-1">
                Hora inicio
              </label>
              <input
                id="mf-start"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="mf-end" className="block text-sm font-medium text-slate-700 mb-1">
                Hora fin
              </label>
              <input
                id="mf-end"
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <p className="text-sm font-medium text-slate-700 mb-2">Días de la semana</p>
          <div className="flex flex-wrap gap-3">
            {DAY_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(value)}
                  onChange={() => toggleDay(value)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="mf-active"
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="mf-active" className="text-sm font-medium text-slate-700">
            Menú activo
          </label>
        </div>

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>

        {error && (
          <p className="md:col-span-2 text-sm text-red-600">{error}</p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test MenuForm
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/ui
git add src/components/dash/menus/MenuForm.tsx src/components/dash/menus/MenuForm.test.tsx
git commit -m "feat(ui): add MenuForm component for menu create/edit"
```

---

## Task 5: UI — MenusIsland + update menus.astro

**Files:**
- Create: `apps/ui/src/components/dash/menus/MenusIsland.tsx`
- Create: `apps/ui/src/components/dash/menus/MenusIsland.test.tsx`
- Modify: `apps/ui/src/pages/dash/menus.astro`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/components/dash/menus/MenusIsland.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import MenusIsland from './MenusIsland';

vi.mock('../../../lib/menus-api', () => ({
  deleteMenu: vi.fn(),
  MENUS_QUERY_KEY: '/v1/menus',
}));

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

import { apiFetch } from '../../../lib/api';
import { deleteMenu } from '../../../lib/menus-api';

const mockApiFetch = vi.mocked(apiFetch);
const mockDelete = vi.mocked(deleteMenu);

const emptyResponse = {
  ok: true,
  json: async () => ({ data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 50 } }),
} as Response;

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(emptyResponse);
});

test('renders "Menús" heading and "Nuevo menú" button', () => {
  render(<MenusIsland />);
  expect(screen.getByRole('heading', { name: 'Menús' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nuevo menú' })).toBeInTheDocument();
});

test('shows MenuForm when "Nuevo menú" is clicked', () => {
  render(<MenusIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo menú' }));
  expect(screen.getByRole('heading', { name: 'Nuevo menú', level: 3 })).toBeInTheDocument();
});

test('hides MenuForm when cancel is clicked', () => {
  render(<MenusIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo menú' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('heading', { name: 'Nuevo menú', level: 3 })).not.toBeInTheDocument();
});

test('shows empty table message when API returns no menus', async () => {
  render(<MenusIsland />);
  await waitFor(() => expect(screen.getByText('No hay menús')).toBeInTheDocument());
});

test('renders menu rows from API response', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [
        {
          id: 'm1',
          name: 'Almuerzo',
          active: true,
          startTime: '12:00',
          endTime: '15:00',
          daysOfWeek: 'MON,TUE',
          itemsCount: 3,
        },
      ],
      meta: { page: 1, totalPages: 1, total: 1, limit: 50 },
    }),
  } as Response);

  render(<MenusIsland />);
  await waitFor(() => expect(screen.getByText('Almuerzo')).toBeInTheDocument());
  expect(screen.getByText('12:00 - 15:00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test MenusIsland
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MenusIsland**

Create `apps/ui/src/components/dash/menus/MenusIsland.tsx`:

```tsx
import { useState, useMemo, useCallback } from 'react';
import { useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../../commons/Providers';
import TableWithFetch from '../../commons/TableWithFetch';
import Button from '../../commons/Button';
import IconButton from '../../commons/IconButton';
import MenuForm from './MenuForm';
import { deleteMenu, MENUS_QUERY_KEY } from '../../../lib/menus-api';
import type { Menu } from '../../../lib/menus-api';

const DAY_LABELS: Record<string, string> = {
  MON: 'Lun', TUE: 'Mar', WED: 'Mié', THU: 'Jue', FRI: 'Vie', SAT: 'Sáb', SUN: 'Dom',
};

function formatSchedule(start: string | null, end: string | null): string {
  if (!start && !end) return '-';
  return `${start ?? '?'} - ${end ?? '?'}`;
}

function formatDays(days: string | null): string {
  if (!days) return '-';
  return days.split(',').map(d => DAY_LABELS[d] ?? d).join(', ');
}

function MenusContent() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleNew = () => {
    setEditingMenu(null);
    setShowForm(true);
  };

  const handleEdit = useCallback((menu: Menu) => {
    setEditingMenu(menu);
    setShowForm(true);
  }, []);

  const handleSuccess = () => {
    setShowForm(false);
    setEditingMenu(null);
    qc.invalidateQueries({ queryKey: [MENUS_QUERY_KEY] });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingMenu(null);
  };

  const handleDelete = useCallback(async (id: string) => {
    setDeleteError(null);
    if (!confirm('¿Eliminar este menú y todos sus items?')) return;
    try {
      await deleteMenu(id);
      qc.invalidateQueries({ queryKey: [MENUS_QUERY_KEY] });
    } catch {
      setDeleteError('Error al eliminar el menú');
    }
  }, [qc]);

  const columns = useMemo<ColumnDef<Menu>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ getValue }) => (
        <span className="font-medium text-slate-800 max-w-[200px] truncate block">
          {getValue<string>()}
        </span>
      ),
    },
    {
      id: 'schedule',
      header: 'Horario',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-slate-600">
          {formatSchedule(row.original.startTime, row.original.endTime)}
        </span>
      ),
    },
    {
      id: 'days',
      header: 'Días',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">{formatDays(row.original.daysOfWeek)}</span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Activo',
      cell: ({ getValue }) => {
        const active = getValue<boolean>();
        return (
          <span
            className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
              active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {active ? 'Sí' : 'No'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <IconButton
            icon="pencil"
            label="Editar"
            variant="primary"
            onClick={() => handleEdit(row.original)}
          />
          <IconButton
            icon="list-bullet"
            label="Ver items"
            variant="primary"
            onClick={() => { window.location.href = `/dash/menus/detail?id=${row.original.id}`; }}
          />
          <IconButton
            icon="trash"
            label="Eliminar"
            variant="danger"
            onClick={() => handleDelete(row.original.id)}
          />
        </div>
      ),
    },
  ], [handleEdit, handleDelete]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Menús</h2>
        {!showForm && (
          <Button onClick={handleNew}>Nuevo menú</Button>
        )}
      </div>

      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {deleteError}
        </p>
      )}

      {showForm && (
        <MenuForm
          initialData={editingMenu ?? undefined}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}

      <TableWithFetch<Menu>
        url={MENUS_QUERY_KEY}
        columns={columns}
        params={{ limit: '50' }}
        emptyMessage="No hay menús"
      />
    </div>
  );
}

export default function MenusIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <MenusContent />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test MenusIsland
```
Expected: all PASS.

- [ ] **Step 5: Replace menus.astro with thin shell**

Replace the full content of `apps/ui/src/pages/dash/menus.astro`:

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import MenusIsland from '../../components/dash/menus/MenusIsland';
---

<DashboardLayout>
  <MenusIsland client:load />
</DashboardLayout>
```

- [ ] **Step 6: Commit**

```bash
cd apps/ui
git add src/components/dash/menus/MenusIsland.tsx \
        src/components/dash/menus/MenusIsland.test.tsx \
        src/pages/dash/menus.astro
git commit -m "feat(ui): migrate menus.astro to MenusIsland React island"
```

---

## Task 6: UI — MenuItemsSection component

**Files:**
- Create: `apps/ui/src/components/dash/menus/MenuItemsSection.tsx`

- [ ] **Step 1: Implement MenuItemsSection**

Create `apps/ui/src/components/dash/menus/MenuItemsSection.tsx`:

```tsx
import { useState } from 'react';
import IconButton from '../../commons/IconButton';
import Button from '../../commons/Button';
import type { MenuItem } from '../../../lib/menus-api';
import { deleteMenuItem, updateMenuItem } from '../../../lib/menus-api';

interface MenuItemsSectionProps {
  menuId: string;
  sectionName: string;
  items: MenuItem[];
  onAddProducts: () => void;
  onRefresh: () => void;
}

export default function MenuItemsSection({
  menuId,
  sectionName,
  items,
  onAddProducts,
  onRefresh,
}: MenuItemsSectionProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');

  const handleEditOpen = (item: MenuItem) => {
    setEditingItemId(item.id);
    setEditSectionName(item.sectionName ?? '');
  };

  const handleEditSave = async (itemId: string) => {
    await updateMenuItem(menuId, itemId, { sectionName: editSectionName || null });
    setEditingItemId(null);
    onRefresh();
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('¿Quitar este producto del menú?')) return;
    await deleteMenuItem(menuId, itemId);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-700">{sectionName}</h3>
        <Button size="sm" variant="secondary" onClick={onAddProducts}>
          + Agregar productos
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-100">
          <tr>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Orden</th>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Producto</th>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Categoría</th>
            <th className="text-left px-4 py-2 font-medium text-slate-500 text-xs">Precio</th>
            <th className="text-right px-4 py-2 font-medium text-slate-500 text-xs">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-4 py-2.5 text-slate-400 text-xs">{item.order}</td>
              <td className="px-4 py-2.5 font-medium text-slate-800">{item.product.name}</td>
              <td className="px-4 py-2.5 text-slate-500 text-xs">
                {item.product.category?.name ?? '-'}
              </td>
              <td className="px-4 py-2.5 text-slate-600">
                ${Number(item.product.price).toFixed(2)}
              </td>
              <td className="px-4 py-2.5 text-right">
                {editingItemId === item.id ? (
                  <div className="flex gap-2 justify-end items-center">
                    <input
                      type="text"
                      value={editSectionName}
                      onChange={e => setEditSectionName(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded text-xs w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Button size="sm" onClick={() => handleEditSave(item.id)}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingItemId(null)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-1 justify-end">
                    <IconButton
                      icon="pencil"
                      label="Editar sección"
                      variant="primary"
                      onClick={() => handleEditOpen(item)}
                    />
                    <IconButton
                      icon="trash"
                      label="Quitar producto"
                      variant="danger"
                      onClick={() => handleDelete(item.id)}
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd apps/ui
git add src/components/dash/menus/MenuItemsSection.tsx
git commit -m "feat(ui): add MenuItemsSection component for menu detail"
```

---

## Task 7: UI — ProductPickerModal component

**Files:**
- Create: `apps/ui/src/components/dash/menus/ProductPickerModal.tsx`

- [ ] **Step 1: Implement ProductPickerModal**

Create `apps/ui/src/components/dash/menus/ProductPickerModal.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../../commons/Button';
import { apiFetch } from '../../../lib/api';
import { bulkCreateMenuItems } from '../../../lib/menus-api';

interface SimpleProduct {
  id: string;
  name: string;
  price: number;
}

interface ProductPickerModalProps {
  menuId: string;
  sectionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProductPickerModal({
  menuId,
  sectionName,
  onConfirm,
  onCancel,
}: ProductPickerModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading } = useQuery<{ data: SimpleProduct[] }>({
    queryKey: ['/v1/products', 'picker'],
    queryFn: async () => {
      const res = await apiFetch('/v1/products?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const products = data?.data ?? [];
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleProduct = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleConfirm = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);
    try {
      await bulkCreateMenuItems(menuId, { productIds: selected, sectionName });
      onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-6 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-800">
          Agregar productos a:{' '}
          <span className="text-indigo-600">{sectionName}</span>
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer text-xl leading-none"
          aria-label="Cerrar"
        >
          &times;
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 mb-4 border border-slate-100 rounded-lg p-2">
        {isLoading && (
          <div className="text-center py-4 text-slate-400 text-sm">Cargando productos...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-4 text-slate-400 text-sm">No hay productos</div>
        )}
        {filtered.map(p => (
          <label
            key={p.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggleProduct(p.id)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300"
            />
            <span className="flex-1 text-sm text-slate-800">{p.name}</span>
            <span className="text-xs text-slate-400">${Number(p.price).toFixed(2)}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-500">
          {selected.length} seleccionado{selected.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Agregando...' : 'Agregar seleccionados'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd apps/ui
git add src/components/dash/menus/ProductPickerModal.tsx
git commit -m "feat(ui): add ProductPickerModal for bulk product selection"
```

---

## Task 8: UI — MenuDetailIsland + update detail.astro

**Files:**
- Create: `apps/ui/src/components/dash/menus/MenuDetailIsland.tsx`
- Create: `apps/ui/src/components/dash/menus/MenuDetailIsland.test.tsx`
- Modify: `apps/ui/src/pages/dash/menus/detail.astro`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/components/dash/menus/MenuDetailIsland.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import MenuDetailIsland from './MenuDetailIsland';

vi.mock('../../../lib/menus-api', () => ({
  fetchMenuById: vi.fn(),
  bulkCreateMenuItems: vi.fn(),
  updateMenuItem: vi.fn(),
  deleteMenuItem: vi.fn(),
  MENUS_QUERY_KEY: '/v1/menus',
}));

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

// jsdom does not set window.location.search — set it before import
Object.defineProperty(window, 'location', {
  value: { search: '?id=menu-abc', href: '' },
  writable: true,
});

import { fetchMenuById } from '../../../lib/menus-api';
const mockFetchMenu = vi.mocked(fetchMenuById);

const mockMenu = {
  id: 'menu-abc',
  name: 'Almuerzo',
  active: true,
  startTime: '12:00',
  endTime: '15:00',
  daysOfWeek: 'MON,FRI',
  itemsCount: 2,
  items: [
    {
      id: 'item-1',
      productId: 'prod-1',
      sectionName: 'Carnes',
      order: 1,
      product: { name: 'Lomo', price: 50, category: { name: 'Platos' } },
    },
    {
      id: 'item-2',
      productId: 'prod-2',
      sectionName: 'Carnes',
      order: 2,
      product: { name: 'Pollo', price: 35, category: { name: 'Platos' } },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders menu name from API', async () => {
  mockFetchMenu.mockResolvedValue(mockMenu);
  render(<MenuDetailIsland />);
  await waitFor(() => expect(screen.getByText('Almuerzo')).toBeInTheDocument());
});

test('renders section header', async () => {
  mockFetchMenu.mockResolvedValue(mockMenu);
  render(<MenuDetailIsland />);
  await waitFor(() => expect(screen.getByText('Carnes')).toBeInTheDocument());
});

test('renders product names in section', async () => {
  mockFetchMenu.mockResolvedValue(mockMenu);
  render(<MenuDetailIsland />);
  await waitFor(() => {
    expect(screen.getByText('Lomo')).toBeInTheDocument();
    expect(screen.getByText('Pollo')).toBeInTheDocument();
  });
});

test('shows loading state initially', () => {
  mockFetchMenu.mockReturnValue(new Promise(() => {}));
  render(<MenuDetailIsland />);
  expect(screen.getByText(/Cargando/i)).toBeInTheDocument();
});

test('shows error when menu not found', async () => {
  mockFetchMenu.mockRejectedValue(new Error('HTTP 404'));
  render(<MenuDetailIsland />);
  await waitFor(() =>
    expect(screen.getByText(/Error al cargar el menú/i)).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test MenuDetailIsland
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MenuDetailIsland**

Create `apps/ui/src/components/dash/menus/MenuDetailIsland.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../commons/Providers';
import Button from '../../commons/Button';
import MenuItemsSection from './MenuItemsSection';
import ProductPickerModal from './ProductPickerModal';
import { fetchMenuById, MENUS_QUERY_KEY } from '../../../lib/menus-api';
import type { MenuItem } from '../../../lib/menus-api';

const DAY_LABELS: Record<string, string> = {
  MON: 'Lun', TUE: 'Mar', WED: 'Mié', THU: 'Jue', FRI: 'Vie', SAT: 'Sáb', SUN: 'Dom',
};

function groupBySection(items: MenuItem[]): Record<string, MenuItem[]> {
  return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const key = item.sectionName ?? 'Sin sección';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function MenuDetailContent() {
  const menuId = new URLSearchParams(window.location.search).get('id') ?? '';
  const qc = useQueryClient();

  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionNameInput, setSectionNameInput] = useState('');
  const [pickerSection, setPickerSection] = useState<string | null>(null);

  const { data: menu, isLoading, isError } = useQuery({
    queryKey: [MENUS_QUERY_KEY, menuId],
    queryFn: () => fetchMenuById(menuId),
    enabled: !!menuId,
  });

  const handleRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: [MENUS_QUERY_KEY, menuId] });
  }, [qc, menuId]);

  const handleSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sectionNameInput.trim();
    if (!name) return;
    setShowSectionForm(false);
    setSectionNameInput('');
    setPickerSection(name);
  };

  const handlePickerConfirm = () => {
    setPickerSection(null);
    handleRefresh();
  };

  if (!menuId) {
    return <p className="text-red-600">ID de menú no especificado.</p>;
  }

  if (isLoading) {
    return <p className="text-slate-400 py-8">Cargando...</p>;
  }

  if (isError || !menu) {
    return <p className="text-red-600">Error al cargar el menú. Verifica el ID.</p>;
  }

  const scheduleParts: string[] = [];
  if (menu.startTime || menu.endTime) {
    scheduleParts.push(`${menu.startTime ?? '?'} - ${menu.endTime ?? '?'}`);
  }
  if (menu.daysOfWeek) {
    scheduleParts.push(
      menu.daysOfWeek.split(',').map(d => DAY_LABELS[d] ?? d).join(', '),
    );
  }

  const sections = groupBySection(menu.items);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <a href="/dash/menus" className="text-sm text-indigo-600 hover:text-indigo-800">
            &larr; Volver a menús
          </a>
          <h2 className="text-2xl font-bold text-slate-800 mt-1">{menu.name}</h2>
          {scheduleParts.length > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">{scheduleParts.join(' | ')}</p>
          )}
          <span
            className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
              menu.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {menu.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        {!showSectionForm && !pickerSection && (
          <Button onClick={() => setShowSectionForm(true)}>+ Nueva sección</Button>
        )}
      </div>

      {showSectionForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Nueva sección</h3>
          <form onSubmit={handleSectionSubmit} className="flex gap-4 items-end">
            <div className="flex-1">
              <label
                htmlFor="md-section-name"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Nombre de la sección *
              </label>
              <input
                id="md-section-name"
                type="text"
                value={sectionNameInput}
                onChange={e => setSectionNameInput(e.target.value)}
                placeholder="Ej: Carnes, Entradas, Bebidas"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <Button type="submit">Crear y agregar productos</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowSectionForm(false); setSectionNameInput(''); }}
            >
              Cancelar
            </Button>
          </form>
        </div>
      )}

      {pickerSection && (
        <ProductPickerModal
          menuId={menuId}
          sectionName={pickerSection}
          onConfirm={handlePickerConfirm}
          onCancel={() => setPickerSection(null)}
        />
      )}

      {menu.items.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
          No hay secciones aún. Crea una con el botón de arriba.
        </div>
      )}

      {Object.entries(sections).map(([sectionName, items]) => (
        <MenuItemsSection
          key={sectionName}
          menuId={menuId}
          sectionName={sectionName}
          items={items}
          onAddProducts={() => setPickerSection(sectionName)}
          onRefresh={handleRefresh}
        />
      ))}
    </div>
  );
}

export default function MenuDetailIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <MenuDetailContent />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test MenuDetailIsland
```
Expected: all PASS.

- [ ] **Step 5: Replace detail.astro with thin shell**

Replace the full content of `apps/ui/src/pages/dash/menus/detail.astro`:

```astro
---
export const prerender = true;
import DashboardLayout from '../../../layouts/DashboardLayout.astro';
import MenuDetailIsland from '../../../components/dash/menus/MenuDetailIsland';
---

<DashboardLayout>
  <MenuDetailIsland client:load />
</DashboardLayout>
```

- [ ] **Step 6: Commit**

```bash
cd apps/ui
git add src/components/dash/menus/MenuDetailIsland.tsx \
        src/components/dash/menus/MenuDetailIsland.test.tsx \
        src/pages/dash/menus/detail.astro
git commit -m "feat(ui): migrate menus/detail.astro to MenuDetailIsland React island"
```

---

## Final Verification

- [ ] **Run all UI tests**

From `apps/ui/`:
```bash
pnpm test
```
Expected: all tests PASS including `IconButton`, `MenuForm`, `MenusIsland`, `MenuDetailIsland`.

- [ ] **Run all api-core e2e tests**

From `apps/api-core/`:
```bash
pnpm test:e2e --testPathPattern=menus
```
Expected: all menus e2e tests PASS.

- [ ] **Build the UI to verify no TypeScript errors**

From `apps/ui/`:
```bash
pnpm build
```
Expected: build succeeds with no errors.
