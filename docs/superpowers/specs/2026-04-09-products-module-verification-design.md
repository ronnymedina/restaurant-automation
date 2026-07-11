# Spec: Verificación del Módulo de Productos

**Fecha:** 2026-04-09  
**Branch:** restaurante-verifications

---

## Contexto

Se está auditando cada módulo del proyecto para verificar que cumple con los estándares de autenticación, autorización, serialización, aislamiento por restaurante y cobertura de tests e2e. Este spec define los cambios necesarios para el módulo de productos (`apps/api-core/src/products/`).

---

## Estado actual

- **Controller**: Todos los endpoints existen (`GET /v1/products`, `GET /v1/products/:id`, `POST`, `PATCH`, `DELETE`). El `DELETE` retorna 200 con body — incorrecto.
- **Serializers**: `ProductSerializer`, `ProductListSerializer`, `PaginatedProductsSerializer` — implementados y correctos.
- **DTOs**: `CreateProductDto` y `UpdateProductDto` — transformación de precio a centavos ya implementada (`toCents()`), validaciones completas.
- **Tests e2e**: `listProducts.e2e-spec.ts` (bueno, enfocado en list) + `createProducts.e2e-spec.ts` (monolítico, cubre todos los endpoints — a eliminar).

---

## Cambios a realizar

### 1. Fix: DELETE → 204 No Content

El método `remove()` en `ProductsController` debe:
- Agregar `@HttpCode(HttpStatus.NO_CONTENT)` 
- No retornar body (llamar `deleteProduct` y no hacer return del serializer)

### 2. Helper compartido de tests e2e

Crear `test/products/products.helpers.ts` que exporte:
- `bootstrapApp(dbPath)` — levanta la app NestJS con una DB SQLite específica
- `seedRestaurant(prisma, suffix)` — crea restaurant + admin + manager + basic + categoría
- `login(app, email)` — autentica y devuelve el accessToken

Cada archivo e2e importa estos helpers y define su propio `TEST_DB` path.

### 3. Archivos e2e separados

Eliminar `test/products/createProducts.e2e-spec.ts` y reemplazar con 5 archivos:

#### `listProducts.e2e-spec.ts` (actualizar el existente)
Agregar test de 401 sin token (faltaba). Mantener el resto.

Casos:
| Caso | Status |
|---|---|
| Sin token | 401 |
| ADMIN puede listar | 200 |
| MANAGER puede listar | 200 |
| BASIC puede listar | 200 |
| Estructura `ProductListSerializer` (price como number, category.name, sin updatedAt/deletedAt) | 200 |
| Paginación `?page=1&limit=2` — meta correcta | 200 |
| Soft-deleted no aparece | 200 |
| Solo productos del propio restaurante | 200 |

#### `findOneProduct.e2e-spec.ts` (nuevo)
Casos:
| Caso | Status |
|---|---|
| Sin token | 401 |
| ADMIN puede obtener | 200 |
| MANAGER puede obtener | 200 |
| BASIC puede obtener | 200 |
| Estructura `ProductSerializer` (price como number, sin updatedAt/deletedAt, sin category) | 200 |
| Producto no existe | 404 |
| Producto de otro restaurante | 404 |

#### `createProduct.e2e-spec.ts` (nuevo)
Casos:
| Caso | Status |
|---|---|
| Sin token | 401 |
| BASIC intenta crear | 403 |
| ADMIN crea producto válido | 201 |
| MANAGER crea producto válido | 201 |
| Transformación centavos: price=1250 → serializado como 12.5 | 201 |
| Respuesta es `ProductSerializer` (campos exactos) | 201 |
| `name` vacío | 400 |
| `price` negativo | 400 |
| `price` decimal (no entero) | 400 |
| `stock` negativo | 400 |
| `stock` > 9999 | 400 |
| `description` > 500 chars | 400 |
| `sku` > 50 chars | 400 |
| `categoryId` de otro restaurante | 404 |
| `price` = 0 (producto gratis) | 201 |

#### `updateProduct.e2e-spec.ts` (nuevo)
Casos:
| Caso | Status |
|---|---|
| Sin token | 401 |
| BASIC intenta actualizar | 403 |
| ADMIN actualiza nombre | 200 |
| MANAGER actualiza precio | 200 |
| Respuesta es `ProductSerializer` (campos exactos) | 200 |
| Transformación centavos al actualizar precio | 200 |
| Producto no existe | 404 |
| Producto de otro restaurante | 404 |
| `categoryId` de otro restaurante | 404 |

#### `deleteProduct.e2e-spec.ts` (nuevo)
Casos:
| Caso | Status |
|---|---|
| Sin token | 401 |
| BASIC intenta eliminar | 403 |
| ADMIN elimina (soft delete) | 204 sin body |
| MANAGER elimina (soft delete) | 204 sin body |
| `deletedAt` seteado en BD | — |
| Producto no aparece en listado tras soft delete | — |
| `GET /:id` retorna 404 tras soft delete | — |
| Producto no existe | 404 |
| Producto de otro restaurante | 404 |

### 4. `product.module.info.md`

Crear `apps/api-core/src/products/product.module.info.md` documentando:
- Endpoints y roles permitidos
- Serializers utilizados por endpoint
- Serialized response shapes
- Notas de implementación (BigInt/centavos, soft delete, aislamiento)
- Referencia a los archivos de tests

---

## Serializers (referencia)

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `ProductSerializer` | `id`, `name`, `description`, `price` (number), `stock`, `sku`, `imageUrl`, `active`, `categoryId`, `restaurantId`, `createdAt` | GET :id, POST, PATCH |
| `ProductListSerializer` | Igual + `category: { name }` | GET list |
| `PaginatedProductsSerializer` | `data: ProductListSerializer[]`, `meta` | GET list |

---

## Notas de implementación

- `price` se recibe en **centavos enteros** (ej: 1250 = $12.50). El DTO transforma con `toCents()` → BigInt. El serializer convierte con `fromCents()` → number para la API.
- Soft delete: `deletedAt` se setea en BD. El producto desaparece de list y de `findById`. El `DELETE` retorna 204 sin body.
- Aislamiento: toda operación filtra por `restaurantId` del JWT. Un restaurante no puede ver ni modificar productos de otro.
- `categoryId` al crear/actualizar se valida que pertenezca al mismo restaurante.
