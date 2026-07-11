
### Menus (menus / menu_items)

### Respuesta serializada

Todos los endpoints que retornan un menú usan sus respectivos serializers:

```json
// MenuSerializer — POST, PATCH
{ "id": "string", "name": "string", "active": true, "startTime": "12:00", "endTime": "15:00", "daysOfWeek": "MON,TUE,WED,THU,FRI" }

// MenuListSerializer — GET list
{ "id": "string", "name": "string", "active": true, "startTime": null, "endTime": null, "daysOfWeek": null, "itemsCount": 5 }

// MenuWithItemsSerializer — GET :id
{ "id": "string", "name": "string", "active": true, "startTime": null, "endTime": null, "daysOfWeek": null, "items": [...] }

// MenuItemSerializer — POST/PATCH items
{ "id": "string", "sectionName": "Carnes", "order": 1, "product": { "id": "string", "name": "string", "price": 12.5, "imageUrl": null, "active": true } }
```

Los campos `restaurantId`, `createdAt`, `updatedAt`, `deletedAt`, `menuId`, `productId` **no se exponen**. El DELETE de menú e items no retorna body.

### Endpoints — Menus

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/menus` | ADMIN, MANAGER, BASIC | `MenuListSerializer[]` | Lista de menús activos (no eliminados) |
| `GET` | `/v1/menus/:id` | ADMIN, MANAGER, BASIC | `MenuWithItemsSerializer` | Menú con sus items |
| `POST` | `/v1/menus` | ADMIN, MANAGER | `MenuSerializer` | Crear menú |
| `PATCH` | `/v1/menus/:id` | ADMIN, MANAGER | `MenuSerializer` | Actualizar menú |
| `DELETE` | `/v1/menus/:id` | ADMIN, MANAGER | `204 No Content` | Soft delete |

### Endpoints — Menu Items

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `POST` | `/v1/menus/:menuId/items` | ADMIN, MANAGER | `MenuItemSerializer` | Agregar item al menú |
| `POST` | `/v1/menus/:menuId/items/bulk` | ADMIN, MANAGER | `{ created: number }` | Agregar múltiples items |
| `PATCH` | `/v1/menus/:menuId/items/:itemId` | ADMIN, MANAGER | `MenuItemSerializer` | Actualizar item |
| `DELETE` | `/v1/menus/:menuId/items/:itemId` | ADMIN, MANAGER | `204 No Content` | Eliminar item |

---

#### List — `GET /v1/menus`

E2E: ✅ `test/menus/list-menus.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede listar | 200 | Array de `MenuListSerializer` |
| MANAGER puede listar | 200 | Array de `MenuListSerializer` |
| BASIC puede listar | 200 | Array de `MenuListSerializer` |
| Solo devuelve menús del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |
| Menús con soft delete excluidos | 200 | Filtra `deletedAt: null` |
| `itemsCount` refleja cantidad real de items | 200 | Viene de `_count.items` |

---

#### Get — `GET /v1/menus/:id`

E2E: ✅ `test/menus/get-menu.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC puede obtener | 200 | Retorna `MenuWithItemsSerializer` |
| Menú no existe | 404 | `MENU_NOT_FOUND` |
| Menú de otro restaurante | 404 | Aislamiento — `findByIdWithItems(id, restaurantId)` retorna null |
| Menú con soft delete | 404 | `deletedAt` no nulo es excluido |
| Items ordenados por sección y order | 200 | `orderBy: [sectionName asc, order asc]` |
| Campos de item correctos | 200 | `id`, `sectionName`, `order`, `product` |
| Campos de producto embebido correctos | 200 | Solo `id`, `name`, `price` (decimal), `imageUrl`, `active` |

---

#### Create — `POST /v1/menus`

E2E: ✅ `test/menus/create-menu.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta crear | 403 | Solo ADMIN o MANAGER |
| `name` vacío | 400 | `@IsNotEmpty()` en DTO |
| `name` mayor a 100 caracteres | 400 | `@MaxLength(100)` en DTO |
| `startTime` con formato inválido | 400 | `@Matches(/^\d{2}:\d{2}$/)` |
| `daysOfWeek` con valores inválidos | 400 | `@Matches` solo acepta MON,TUE,WED,THU,FRI,SAT,SUN |
| ADMIN crea menú válido | 201 | Retorna `MenuSerializer`, emite `catalog:changed` |
| MANAGER crea menú válido | 201 | Retorna `MenuSerializer` |
| `active` por defecto es `true` | 201 | Default del modelo |
| Campos opcionales son `null` si no se proveen | 201 | `startTime`, `endTime`, `daysOfWeek` |

---

#### Update — `PATCH /v1/menus/:id`

E2E: ✅ `test/menus/update-menu.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| Menú no existe | 404 | `MENU_NOT_FOUND` |
| Menú de otro restaurante | 404 | Aislamiento |
| `name` mayor a 100 caracteres | 400 | `@MaxLength(100)` |
| `startTime` con formato inválido | 400 | `@Matches` en DTO |
| ADMIN actualiza | 200 | Retorna `MenuSerializer`, emite `catalog:changed` |
| MANAGER actualiza | 200 | Retorna `MenuSerializer` |

---

#### Delete — `DELETE /v1/menus/:id`

E2E: ✅ `test/menus/delete-menu.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta eliminar | 403 | Solo ADMIN o MANAGER |
| Menú no existe | 404 | `MENU_NOT_FOUND` |
| Menú de otro restaurante | 404 | Aislamiento |
| ADMIN elimina | 204 | Sin body — soft delete (`deletedAt = now()`) |
| MANAGER elimina | 204 | Sin body |
| Menú eliminado excluido del listado | 200 | Verificado con GET list |
| Menú eliminado retorna 404 en GET | 404 | Verificado con GET :id |
| Registro preservado en BD con `deletedAt` | — | Verificado directo en Prisma |

---

#### Create Item — `POST /v1/menus/:menuId/items`

E2E: ✅ `test/menus/create-menu-item.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta agregar | 403 | Solo ADMIN o MANAGER |
| Menú no existe | 404 | Verifica ownership antes de crear |
| Menú de otro restaurante | 404 | Aislamiento via `verifyOwnership` |
| `sectionName` vacío | 400 | `@IsNotEmpty()` cuando se provee |
| `productId` inválido (no UUID) | 400 | `@IsUUID()` en DTO |
| ADMIN agrega item | 201 | Retorna `MenuItemSerializer` |
| MANAGER agrega item | 201 | Retorna `MenuItemSerializer` |
| `order` auto-incrementa dentro de la sección | 201 | Basado en `getMaxOrder(menuId, sectionName)` |
| `sectionName` null cuando no se provee | 201 | Campo opcional |

---

#### Bulk Create Items — `POST /v1/menus/:menuId/items/bulk`

E2E: ✅ `test/menus/bulk-create-menu-items.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta crear | 403 | Solo ADMIN o MANAGER |
| Menú no existe | 404 | Verifica ownership |
| Menú de otro restaurante | 404 | Aislamiento |
| `sectionName` vacío | 400 | `@IsNotEmpty()` |
| `productIds` mayor a 50 elementos | 400 | `@ArrayMaxSize(50)` |
| Crea N items y retorna count | 201 | `{ created: N }` |
| Items se ordenan secuencialmente en la sección | 201 | Continuando desde el `maxOrder` existente |

---

#### Update Item — `PATCH /v1/menus/:menuId/items/:itemId`

E2E: ✅ `test/menus/update-menu-item.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| Menú no existe | 404 | Verifica ownership del menú |
| Menú de otro restaurante | 404 | Aislamiento |
| `sectionName` vacío | 400 | `@IsNotEmpty()` cuando se provee |
| ADMIN actualiza item | 200 | Retorna `MenuItemSerializer` |
| MANAGER actualiza item | 200 | Retorna `MenuItemSerializer` |

---

#### Delete Item — `DELETE /v1/menus/:menuId/items/:itemId`

E2E: ✅ `test/menus/delete-menu-item.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta eliminar | 403 | Solo ADMIN o MANAGER |
| Menú no existe | 404 | Verifica ownership del menú |
| Menú de otro restaurante | 404 | Aislamiento |
| ADMIN elimina item | 204 | Sin body — hard delete |
| MANAGER elimina item | 204 | Sin body |
| Item removido del menú tras eliminar | — | Verificado con GET :id |

---

### Notas de implementación

- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `Menu.deletedAt` implementa soft delete — el DELETE setea `deletedAt = now()`, no elimina el registro
- El campo `active` es independiente de `deletedAt`: un menú puede estar inactivo (`active: false`) sin estar eliminado
- `Menu.name` tiene `@MaxLength(100)` en DTO y `@db.VarChar(100)` en PostgreSQL
- `MenuItem.sectionName` es opcional pero no puede ser string vacío cuando se provee (`@IsNotEmpty()`)
- Múltiples items comparten el mismo `sectionName` para agruparse en una sección visual
- `order` auto-incrementa desde el `maxOrder` de la sección cuando no se provee explícitamente
- `verifyOwnership` en `MenuItemsController` verifica que el menú pertenece al restaurante antes de operar sobre items
- Los eventos `catalog:changed` se emiten al kiosk via WebSocket en create/update/delete de menús e items
- `findByIdWithItems` incluye `product` con `select` restringido a `id, name, price, imageUrl, active` (no expone datos internos del producto)
- El delete de MenuItem es hard delete (no soft delete) — los items no tienen historial

### Serializers

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `MenuSerializer` | `id`, `name`, `active`, `startTime`, `endTime`, `daysOfWeek` | POST, PATCH |
| `MenuListSerializer` | `id`, `name`, `active`, `startTime`, `endTime`, `daysOfWeek`, `itemsCount` | GET list |
| `MenuWithItemsSerializer` | `id`, `name`, `active`, `startTime`, `endTime`, `daysOfWeek`, `items[]` | GET :id |
| `MenuItemSerializer` | `id`, `sectionName`, `order`, `product` | POST/PATCH items |
| `MenuItemProductSerializer` | `id`, `name`, `price` (decimal), `imageUrl`, `active` | Embebido en MenuItemSerializer |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| E2E | `test/menus/list-menus.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/menus/get-menu.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/menus/create-menu.e2e-spec.ts` | ✅ 10 tests |
| E2E | `test/menus/update-menu.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/menus/delete-menu.e2e-spec.ts` | ✅ 9 tests |
| E2E | `test/menus/create-menu-item.e2e-spec.ts` | ✅ 11 tests |
| E2E | `test/menus/bulk-create-menu-items.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/menus/update-menu-item.e2e-spec.ts` | ✅ 8 tests |
| E2E | `test/menus/delete-menu-item.e2e-spec.ts` | ✅ 10 tests |
