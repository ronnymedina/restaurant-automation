# Documentación de `apps/api-core`

Índice de todos los documentos de referencia de la API.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| [commands.md](commands.md) | Comandos CLI del proyecto (dev, test, prisma, CLI tool). |
| [database_schema.md](database_schema.md) | Esquema completo de la base de datos y relaciones entre modelos. |
| [environments.md](environments.md) | Variables de entorno requeridas y opcionales de `apps/api-core`. |
| [k6-metrics-guide.md](k6-metrics-guide.md) | Guía de métricas de stress testing con k6. |
| [module-doc-requirements.md](module-doc-requirements.md) | Convención y requerimientos para documentar módulos NestJS (archivos `.module.info.md`). |
| [money-conversion.md](money-conversion.md) | Conversión monetaria centavos ↔ pesos: `toCents`/`fromCents`, reglas y flujo completo. |
| [opentelemetry.md](opentelemetry.md) | Configuración e integración de OpenTelemetry para observabilidad. |
| [print-cloud.md](print-cloud.md) | Arquitectura de impresión remota en la nube. |
| [testing.md](testing.md) | Guía general de tests (unitarios, e2e, convenciones). |
| [testing.errors.md](testing.errors.md) | Errores comunes en tests y cómo resolverlos. |
| [testing.errors.query-perf.md](testing.errors.query-perf.md) | Errores de rendimiento de queries en contexto de tests. |

## Subcarpetas

| Carpeta | Descripción |
|---------|-------------|
| [adr/](adr/README.md) | Architecture Decision Records en formato MADR (0001–0006 + históricos). |
| [pending/](pending/) | Funcionalidades pendientes / ideas en evaluación. |
| [plans/](plans/) | Planes de implementación de features y refactors. |
| [superpowers/](superpowers/) | Specs y planes de trabajo generados para agentic development. |
