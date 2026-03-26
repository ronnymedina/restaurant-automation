# Fixes: Users, Products, Dummy Data & Cash Register Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 independent issues across the API and dashboard: remove email confirmation for user management, protect the last admin, fix the create-dummy CLI command, fix product form validation, allow removing a product image when editing, and display human-readable payment method labels in cash register history.

**Architecture:** All fixes are surgical — no new modules, no new abstractions. Backend fixes live in existing NestJS services/repositories/DTOs. Frontend fixes live in existing Astro pages. The biggest structural change is removing `PendingOperationsService` from `UsersController` (Issue 1) and adding last-admin guard logic to `UsersService` (Issue 2).

**Tech Stack:** NestJS + Prisma (API), Astro + Zod (Dashboard), nest-commander (CLI), TypeScript throughout.

---

## File Map

| File | Change |
|------|--------|
| `apps/api-core/src/events/events.gateway.ts` | Guard `this.server?.to(...)` — fixes CLI crash |
| `apps/api-core/src/users/users.module.ts` | Remove `PendingOperationsModule` import |
| `apps/api-core/src/users/users.controller.ts` | Replace pending-ops calls with direct service calls; remove confirm endpoint |
| `apps/api-core/src/users/user.repository.ts` | Add `countAdmins(restaurantId)` |
| `apps/api-core/src/users/users.service.ts` | Add last-admin guard in `deleteUser` and `updateUser` |
| `apps/api-core/src/users/exceptions/users.exceptions.ts` | Add `LastAdminException` |
| `apps/api-core/src/cli/commands/create-dummy.command.ts` | Add `--email` option, make fully idempotent per-resource |
| `apps/api-core/src/products/dto/create-product.dto.ts` | Add `@Min(0)` to stock |
| `apps/api-core/src/products/dto/update-product.dto.ts` | Override `imageUrl` to allow `null` |
| `apps/api-core/src/products/products.service.ts` | Handle `imageUrl: null` in update |
| `apps/ui-dashboard/src/pages/dash/products.astro` | Fix Zod `.issues`, auto-select category, image-remove UX |
| `apps/ui-dashboard/src/pages/dash/register-history.astro` | Add payment method label map |

---

## Task 1: Fix WebSocket server guard in CLI context

**Root cause of create-dummy crash:** `ProductEventsService.emitProductCreated` calls `EventsGateway.emitToKiosk`, which calls `this.server.to(...)`. In the CLI application, no HTTP/WebSocket server is bootstrapped so `this.server` is `undefined` → `TypeError: Cannot read properties of undefined (reading 'to')`.

**Files:**
- Modify: `apps/api-core/src/events/events.gateway.ts:82-93`

- [ ] **Step 1: Add optional chaining to the three emit methods**

Replace the three `emitTo*` methods in `EventsGateway`:

```typescript
emitToRestaurant(restaurantId: string, event: string, data: unknown) {
  this.server?.to(`restaurant:${restaurantId}`).emit(event, data);
}

emitToKiosk(restaurantId: string, event: string, data: unknown) {
  this.server?.to(`kiosk:${restaurantId}`).emit(event, data);
}

emitToKitchen(restaurantId: string, event: string, data: unknown) {
  this.server?.to(`kitchen:${restaurantId}`).emit(event, data);
}
```

- [ ] **Step 2: Verify the fix compiles**

```bash
cd apps/api-core && npx tsc --noEmit
```
Expected: no errors related to events.gateway.ts

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/events/events.gateway.ts
git commit -m "fix(events): guard WebSocket server emit in CLI context"
```

---

## Task 2: Remove email confirmation flow from user management

**Goal:** `POST /v1/users`, `PATCH /v1/users/:id` (role change), and `DELETE /v1/users/:id` must execute immediately without sending email or creating pending operations.

**Files:**
- Modify: `apps/api-core/src/users/users.controller.ts`
- Modify: `apps/api-core/src/users/users.module.ts`

- [ ] **Step 1: Rewrite `UsersController` — remove all `PendingOperationsService` usage**

Replace the entire file content:

```typescript
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { UsersService } from './users.service';
import {
  ActivateUserDto,
  ActivateUserResponseDto,
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  PaginatedUsersResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Users')
@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put('activate')
  @ApiOperation({ summary: 'Activar cuenta de usuario' })
  @ApiBody({ type: ActivateUserDto })
  @ApiResponse({ status: 200, type: ActivateUserResponseDto })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 409, description: 'La cuenta ya está activa' })
  async activate(@Body() body: ActivateUserDto): Promise<ActivateUserResponseDto> {
    const user = await this.usersService.activateUser(body.token, body.password);
    return { email: user.email };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear usuario (solo ADMIN)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos no válidos o rol no permitido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN puede crear usuarios' })
  @ApiResponse({ status: 409, description: 'El email ya existe' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.usersService.createUser(
      dto.email,
      dto.password,
      dto.role,
      user.restaurantId,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usuarios del restaurante' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, type: PaginatedUsersResponseDto })
  async findAll(
    @CurrentUser() user: { restaurantId: string },
    @Query() query: PaginationDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findByRestaurantIdPaginated(
      user.restaurantId,
      query.page,
      query.limit,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar usuario (solo ADMIN)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos no válidos' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, user.restaurantId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar usuario (solo ADMIN)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { restaurantId: string },
  ) {
    return this.usersService.deleteUser(id, user.restaurantId);
  }
}
```

Note: `Put` must be imported from `@nestjs/common` (it was already imported — keep it).

- [ ] **Step 2: Remove `PendingOperationsModule` from `UsersModule`**

`apps/api-core/src/users/users.module.ts` — remove the import:

```typescript
import { Module } from '@nestjs/common';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserRepository } from './user.repository';
import { ConfigModule } from '@nestjs/config';
import { userConfig } from './users.config';

@Module({
  imports: [ConfigModule.forFeature(userConfig)],
  controllers: [UsersController],
  providers: [UsersService, UserRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 3: Verify compilation**

```bash
cd apps/api-core && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/src/users/users.controller.ts \
        apps/api-core/src/users/users.module.ts
git commit -m "feat(users): remove email confirmation flow from user management"
```

---

## Task 3: Add last-admin protection

**Goal:** Prevent deleting or demoting the last admin of a restaurant. The check runs in `UsersService` — the single point that handles both direct calls and any future callers.

**Files:**
- Modify: `apps/api-core/src/users/user.repository.ts`
- Modify: `apps/api-core/src/users/users.service.ts`
- Modify: `apps/api-core/src/users/exceptions/users.exceptions.ts`

- [ ] **Step 1: Add `LastAdminException`**

Append to `apps/api-core/src/users/exceptions/users.exceptions.ts`:

```typescript
export class LastAdminException extends BaseException {
  constructor() {
    super(
      'Cannot remove or demote the last administrator of the restaurant',
      HttpStatus.BAD_REQUEST,
      'LAST_ADMIN',
    );
  }
}
```

- [ ] **Step 2: Add `countAdmins` to `UserRepository`**

Append to the `UserRepository` class in `apps/api-core/src/users/user.repository.ts`:

```typescript
async countAdmins(restaurantId: string): Promise<number> {
  return this.prisma.user.count({
    where: { restaurantId, role: Role.ADMIN, deletedAt: null },
  });
}
```

`Role` is already imported at the top of that file.

- [ ] **Step 3: Guard `deleteUser` and `updateUser` in `UsersService`**

Update the two methods in `apps/api-core/src/users/users.service.ts`:

Add import at the top alongside existing exception imports:
```typescript
import {
  EmailAlreadyExistsException,
  InvalidActivationTokenException,
  InvalidRoleException,
  LastAdminException,
  UserAlreadyActiveException,
} from './exceptions/users.exceptions';
```

Replace `updateUser`:
```typescript
async updateUser(
  id: string,
  restaurantId: string,
  data: { email?: string; role?: Role; isActive?: boolean },
): Promise<User> {
  const user = await this.findByIdAndVerifyOwnership(id, restaurantId);

  if (data.role === Role.ADMIN) {
    throw new InvalidRoleException(data.role);
  }

  // Demoting an admin — ensure at least one other admin remains
  if (data.role !== undefined && user.role === Role.ADMIN) {
    const adminCount = await this.userRepository.countAdmins(restaurantId);
    if (adminCount <= 1) {
      throw new LastAdminException();
    }
  }

  return this.userRepository.update(id, data);
}
```

Replace `deleteUser`:
```typescript
async deleteUser(id: string, restaurantId: string): Promise<User> {
  const user = await this.findByIdAndVerifyOwnership(id, restaurantId);

  if (user.role === Role.ADMIN) {
    const adminCount = await this.userRepository.countAdmins(restaurantId);
    if (adminCount <= 1) {
      throw new LastAdminException();
    }
  }

  return this.userRepository.delete(id);
}
```

- [ ] **Step 4: Verify compilation**

```bash
cd apps/api-core && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/users/exceptions/users.exceptions.ts \
        apps/api-core/src/users/user.repository.ts \
        apps/api-core/src/users/users.service.ts
git commit -m "feat(users): protect last admin from deletion or demotion"
```

---

## Task 4: Fix and improve `create-dummy` command

**Goal:** (a) The CLI crash is already fixed by Task 1. (b) Add `--email` option so different demo accounts can be created per run. (c) Make the command idempotent — check each resource (restaurant, user, products, menu) independently and only create what is missing.

**Files:**
- Modify: `apps/api-core/src/cli/commands/create-dummy.command.ts`

- [ ] **Step 1: Rewrite `create-dummy.command.ts`**

```typescript
import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';

import { RestaurantsService } from '../../restaurants/restaurants.service';
import { UsersService } from '../../users/users.service';
import { ProductsService } from '../../products/products.service';
import { MenusService } from '../../menus/menus.service';
import { MenuItemsService } from '../../menus/menu-items.service';

const DEFAULT_EMAIL = 'admin@demo.com';
const DUMMY_PASSWORD = '12345678';
const DUMMY_RESTAURANT_NAME = 'Demo Restaurant';

interface DummyOptions {
  email?: string;
}

@Command({
  name: 'create-dummy',
  description:
    'Create a demo restaurant with an admin user, sample products and a demo menu. ' +
    'Safe to re-run — skips any resource that already exists.',
})
export class CreateDummyCommand extends CommandRunner {
  private readonly logger = new Logger(CreateDummyCommand.name);

  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly menusService: MenusService,
    private readonly menuItemsService: MenuItemsService,
  ) {
    super();
  }

  @Option({
    flags: '-e, --email [email]',
    description: `Admin email for the dummy account (default: ${DEFAULT_EMAIL})`,
  })
  parseEmail(val: string): string {
    return val;
  }

  async run(_passedParams: string[], options: DummyOptions = {}): Promise<void> {
    const adminEmail = options.email ?? DEFAULT_EMAIL;

    try {
      // ── 1. Restaurant ───────────────────────────────────────────────
      let restaurantId: string;
      let restaurantSlug: string;

      const existingUser = await this.usersService.findByEmail(adminEmail);
      if (existingUser?.restaurantId) {
        const restaurant = await this.restaurantsService.findById(existingUser.restaurantId);
        restaurantId = existingUser.restaurantId;
        restaurantSlug = restaurant?.slug ?? 'unknown';
        this.logger.log(`Restaurant already exists: ${restaurant?.name} (${restaurantId})`);
      } else {
        const restaurant = await this.restaurantsService.createRestaurant(DUMMY_RESTAURANT_NAME);
        restaurantId = restaurant.id;
        restaurantSlug = restaurant.slug;
        this.logger.log(`Restaurant created: ${restaurant.name} (${restaurantId})`);

        // ── 2. Admin user ──────────────────────────────────────────────
        const user = await this.usersService.createAdminUser(adminEmail, DUMMY_PASSWORD, restaurantId);
        this.logger.log(`Admin user created: ${user.email} (${user.id})`);
      }

      // ── 3. Products (only if none exist for this restaurant) ─────────
      const existingProducts = await this.productsService.findByRestaurantId(restaurantId);
      let productIds: string[];

      if (existingProducts.length > 0) {
        this.logger.log(`Products already exist (${existingProducts.length}), skipping`);
        productIds = existingProducts.map((p) => p.id);
      } else {
        const category = await this.productsService.getOrCreateDefaultCategory(restaurantId);

        const demoProducts = [
          { name: 'Hamburguesa Clásica', description: 'Carne de res, lechuga, tomate y queso', price: 8.50 },
          { name: 'Pizza Margherita', description: 'Salsa de tomate, mozzarella y albahaca', price: 12.00 },
          { name: 'Ensalada César', description: 'Lechuga romana, crutones y aderezo César', price: 6.50 },
          { name: 'Limonada Natural', description: 'Limonada fresca con hielo', price: 2.50 },
          { name: 'Brownie de Chocolate', description: 'Brownie caliente con helado de vainilla', price: 4.00 },
        ];

        productIds = [];
        for (const p of demoProducts) {
          const product = await this.productsService.createProduct(
            restaurantId,
            { name: p.name, description: p.description, price: p.price },
            category.id,
          );
          productIds.push(product.id);
        }
        this.logger.log(`${productIds.length} demo products created`);
      }

      // ── 4. Menu (only if none exist for this restaurant) ─────────────
      const existingMenus = await this.menusService.findByRestaurantId(restaurantId);
      if (existingMenus.length > 0) {
        this.logger.log(`Menu already exists (${existingMenus.length}), skipping`);
      } else {
        const menu = await this.menusService.createMenu(restaurantId, {
          name: 'Carta General',
          active: true,
        });

        const sections = [
          { label: 'Principales', ids: productIds.slice(0, 2) },
          { label: 'Entradas',    ids: productIds.slice(2, 3) },
          { label: 'Bebidas',     ids: productIds.slice(3, 4) },
          { label: 'Postres',     ids: productIds.slice(4, 5) },
        ];

        for (const section of sections) {
          if (section.ids.length > 0) {
            await this.menuItemsService.bulkCreateItems(menu.id, section.ids, section.label);
          }
        }
        this.logger.log(`Demo menu "${menu.name}" created with ${sections.length} sections`);
      }

      this.logger.log('\n========== DUMMY DATA ==========');
      this.logger.log(`Restaurant: ${DUMMY_RESTAURANT_NAME}`);
      this.logger.log(`Slug:       ${restaurantSlug}`);
      this.logger.log(`Email:      ${adminEmail}`);
      this.logger.log(`Password:   ${DUMMY_PASSWORD}`);
      this.logger.log('================================\n');
    } catch (error) {
      this.logger.error(
        `Failed to create dummy data: ${error instanceof Error ? error.message : String(error)}`,
      );
      return process.exit(1);
    }
  }
}
```

- [ ] **Step 2: Check that `findByRestaurantId` and `findByRestaurantId` exist on the services**

`ProductsService.findByRestaurantId` — search in `products.service.ts`. If the method is named differently (e.g. `findAllByRestaurantId`), use the correct name.

`MenusService.findByRestaurantId` — similarly verify in `menus.service.ts`.

If either method does not exist, add it to the service (delegate to the repository method that already exists).

- [ ] **Step 3: Verify compilation**

```bash
cd apps/api-core && npx tsc --noEmit
```

- [ ] **Step 4: Test a clean run and a re-run**

```bash
# First run (should create everything)
npm run cli create-dummy

# Second run with same email (should skip everything, print info)
npm run cli create-dummy

# Run with custom email (should create a second set)
npm run cli create-dummy -- --email owner@test.com
```

Expected on first run: each step logs "created".
Expected on re-run: each step logs "already exists, skipping".
Expected with custom email: creates a second restaurant+user.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/cli/commands/create-dummy.command.ts
git commit -m "feat(cli): make create-dummy idempotent and add --email option"
```

---

## Task 5: Fix product form validation + stock=0 + auto-select category

**Problem A:** `result.error.errors` crashes in some Zod versions — use `result.error.issues` instead (canonical property).

**Problem B:** When creating a product without selecting a category, no validation message appears (due to crash A). With fix A applied, the message "Debes seleccionar una categoría" will show.

**Problem C:** Auto-select the first category when the "Nuevo producto" form opens so the user doesn't have to.

**Problem D (backend):** Add explicit `@Min(0)` to stock in `CreateProductDto` to document and enforce that 0 = "agotado" is valid.

**Files:**
- Modify: `apps/ui-dashboard/src/pages/dash/products.astro`
- Modify: `apps/api-core/src/products/dto/create-product.dto.ts`

- [ ] **Step 1: Fix `result.error.errors` → `result.error.issues` in products.astro**

In `apps/ui-dashboard/src/pages/dash/products.astro`, replace line 392:

```typescript
// Before
const messages = result.error.errors.map(e => e.message);

// After
const messages = result.error.issues.map((e) => e.message);
```

- [ ] **Step 2: Auto-select first category when opening "Nuevo producto" form**

In `loadCategories()` (around line 271), the categories are added to the select. Update the function to also auto-select the first option by default:

```typescript
async function loadCategories() {
  const res = await apiFetch('/v1/categories?limit=100');
  if (res.ok) {
    const { data } = await res.json();
    categorySelect.innerHTML = '<option value="" disabled>Selecciona una categoría</option>';
    data.forEach((cat: any) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
    // Pre-select first category when not editing
    if (data.length > 0 && !editingId) {
      categorySelect.value = data[0].id;
    }
  }
}
```

Also, in the "Nuevo producto" button click handler (around line 348), reset and auto-select:

```typescript
document.getElementById('newProductBtn')!.addEventListener('click', () => {
  editingId = null;
  formTitle.textContent = 'Nuevo producto';
  formEl.reset();
  clearImageSelection();
  productForm.classList.remove('hidden');
  // Re-apply default category selection after form.reset() clears it
  const firstOption = categorySelect.querySelector('option:not([disabled])') as HTMLOptionElement | null;
  if (firstOption) categorySelect.value = firstOption.value;
});
```

- [ ] **Step 3: Add `@Min(0)` to stock in `CreateProductDto`**

In `apps/api-core/src/products/dto/create-product.dto.ts`:

Add `Min` to imports:
```typescript
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsPositive,
  IsBoolean,
  IsUUID,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
```

Update the stock field:
```typescript
@ApiPropertyOptional({ example: 50, description: 'Stock global. null = ilimitado, 0 = agotado' })
@IsOptional()
@IsInt()
@Min(0, { message: 'El stock no puede ser negativo' })
stock?: number;
```

- [ ] **Step 4: Verify compilation**

```bash
cd apps/api-core && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/ui-dashboard/src/pages/dash/products.astro \
        apps/api-core/src/products/dto/create-product.dto.ts
git commit -m "fix(products): fix Zod error display, auto-select category, allow stock=0"
```

---

## Task 6: Allow removing a product image when editing

**Goal:** When editing a product that has an existing image, show it as a preview thumbnail with an "✕ Quitar" button (same UX as file upload preview). If the user removes it and doesn't upload a new one, send `imageUrl: null` to the PATCH endpoint so the image is cleared. The kiosk will then fall back to the default product image.

**Files:**
- Modify: `apps/ui-dashboard/src/pages/dash/products.astro`
- Modify: `apps/api-core/src/products/dto/update-product.dto.ts`
- Modify: `apps/api-core/src/products/products.service.ts` (update method)

### 6a — Backend: allow `imageUrl: null` in PATCH

- [ ] **Step 1: Override `imageUrl` in `UpdateProductDto` to accept `null`**

Replace `apps/api-core/src/products/dto/update-product.dto.ts`:

```typescript
import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    example: '/uploads/products/abc.jpg',
    nullable: true,
    description: 'URL de imagen. Enviar null para eliminar la imagen actual.',
  })
  @IsOptional()
  @ValidateIf((o) => o.imageUrl !== null)
  @IsString()
  @Matches(/^(https?:\/\/.+|\/.+)/, { message: 'imageUrl must be a URL address' })
  imageUrl?: string | null;
}
```

- [ ] **Step 2: Update `CreateProductData` interface to allow `null` for `imageUrl`**

In `apps/api-core/src/products/product.repository.ts`, change `imageUrl` in the `CreateProductData` interface:

```typescript
// Before:
imageUrl?: string;

// After:
imageUrl?: string | null;
```

This is required for TypeScript to accept `UpdateProductDto.imageUrl: string | null` when it flows through `ProductsService.updateProduct` → `ProductRepository.update(id, restaurantId, data)`.

The `prisma.product.update({ where: { id }, data })` call will correctly set the column to `NULL` in the database when `imageUrl: null` is present in `data`.

- [ ] **Step 3: Verify compilation**

```bash
cd apps/api-core && npx tsc --noEmit
```

### 6b — Frontend: current image preview with remove button

- [ ] **Step 4: Add HTML for the "current image" preview block**

In `apps/ui-dashboard/src/pages/dash/products.astro`, in the image section of the form (after the file drop zone and before the URL fallback, around line 74), add a new `div` for showing the current/existing image:

```html
<!-- Current image preview (shown in edit mode when product has an image) -->
<div id="currentImagePreview" class="hidden items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
  <img id="currentImageThumb" src="" alt="imagen actual" class="w-16 h-16 object-cover rounded" />
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-slate-800">Imagen actual</p>
    <p id="currentImageUrl" class="text-xs text-slate-500 mt-0.5 truncate"></p>
  </div>
  <button type="button" id="currentImageClearBtn"
    class="text-red-500 hover:text-red-700 text-xs font-medium bg-transparent border-none cursor-pointer shrink-0">
    ✕ Quitar
  </button>
</div>
```

- [ ] **Step 5: Add `imageRemoved` state and wire up the remove button in the script**

In the `<script>` section, after the existing variable declarations (around line 147), add:

```typescript
let imageRemoved = false;
const currentImagePreview = document.getElementById('currentImagePreview')!;
const currentImageThumb = document.getElementById('currentImageThumb') as HTMLImageElement;
const currentImageUrl = document.getElementById('currentImageUrl')!;
const currentImageClearBtn = document.getElementById('currentImageClearBtn')!;

currentImageClearBtn.addEventListener('click', () => {
  imageRemoved = true;
  currentImagePreview.classList.add('hidden');
  currentImagePreview.classList.remove('flex');
  imageDropZone.classList.remove('hidden');
  imageUrlFallback.classList.remove('hidden');
  (document.getElementById('productImageUrl') as HTMLInputElement).value = '';
});

function showCurrentImage(url: string) {
  imageRemoved = false;
  currentImageThumb.src = url;
  currentImageUrl.textContent = url;
  currentImagePreview.classList.remove('hidden');
  currentImagePreview.classList.add('flex');
  imageDropZone.classList.add('hidden');
  imageUrlFallback.classList.add('hidden');
}

function clearCurrentImage() {
  imageRemoved = false;
  currentImagePreview.classList.add('hidden');
  currentImagePreview.classList.remove('flex');
  imageDropZone.classList.remove('hidden');
}
```

- [ ] **Step 6: Call `showCurrentImage` when loading an existing product into the form**

In the edit button handler (around line 321), after `clearImageSelection()`:

```typescript
// Replace:
clearImageSelection();
(document.getElementById('productImageUrl') as HTMLInputElement).value = p.imageUrl || '';

// With:
clearImageSelection();
clearCurrentImage();
if (p.imageUrl) {
  showCurrentImage(p.imageUrl);
} else {
  (document.getElementById('productImageUrl') as HTMLInputElement).value = '';
}
```

- [ ] **Step 7: Reset `imageRemoved` on form cancel and new product**

In the cancel button handler and new product button handler, add `imageRemoved = false` and `clearCurrentImage()`.

- [ ] **Step 8: Use `imageRemoved` in form submission to send `null`**

Replace the `resolvedImageUrl` line in the submit handler (around line 375):

```typescript
// Before:
const resolvedImageUrl = uploadedImageUrl || imageUrl || undefined;

// After:
const resolvedImageUrl: string | null | undefined = imageRemoved
  ? null
  : (uploadedImageUrl || imageUrl || undefined);
```

Also update the Zod schema to allow `null` for `imageUrl`:

```typescript
// Before:
imageUrl: z.string().regex(/^(https?:\/\/.+|\/.+)/, 'La URL de imagen no es válida').optional(),

// After:
imageUrl: z.string().regex(/^(https?:\/\/.+|\/.+)/, 'La URL de imagen no es válida').nullable().optional(),
```

- [ ] **Step 9: Verify the page compiles and the Astro build passes**

```bash
cd apps/ui-dashboard && npx astro check
```
Expected: no type errors in products.astro

- [ ] **Step 10: Commit**

```bash
git add apps/ui-dashboard/src/pages/dash/products.astro \
        apps/api-core/src/products/dto/update-product.dto.ts
git commit -m "feat(products): allow removing product image in edit form"
```

---

## Task 7: Human-readable payment method labels in cash register history

**Goal:** Replace raw enum values (`CASH`, `CARD`, `DIGITAL_WALLET`) with Spanish labels in the payment breakdown section of the session detail modal.

**Files:**
- Modify: `apps/ui-dashboard/src/pages/dash/register-history.astro:130-136`

- [ ] **Step 1: Add label map and use it**

In `apps/ui-dashboard/src/pages/dash/register-history.astro`, before the `paymentRows` declaration (around line 130), add:

```typescript
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  DIGITAL_WALLET: 'Billetera digital',
};

const paymentRows = Object.entries(summary.paymentBreakdown as Record<string, { count: number; total: number }>)
  .map(([method, info]) => `
    <div class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span class="text-slate-600">${PAYMENT_LABELS[method] ?? method}</span>
      <span class="text-slate-800 font-medium">${info.count} pedidos &mdash; ${formatCurrency(info.total)}</span>
    </div>
  `).join('') || '<p class="text-slate-400 text-sm">Sin pedidos</p>';
```

The fallback `?? method` ensures unknown future payment methods still display (just with their raw key).

- [ ] **Step 2: Commit**

```bash
git add apps/ui-dashboard/src/pages/dash/register-history.astro
git commit -m "fix(cash-register): show human-readable payment method labels"
```

---

## Execution Order

Tasks are independent but the recommended order minimizes risk:

1. Task 1 (gateway guard) — unblocks all CLI work
2. Task 4 (create-dummy) — depends on Task 1 being complete
3. Task 2 (remove email flow) — standalone backend
4. Task 3 (last admin) — standalone backend
5. Task 5 (product validation) — standalone
6. Task 6 (image remove) — largest change, do last
7. Task 7 (payment labels) — trivial, can go anytime
