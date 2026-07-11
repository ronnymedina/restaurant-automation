
### ProductCategory (product_categories)

### Respuesta serializada

Todos los endpoints que retornan una categoría usan `ProductCategorySerializer`:

```json
{ "id": "string", "name": "string", "isDefault": false }
```

Los campos `restaurantId`, `createdAt` y `updatedAt` **no se exponen**. El DELETE no retorna body.

### Endpoints

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/categories` | ADMIN, MANAGER, BASIC | `PaginatedProductCategoriesSerializer` | Lista paginada |
| `POST` | `/v1/categories` | ADMIN, MANAGER | `ProductCategorySerializer` | Crear categoría |
| `GET` | `/v1/categories/:id/check-delete` | ADMIN, MANAGER | `CheckDeleteCategoryResponseDto` | Verificar impacto antes de eliminar |
| `PATCH` | `/v1/categories/:id` | ADMIN, MANAGER | `ProductCategorySerializer` | Actualizar nombre |
| `DELETE` | `/v1/categories/:id` | ADMIN, MANAGER | `204 No Content` | Eliminar |

---

#### List — `GET /v1/categories`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC puede listar | 200 | Retorna `{ data, meta }` paginado |
| Solo devuelve categorías del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |
| Con `?page=1&limit=5` | 200 | Meta correcta |

---

#### Create — `POST /v1/categories`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta crear | 403 | Solo ADMIN o MANAGER |
| `name` vacío | 400 | `@IsNotEmpty()` en DTO |
| `name` mayor a 255 caracteres | 400 | `@MaxLength(255)` en DTO |
| ADMIN crea categoría válida | 201 | Retorna `ProductCategorySerializer`, emite `categoryCreated` |
| MANAGER crea categoría válida | 201 | Retorna `ProductCategorySerializer`, emite `categoryCreated` |
| Nombre duplicado en el mismo restaurante | 409 | `DUPLICATE_ENTITY` — constraint `@@unique([restaurantId, name])` en BD |
| Mismo nombre en diferente restaurante | 201 | Permitido — el índice único es compuesto |

---

#### Check Delete — `GET /v1/categories/:id/check-delete`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta chequear | 403 | Solo ADMIN o MANAGER |
| Categoría no existe | 404 | `ENTITY_NOT_FOUND` |
| Categoría de otro restaurante | 404 | Aislamiento — `findById(id, restaurantId)` retorna null |
| Categoría sin productos, no default | 200 | `{ productsCount: 0, isDefault: false, canDeleteDirectly: true }` |
| Categoría con productos | 200 | `{ productsCount: N, isDefault: false, canDeleteDirectly: false }` |
| Categoría default | 200 | `{ isDefault: true, canDeleteDirectly: false }` |

---

#### Update — `PATCH /v1/categories/:id`

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| Categoría no existe | 404 | `ENTITY_NOT_FOUND` |
| Categoría de otro restaurante | 404 | Aislamiento — no se encuentra |
| `isDefault: true` | 403 | `DEFAULT_CATEGORY_PROTECTED` — no se puede renombrar la default |
| `name` mayor a 255 caracteres | 400 | `@MaxLength(255)` en DTO |
| ADMIN actualiza | 200 | Retorna `ProductCategorySerializer`, emite `categoryUpdated` |
| MANAGER actualiza | 200 | Retorna `ProductCategorySerializer` |

---

#### Delete — `DELETE /v1/categories/:id`

Body: `{ reassignTo?: string }` (UUID opcional) — **sin body en respuesta**

E2E: ✅ `test/categories/categories.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta eliminar | 403 | Solo ADMIN o MANAGER |
| Categoría no existe | 404 | `ENTITY_NOT_FOUND` |
| Categoría de otro restaurante | 404 | Aislamiento — no se encuentra |
| `isDefault: true` | 403 | `DEFAULT_CATEGORY_PROTECTED` |
| `reassignTo` es la misma categoría | 400 | `VALIDATION_ERROR` — validado antes de cualquier query a BD |
| `reassignTo` no existe o es de otro restaurante | 404 | `ENTITY_NOT_FOUND` — validado antes de contar productos |
| Tiene productos y no viene `reassignTo` | 409 | `CATEGORY_HAS_PRODUCTS` con `details.productsCount` |
| Tiene productos y `reassignTo` válido | 204 | Reasigna productos y elimina en transacción atómica |
| Sin productos | 204 | Elimina directamente |

---

### Notas de implementación

- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `isDefault: true` se asigna al crear el restaurante; esa categoría no puede ser editada ni eliminada por API
- El índice `@@unique([restaurantId, name])` evita nombres duplicados dentro del mismo restaurante pero permite el mismo nombre en restaurantes distintos
- `createCategory` captura el error P2002 de Prisma y lo convierte a `DuplicateEntityException` (409)
- Orden de validaciones en `deleteCategory`: isDefault → reassignTo=id → target existe → countProducts → transacción
- `countByCategoryId` y `reassignCategory` pertenecen a `ProductRepository` (no al de categorías) y siempre filtran por `restaurantId`
- El delete con reassignment ocurre en una transacción Prisma (`$transaction`) — solo contiene el `updateMany` + `delete`
- PostgreSQL: `name` tiene `@db.VarChar(255)`; SQLite: solo `String` (sin anotaciones nativas)

### Serializers

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `ProductCategorySerializer` | `id`, `name`, `isDefault` | POST, PATCH |
| `PaginatedProductCategoriesSerializer` | `data: ProductCategorySerializer[]`, `meta` | GET list |
| `CheckDeleteCategoryResponseDto` | `productsCount`, `isDefault`, `canDeleteDirectly` | GET check-delete |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit (service) | `src/products/categories.service.spec.ts` | ✅ 19 tests |
| E2E | `test/categories/categories.e2e-spec.ts` | ✅ 38 tests |
