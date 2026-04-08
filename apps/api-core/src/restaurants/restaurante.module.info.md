
### Restaurante

### Test case

#### Rename — `PATCH /v1/restaurants/name`

E2E: `test/restaurants/rename.e2e-spec.ts`

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Unauthenticated |
| MANAGER intenta renombrar | 403 | Solo ADMIN puede |
| BASIC intenta renombrar | 403 | Solo ADMIN puede |
| Nombre vacío / sin campo `name` | 400 | DTO validation |
| Nombre menor a 3 caracteres | 400 | `@MinLength(3)` en DTO |
| Nombre mayor a 255 caracteres | 400 | `@MaxLength(255)` en DTO |
| ADMIN renombra su restaurante | 200 | Retorna `{ slug }` generado, actualiza `name` en BD |
| Admin de restaurante B no afecta restaurante A | 200 | Aislamiento por `restaurantId` del JWT |
| Nombre ya usado por otro restaurante | 409 | Lanza `DuplicateRestaurantException` (código `DUPLICATE_RESTAURANT`). La validación la hace el constraint `@unique` en BD — no hay búsqueda previa en el service |

#### Notas de implementación

- El DTO `RenameRestaurantDto` valida min/max longitud antes de llegar al service
- El service llama a `rename(id, name)` que delega al repo y captura el error `P2002` de Prisma convirtiéndolo en `DuplicateRestaurantException`
- El `restaurantId` viene del JWT (`CurrentUser`), por lo que un usuario nunca puede operar sobre un restaurante que no es el suyo
