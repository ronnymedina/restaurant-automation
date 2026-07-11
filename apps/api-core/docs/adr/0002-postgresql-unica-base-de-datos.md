# ADR 0002 — PostgreSQL como única base de datos

**Estado:** Aceptado
**Fecha:** 2026-06-13

## Contexto

Durante el diseño inicial se barajó un modelo híbrido: SQLite para instalaciones self-hosted
locales y PostgreSQL para el entorno cloud. La idea era usar un **provider dinámico de Prisma**
(`DATABASE_PROVIDER` env) que seleccionara el schema en tiempo de inicio.

El resultado fue una superficie de mantenimiento duplicada: dos schemas Prisma separados
(`schema.postgresql.prisma` y `schema.sqlite.prisma`), dos cadenas de migraciones que debían
mantenerse en sincronía, una capa de compatibilidad en `fromCents` para el driver SQLite
(que devuelve `number` en vez de `BigInt`) y una complejidad de prueba mayor.

La plataforma se lanzó como SaaS cloud-only; no hay instalaciones self-hosted activas.

## Decisión

La plataforma es **cloud-only SaaS sobre PostgreSQL** como único motor de base de datos.

- Schema canónico: `prisma/schema.postgresql.prisma`.
- El modelo híbrido SQLite/Postgres queda descartado.
- Se elimina el script selector de schema y la variable `DATABASE_PROVIDER`.
- Los montos `BigInt` se reciben nativamente del driver PostgreSQL, sin capa de compat.

## Consecuencias positivas

- Una sola cadena de migraciones sin bifurcaciones.
- `BigInt` nativo de PostgreSQL: la capa de compatibilidad `number | bigint` en `fromCents`
  desaparece; el tipo es siempre `bigint`.
- Superficie de prueba reducida: los tests solo corren contra un motor.
- Sin script de selección de schema ni variable de entorno adicional en el arranque.

## Consecuencias negativas

- Un eventual despliegue self-hosted con SQLite requeriría un nuevo ADR y la recuperación
  del schema SQLite desde el historial de git.
- Dependencia de un servicio PostgreSQL gestionado (Railway / managed Postgres) para todos
  los entornos, incluido el desarrollo local (mitigado con Docker Compose).

## Alternativas consideradas

- **Provider dinámico SQLite/Postgres** (rechazado): doble mantenimiento de schemas,
  migraciones y tests; el coste supera el beneficio cuando no hay clientes self-hosted.
- **LibSQL/Turso vía driverAdapters de Prisma** (descartado por innecesario hoy): sería
  candidato si en el futuro se retoma el producto de licencia desktop, momento en el que
  se registraría como un nuevo ADR.

## Referencias

- Supersede `docs/different-db-in-local-vs-cloud.md` (eliminado en esta pasada).
- Supersede `apps/api-core/docs/pending/dynamic-database-provider.md` (eliminado en esta pasada).
- Schema activo: `prisma/schema.postgresql.prisma`.
- Modelo monetario derivado: ADR 0003.
