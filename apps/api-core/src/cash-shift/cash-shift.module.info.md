### CashShift (cash-shift)

Módulo de infraestructura para acceso a datos de turnos de caja (`CashShift`).

**Propósito:** Proveedor de `CashShiftRepository` — sin lógica de negocio. Extraído de `CashRegisterModule` para evitar dependencia circular con `OrdersModule`.

**Exporta:** `CashShiftRepository`

**Consumidores:**
- `CashRegisterModule` — abre, cierra y consulta turnos
- `OrdersModule` — resuelve el turno activo al listar órdenes (`listOrders`)
- `KioskModule` — verifica si hay caja abierta antes de crear una orden

**No importa ningún otro módulo** (solo `PrismaService` vía el módulo global de Prisma).
