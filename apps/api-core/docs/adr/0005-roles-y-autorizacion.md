# ADR 0005 — Roles y autorización

**Estado:** Aceptado
**Fecha:** 2026-06-13

## Contexto

El staff de un restaurante tiene niveles de acceso distintos: el dueño/administrador
configura todo, los encargados gestionan el día a día, y los empleados básicos solo
necesitan visibilidad operativa. Además, la plataforma es multi-tenant: cada usuario
pertenece a un único restaurante y no puede ver ni operar datos de otro.

## Decisión

Tres roles jerárquicos: **`ADMIN > MANAGER > BASIC`** (enum `Role` de Prisma).

- **`JwtAuthGuard`** es global: valida el access token en cookie `httpOnly` (ver ADR 0001)
  en todas las rutas salvo las marcadas con `@Public()`.
- **`RolesGuard`** aplica `@Roles(...)` a nivel de controlador o endpoint. **`ADMIN` bypassa
  todos los checks de rol** sin necesitar ser listado explícitamente.
- **`@Public()`** marca rutas sin autenticación (endpoints del kiosk y activación de cuenta).
- El `restaurantId` **siempre** sale del JWT — nunca de un parámetro del cliente. Esto
  garantiza el aislamiento multi-tenant en todos los endpoints.

### Matriz de permisos (derivada de `@Roles` en los controllers)

| Recurso / Acción | ADMIN | MANAGER | BASIC | Público (`@Public`) |
|---|:---:|:---:|:---:|:---:|
| **Productos** — listar, obtener | ✓ | ✓ | ✓ | — |
| **Productos** — crear, editar, eliminar | ✓ | ✓ | — | — |
| **Categorías** — listar | ✓ | ✓ | ✓ | — |
| **Categorías** — crear, editar, eliminar | ✓ | ✓ | — | — |
| **Menús** — listar, obtener, items | ✓ | ✓ | ✓ | — |
| **Menús** — crear, editar, eliminar; gestionar items | ✓ | ✓ | — | — |
| **Órdenes** — listar (turno activo), historial, obtener | ✓ | ✓ | ✓ | — |
| **Órdenes** — crear (dashboard/STAFF), cambiar estado, pagar, confirmar, cancelar, unpay | ✓ | ✓ | — | — |
| **Caja** — abrir, cerrar, historial, summary, top-products | ✓ | ✓ | — | — |
| **Caja** — stats (live), sesión actual | ✓ | ✓ | ✓ | — |
| **Settings del restaurante** — GET | ✓ | ✓ | ✓ | — |
| **Settings del restaurante** — PATCH | ✓ | — | — | — |
| **Usuarios** — listar | ✓ | ✓ | — | — |
| **Usuarios** — crear, editar, eliminar | ✓ | — | — | — |
| **Usuarios** — activar cuenta | — | — | — | ✓ |
| **Uploads** — subir, eliminar imágenes | ✓ | ✓ | — | — |
| **Print / recibos** | ✓ | ✓ | — | — |
| **Cocina** — token GET/generar (gestión admin) | ✓ | — | — | — |
| **Cocina** — listar órdenes, avanzar estado (KDS) | — | — | — | `X-Kitchen-Token` |
| **Kiosk** — catálogo, crear orden | — | — | — | ✓ |

> Nota: los endpoints de cocina (KDS) usan autenticación por `X-Kitchen-Token`
> (token de dispositivo por restaurante), no por JWT. El token lo genera solo `ADMIN`.

## Consecuencias positivas

- `BASIC` puede operar el día a día (ver órdenes, ver stats, ver catálogo y menús) sin
  poder modificar ni cobrar.
- El aislamiento multi-tenant no depende de ningún input del cliente; no hay forma de
  acceder a datos de otro restaurante escalando privilegios.
- `ADMIN` no necesita ser listado explícitamente en `@Roles`: el bypass en `RolesGuard`
  simplifica la declaración.

## Consecuencias negativas

- Los tres roles son jerárquicos y fijos; no hay permisos granulares por endpoint.
  Cualquier nueva necesidad de control fino requiere un nuevo rol o lógica adicional en
  el guard.
- `BASIC` no puede crear órdenes desde el dashboard: si se necesitara en el futuro,
  habría que elevar el rol del endpoint o agregar un rol intermedio.

## Alternativas consideradas

- **Permisos granulares por endpoint** (rechazado): aumentaría la complejidad de
  configuración y gestión sin un beneficio inmediato; la jerarquía de tres roles cubre
  los casos de uso actuales.
- **RBAC dinámico desde base de datos** (descartado para esta fase): overhead innecesario
  cuando los roles son estables y pocos.

## Referencias

- Guards y decoradores: `src/common/` (o `src/auth/guards/`, `src/auth/decorators/`).
- Gestión de usuarios: `src/users/`.
- Autenticación por cookie: ADR 0001.
