# OpenTelemetry Distributed Tracing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar OpenTelemetry en api-core (NestJS 11 + Prisma 7) para tener trazas end-to-end HTTP → Prisma → DB visibles en Jaeger local y exportables a Grafana Cloud en producción.

**Architecture:** Un archivo `src/instrumentation.ts` inicializa el SDK antes de que NestJS cargue. Auto-instrumentación detecta spans HTTP (Express) y queries Prisma automáticamente. Jaeger corre en `docker-compose.otel.yml` separado — no afecta el stack principal.

**Tech Stack:** `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@prisma/instrumentation`, Jaeger `all-in-one`

---

## File Map

| Acción | Archivo | Responsabilidad |
|--------|---------|----------------|
| Crear | `docker-compose.otel.yml` | Jaeger all-in-one para desarrollo local |
| Crear | `apps/api-core/src/instrumentation.ts` | Bootstrap del SDK OTel — debe importarse antes que NestJS |
| Modificar | `apps/api-core/src/main.ts` | Agregar imports de dotenv e instrumentation antes de NestJS |
| Modificar | `apps/api-core/.env` | Variables OTEL_* para el contenedor Docker |
| Modificar | `apps/api-core/.env.example` | Documentar variables OTel con comentarios |

---

## Task 1: Levantar Jaeger con docker-compose.otel.yml

**Files:**
- Create: `docker-compose.otel.yml` (raíz del repo)

- [ ] **Step 1: Crear docker-compose.otel.yml**

```yaml
services:
  jaeger:
    container_name: jaeger
    image: jaegertracing/all-in-one:latest
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
    ports:
      - "16686:16686"   # Jaeger UI
      - "4318:4318"     # OTLP HTTP receiver
    volumes:
      - jaeger_data:/badger

volumes:
  jaeger_data:
```

- [ ] **Step 2: Levantar Jaeger y verificar que responde**

```bash
docker compose -f docker-compose.otel.yml up -d
sleep 3
curl -s http://localhost:16686/api/services
```

Resultado esperado:
```json
{"data":[],"total":0,"limit":0,"offset":0,"errors":null}
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.otel.yml
git commit -m "chore: add Jaeger docker-compose for local OTel tracing"
```

---

## Task 2: Instalar paquetes OpenTelemetry

**Files:**
- Modify: `apps/api-core/package.json` (via pnpm)

- [ ] **Step 1: Instalar dependencias**

```bash
cd apps/api-core
pnpm add @opentelemetry/sdk-node \
         @opentelemetry/auto-instrumentations-node \
         @opentelemetry/exporter-trace-otlp-http \
         @prisma/instrumentation
```

- [ ] **Step 2: Verificar que se instalaron sin conflictos**

```bash
cd apps/api-core && pnpm tsc --noEmit 2>&1 | head -20
```

Resultado esperado: sin errores de tipos (puede haber warnings de otros módulos preexistentes, ignorar).

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/package.json apps/api-core/pnpm-lock.yaml
git commit -m "chore: install OpenTelemetry SDK packages"
```

---

## Task 3: Crear src/instrumentation.ts

**Files:**
- Create: `apps/api-core/src/instrumentation.ts`

Este archivo inicializa el SDK. Debe ser importado **antes** de NestJS para que el monkey-patching de Express funcione.

`includeDbStatements: true` en `PrismaInstrumentation` hace que los spans incluyan el SQL completo — sin esta opción las trazas no muestran las queries.

`@opentelemetry/instrumentation-fs` se deshabilita porque genera miles de spans de filesystem que no aportan valor.

- [ ] **Step 1: Crear el archivo**

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'api-core',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
    new PrismaInstrumentation({ includeDbStatements: true }),
  ],
});

sdk.start();
```

- [ ] **Step 2: Verificar que compila sin errores**

```bash
cd apps/api-core && pnpm tsc --noEmit 2>&1 | grep -i "instrumentation"
```

Resultado esperado: sin output (no hay errores en ese archivo).

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/instrumentation.ts
git commit -m "feat: add OpenTelemetry SDK bootstrap (instrumentation.ts)"
```

---

## Task 4: Modificar main.ts para cargar instrumentación primero

**Files:**
- Modify: `apps/api-core/src/main.ts`

El orden de imports es crítico:
1. `dotenv/config` — carga las variables de entorno (incluye `OTEL_*`)
2. `./instrumentation` — inicializa OTel (lee las variables)
3. `@nestjs/core` y resto — ahora Express ya está parcheado por OTel

- [ ] **Step 1: Reemplazar las primeras líneas de main.ts**

Archivo actual empieza con:
```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
```

Reemplazar por:
```ts
import 'dotenv/config';
import './instrumentation';
import { NestFactory } from '@nestjs/core';
```

El resto del archivo no cambia.

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd apps/api-core && pnpm tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/src/main.ts
git commit -m "feat: wire OpenTelemetry instrumentation into NestJS bootstrap"
```

---

## Task 5: Agregar variables de entorno

**Files:**
- Modify: `apps/api-core/.env`
- Modify: `apps/api-core/.env.example`

Dentro del contenedor Docker, `localhost:4318` no alcanza a Jaeger (que corre en otro docker-compose). Se usa `host.docker.internal` que en macOS apunta al host.

- [ ] **Step 1: Agregar variables a .env**

Al final del archivo `.env` agregar:

```bash
# OpenTelemetry
OTEL_SERVICE_NAME=api-core
OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318/v1/traces
```

- [ ] **Step 2: Agregar variables documentadas a .env.example**

Al final del archivo `.env.example` agregar:

```bash
# OpenTelemetry — distributed tracing
# Local (Jaeger via docker-compose.otel.yml):
OTEL_SERVICE_NAME=api-core
OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318/v1/traces
# Producción (Grafana Cloud):
# OTEL_EXPORTER_OTLP_ENDPOINT=https://<stack>.grafana.net/otlp/v1/traces
# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-token>
```

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/.env.example
git commit -m "chore: add OTEL environment variables"
```

---

## Task 6: Verificar end-to-end

- [ ] **Step 1: Recrear el contenedor api-core para que tome las nuevas variables**

```bash
docker compose up -d --force-recreate res-api-core
sleep 8
curl -s http://localhost:3000/health
```

Resultado esperado: `{"status":"ok"}`

- [ ] **Step 2: Hacer requests al API para generar trazas**

```bash
# Generar trazas en varios endpoints
curl -s http://localhost:3000/health
curl -s "http://localhost:3000/v1/kiosk/demo-restaurant/menus"
curl -s -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"12345678"}'
```

- [ ] **Step 3: Verificar que el servicio aparece en Jaeger**

```bash
sleep 3
curl -s http://localhost:16686/api/services | python3 -m json.tool
```

Resultado esperado:
```json
{
  "data": ["api-core"],
  ...
}
```

- [ ] **Step 4: Verificar que hay trazas con spans de Prisma**

```bash
curl -s "http://localhost:16686/api/traces?service=api-core&limit=1" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
trace = data['data'][0]
spans = trace['spans']
print(f'Spans en la traza: {len(spans)}')
for s in spans:
    print(f'  - {s[\"operationName\"]} ({s[\"duration\"]}µs)')
"
```

Resultado esperado: output mostrando spans con operationNames como `HTTP GET`, `prisma:query`, etc:
```
Spans en la traza: 4
  - HTTP GET /v1/kiosk/:slug/menus (45123µs)
  - prisma:query (12400µs)
  - prisma:query (8200µs)
  - prisma:query (3100µs)
```

- [ ] **Step 5: Abrir Jaeger UI y confirmar visualmente**

Abrir `http://localhost:16686`, seleccionar servicio `api-core`, clic en **Find Traces**.

Verificar que:
- Los spans de Prisma están anidados bajo el span HTTP padre
- Cada span de Prisma tiene el atributo `db.statement` con el SQL completo
- La duración de cada span es visible en el waterfall

- [ ] **Step 6: Commit final**

```bash
git add apps/api-core/.env
git commit -m "feat: complete OpenTelemetry integration — traces visible in Jaeger"
```

---

## Resultado final

Con la implementación completa:

```
Jaeger UI: http://localhost:16686
  └── Servicio: api-core
        └── Traza: GET /v1/kiosk/demo-restaurant/menus
              ├── span: HTTP GET /v1/kiosk/:slug/menus   45ms
              │     ├── span: prisma:query SELECT        12ms  ← db.statement = "SELECT ..."
              │     ├── span: prisma:query SELECT         8ms  ← db.statement = "SELECT ..."
              │     └── span: prisma:query SELECT         3ms  ← db.statement = "SELECT ..."
              └── Traza: POST /v1/auth/login
                    ├── span: HTTP POST /v1/auth/login   180ms
                    └── span: prisma:query SELECT          5ms  ← login query
```

## Migración a producción (cuando se decida)

1. Crear cuenta en Grafana Cloud (free tier 50GB/mes)
2. Stack → Connections → OpenTelemetry → obtener endpoint y token
3. En Railway agregar variables:
   - `OTEL_SERVICE_NAME=api-core`
   - `OTEL_EXPORTER_OTLP_ENDPOINT=https://<stack>.grafana.net/otlp/v1/traces`
   - `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-token>`
4. El código no cambia — solo variables de entorno
