# OpenTelemetry — Trazas distribuidas

`api-core` exporta trazas OpenTelemetry automáticamente. En local van a Jaeger; en producción a Grafana Cloud (o cualquier colector OTLP compatible).

---

## Desarrollo local

### 1. Levantar Jaeger

Jaeger corre en un `docker-compose` separado para no contaminar el stack principal:

```bash
docker compose -f docker-compose.otel.yml up -d
```

### 2. Levantar la API

Las variables `OTEL_*` ya están en `apps/api-core/.env`:

```bash
docker compose up -d --force-recreate res-api-core
```

### 3. Ver trazas

Abrí `http://localhost:16686`, seleccioná el servicio **api-core** y hacé clic en **Find Traces**.

```
Jaeger UI: http://localhost:16686
  └── Servicio: api-core
        └── POST /v1/auth/login  (180ms)
              ├── prisma:client:operation     (20ms)
              ├── prisma:client:db_query      (12ms)  ← SQL completo en db.statement
              └── pg.query:SELECT             (10ms)
```

Para parar Jaeger:

```bash
docker compose -f docker-compose.otel.yml down
```

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `OTEL_SERVICE_NAME` | `api-core` | Nombre del servicio en Jaeger / Grafana |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | URL del colector OTLP (incluir `/v1/traces`) |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Headers de autenticación (Grafana Cloud) |

> **Nota:** El `.env` de Docker usa `http://host.docker.internal:4318/v1/traces` en lugar de `localhost` porque el contenedor no puede alcanzar puertos del host vía `localhost`.

---

## Producción (Grafana Cloud)

1. Crear cuenta en [Grafana Cloud](https://grafana.com/auth/sign-up) (free tier: 50 GB/mes).
2. Ir a **Stack → Connections → OpenTelemetry** y copiar el endpoint y el token.
3. Agregar estas variables en Railway (o el proveedor que uses):

```
OTEL_SERVICE_NAME=api-core
OTEL_EXPORTER_OTLP_ENDPOINT=https://<stack>.grafana.net/otlp/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-token>
```

El código no cambia — solo las variables de entorno.

---

## Qué se captura automáticamente

| Span | Qué representa |
|---|---|
| `HTTP GET /v1/...` | Request HTTP entrante completo |
| `prisma:client:operation` | Operación Prisma (findMany, create, etc.) |
| `prisma:client:db_query` | Query SQL enviada a Postgres |
| `pg.query:SELECT` | Ejecución real en el pool de conexiones |
| `pg-pool.connect` | Adquisición de conexión del pool |
| `AuthController.login` | Método del controlador NestJS |

El filesystem (`fs`) está deshabilitado porque genera miles de spans de ruido sin valor.

---

## Implementación

El SDK se inicializa en `src/instrumentation.ts` y se importa al principio de `src/main.ts` — antes de que NestJS cargue — para que el monkey-patching de Express quede activo desde el inicio.

```
main.ts
  ├── import 'dotenv/config'       ← carga OTEL_* del .env
  ├── import './instrumentation'   ← arranca el SDK (lee las vars)
  └── import { NestFactory } ...   ← Express ya está instrumentado
```
