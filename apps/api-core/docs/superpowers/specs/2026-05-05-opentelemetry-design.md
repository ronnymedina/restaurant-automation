# OpenTelemetry — Distributed Tracing Design

**Date:** 2026-05-05
**Scope:** api-core (NestJS 11 + Prisma 7)
**Goal:** Trazas end-to-end de requests HTTP → NestJS → Prisma → DB, visibles en Jaeger local y exportables a Grafana Cloud en producción.

---

## Contexto y motivación

El sistema actualmente tiene `pg_stat_statements` para ver queries lentas en Postgres, pero sin contexto de origen: no se sabe si una query costosa vino del endpoint de kiosk, de productos, o de auth. OpenTelemetry resuelve esto generando un "waterfall" de spans por cada request, donde cada span Prisma está anidado bajo el span HTTP que lo originó.

---

## Alcance

**Incluye:**
- Trazas de requests HTTP entrantes (Express/NestJS)
- Spans de queries Prisma (SQL + duración)
- Jaeger como backend local (docker-compose separado)
- Variables de entorno para migración a Grafana Cloud en producción

**Excluye:**
- Eventos WebSocket / SSE
- Llamadas externas (Gemini API, Resend, Cloudflare R2)
- Métricas (solo trazas)
- Logs estructurados correlacionados con trazas

---

## Arquitectura

```
HTTP Request
  └── span: GET /v1/kiosk/:slug/menus     ← Express auto-instrumentation
        └── span: prisma:query SELECT      ← @prisma/instrumentation
        └── span: prisma:query SELECT      ← @prisma/instrumentation
  └── OTLP HTTP (port 4318)
        ├── Local:      Jaeger (docker-compose.otel.yml)
        └── Producción: Grafana Cloud (cambio de env var)
```

El SDK **debe inicializarse antes de cualquier import de NestJS** — requisito del monkey-patching de Node.js. Se logra con un archivo `src/instrumentation.ts` importado en la primera línea de `main.ts`.

---

## Paquetes a instalar

```
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node
@opentelemetry/exporter-trace-otlp-http
@prisma/instrumentation
```

No se usa `nestjs-otel` ni ninguna abstracción adicional — solo el SDK estándar de OpenTelemetry.

---

## Archivos afectados / nuevos

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| Crear | `src/instrumentation.ts` | Bootstrap del SDK OTel |
| Modificar | `src/main.ts` | Agregar `import './instrumentation'` como primera línea |
| Crear | `docker-compose.otel.yml` | Jaeger all-in-one para uso local |
| Modificar | `apps/api-core/.env` | Variables `OTEL_*` |
| Modificar | `apps/api-core/.env.example` | Documentar variables OTel |

---

## instrumentation.ts — diseño

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'api-core',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // demasiado ruidoso
    }),
    new PrismaInstrumentation(),
  ],
});

sdk.start();
```

---

## docker-compose.otel.yml

Jaeger `all-in-one` expone:
- **Puerto 16686** — UI web para ver trazas
- **Puerto 4318** — OTLP HTTP receiver (donde el SDK envía las trazas)

Stack separado del principal: se levanta solo cuando se quiere trazar. No afecta el flujo de desarrollo normal.

---

## Variables de entorno

| Variable | Local | Producción (Grafana Cloud) |
|----------|-------|---------------------------|
| `OTEL_SERVICE_NAME` | `api-core` | `api-core` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | URL de Grafana Cloud |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | `Authorization=Basic <token>` |

Migrar a producción = cambiar las dos últimas variables. El código no cambia.

---

## Comportamiento esperado post-implementación

1. Levantar `docker compose -f docker-compose.otel.yml up -d`
2. Levantar el stack principal `docker compose up -d`
3. Hacer cualquier request al API
4. Abrir `http://localhost:16686` → buscar servicio `api-core`
5. Ver trazas con spans anidados: HTTP request → queries Prisma con SQL y duración

Cada span de Prisma muestra:
- La query SQL completa
- La duración en ms
- El endpoint HTTP que la originó (span padre)

---

## Consideración Prisma 7 + WASM

Prisma 7 usa WASM engine con driver adapters (`PrismaPg`). `@prisma/instrumentation` funciona a nivel del cliente Prisma (no del query engine), por lo que el WASM no lo afecta. No se requieren cambios en `PrismaService`.

---

## Migración a producción (Grafana Cloud)

1. Crear cuenta en Grafana Cloud (free tier: 50GB trazas/mes)
2. Crear stack → ir a "OpenTelemetry" → obtener endpoint y token
3. Setear en Railway:
   - `OTEL_EXPORTER_OTLP_ENDPOINT=https://<stack>.grafana.net/otlp/v1/traces`
   - `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-token>`
4. Listo — las trazas de producción aparecen en Grafana Cloud Traces (Tempo)
