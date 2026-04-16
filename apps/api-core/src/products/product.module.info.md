
### Product (products)

### Respuesta serializada

**ProductSerializer** — usado en GET /:id, POST, PATCH:

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "price": 12.5,
  "stock": 50,
  "sku": "string | null",
  "imageUrl": "string | null",
  "active": true,
  "categoryId": "string",
  "restaurantId": "string",
  "createdAt": "ISO8601"
}
```

**ProductListSerializer** — usado en GET list (igual + `category`):

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "price": 12.5,
  "stock": 50,
  "sku": "string | null",
  "imageUrl": "string | null",
  "active": true,
  "categoryId": "string",
  "restaurantId": "string",
  "createdAt": "ISO8601",
  "category": { "name": "string" }
}
```

Los campos `updatedAt` y `deletedAt` **no se exponen**. El DELETE no retorna body.

### Endpoints

| Método | Ruta | Roles permitidos | Respuesta | Descripción |
|---|---|---|---|---|
| `GET` | `/v1/products` | ADMIN, MANAGER, BASIC | `PaginatedProductsSerializer` | Lista paginada |
| `GET` | `/v1/products/:id` | ADMIN, MANAGER, BASIC | `ProductSerializer` | Obtener por ID |
| `POST` | `/v1/products` | ADMIN, MANAGER | `ProductSerializer` | Crear producto |
| `PATCH` | `/v1/products/:id` | ADMIN, MANAGER | `ProductSerializer` | Actualizar producto |
| `DELETE` | `/v1/products/:id` | ADMIN, MANAGER | `204 No Content` | Soft delete |

---

#### List — `GET /v1/products`

E2E: ✅ `test/products/listProducts.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede listar | 200 | Retorna `{ data, meta }` paginado |
| MANAGER puede listar | 200 | Retorna `{ data, meta }` paginado |
| BASIC puede listar | 200 | Retorna `{ data, meta }` paginado |
| Estructura `ProductListSerializer` | 200 | price como number, category.name, sin updatedAt/deletedAt |
| Con `?page=1&limit=2` | 200 | Meta correcta |
| Soft-deleted no aparecen | 200 | Filtra `deletedAt = null` |
| Solo productos del propio restaurante | 200 | Aislamiento por `restaurantId` del JWT |

---

#### Find One — `GET /v1/products/:id`

E2E: ✅ `test/products/findOneProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| ADMIN puede obtener | 200 | Retorna `ProductSerializer` |
| MANAGER puede obtener | 200 | Retorna `ProductSerializer` |
| BASIC puede obtener | 200 | Retorna `ProductSerializer` |
| Estructura `ProductSerializer` | 200 | price como number, sin category, sin updatedAt/deletedAt |
| price serializado desde centavos | 200 | 1500 centavos → 15 |
| Producto no existe | 404 | `ENTITY_NOT_FOUND` |
| Producto de otro restaurante | 404 | Aislamiento — `findById(id, restaurantId)` retorna null |

---

#### Create — `POST /v1/products`

E2E: ✅ `test/products/createProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta crear | 403 | Solo ADMIN o MANAGER |
| ADMIN crea producto válido | 201 | Retorna `ProductSerializer` |
| MANAGER crea producto válido | 201 | Retorna `ProductSerializer` |
| Transformación centavos | 201 | price=1250 (request) → 12.5 (response) |
| `price` = 0 (producto gratis) | 201 | Permitido |
| `name` vacío | 400 | `@IsNotEmpty()` en DTO |
| `price` negativo | 400 | `@MinBigInt(0n)` en DTO |
| `price` decimal (no entero) | 400 | `@IsBigInt()` — `toCents()` rechaza floats |
| `stock` negativo | 400 | `@Min(0)` en DTO |
| `stock` > 9999 | 400 | `@Max(9999)` en DTO |
| `description` > 500 chars | 400 | `@MaxLength(500)` en DTO |
| `sku` > 50 chars | 400 | `@MaxLength(50)` en DTO |
| `categoryId` de otro restaurante | 404 | `ENTITY_NOT_FOUND` — validado antes de crear |

---

#### Update — `PATCH /v1/products/:id`

E2E: ✅ `test/products/updateProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta actualizar | 403 | Solo ADMIN o MANAGER |
| ADMIN actualiza nombre | 200 | Retorna `ProductSerializer` |
| MANAGER actualiza precio | 200 | Retorna `ProductSerializer` |
| Transformación centavos al actualizar precio | 200 | Mismo mecanismo que en create |
| Producto no existe | 404 | `ENTITY_NOT_FOUND` |
| Producto de otro restaurante | 404 | Aislamiento |
| `categoryId` de otro restaurante | 404 | `ENTITY_NOT_FOUND` |

---

#### Delete — `DELETE /v1/products/:id`

**Sin body en respuesta.**

E2E: ✅ `test/products/deleteProduct.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| BASIC intenta eliminar | 403 | Solo ADMIN o MANAGER |
| ADMIN elimina | 204 | Soft delete — setea `deletedAt` |
| MANAGER elimina | 204 | Soft delete — setea `deletedAt` |
| Soft-deleted no aparece en listado | — | Validado en test post-delete |
| Soft-deleted retorna 404 en GET /:id | — | Validado en test post-delete |
| Producto no existe | 404 | `ENTITY_NOT_FOUND` |
| Producto de otro restaurante | 404 | Aislamiento |

---

### Notas de implementación

- El `restaurantId` viene del JWT — toda operación está aislada por restaurante
- `price` se recibe en centavos enteros (ej: 1250 = $12.50). El DTO transforma con `toCents()` → `BigInt`. El serializer convierte con `fromCents()` → `number` para la API (JSON no soporta `BigInt` nativo)
- Soft delete: `deletedAt` se setea en la BD. El producto desaparece de `findAll` y de `findById`. El `DELETE` retorna 204 sin body
- `categoryId` al crear/actualizar se valida que pertenezca al mismo restaurante mediante `findCategoryAndThrowIfNotFound`
- El listado incluye `category: { name }` via `include` en el repositorio (`findByRestaurantIdPaginated` usa `include: { category: { select: { name: true } } }`)
- Orden de listado: `orderBy: { createdAt: 'desc' }` — producto más nuevo primero

### Serializers

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `ProductSerializer` | `id`, `name`, `description`, `price` (number), `stock`, `sku`, `imageUrl`, `active`, `categoryId`, `restaurantId`, `createdAt` | GET :id, POST, PATCH |
| `ProductListSerializer` | Igual que `ProductSerializer` + `category: { name }` | GET list |
| `PaginatedProductsSerializer` | `data: ProductListSerializer[]`, `meta` | GET list |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit (service) | `src/products/products.service.spec.ts` | ✅ |
| E2E | `test/products/listProducts.e2e-spec.ts` | ✅ 9 tests |
| E2E | `test/products/findOneProduct.e2e-spec.ts` | ✅ 9 tests |
| E2E | `test/products/createProduct.e2e-spec.ts` | ✅ 15 tests |
| E2E | `test/products/updateProduct.e2e-spec.ts` | ✅ 9 tests |
| E2E | `test/products/deleteProduct.e2e-spec.ts` | ✅ 9 tests |
