# OpenTelemetry — Trazas distribuidas

`api-core` exporta trazas OpenTelemetry automáticamente al arrancar. En local van a Jaeger; en producción a Grafana Cloud (o cualquier colector OTLP compatible).

La instrumentación está **siempre activa** — no requiere código adicional. Se desactiva o configura exclusivamente con variables de entorno.

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
| `OTEL_SDK_DISABLED` | `false` | `true` desactiva el SDK completamente — no se generan ni exportan trazas |
| `OTEL_SERVICE_NAME` | `api-core` | Nombre del servicio en Jaeger / Grafana |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | URL del colector OTLP — debe incluir `/v1/traces` |
| `OTEL_EXPORTER_OTLP_HEADERS` | — | Headers de autenticación, ej. `Authorization=Basic <token>` |

> **`host.docker.internal` vs `localhost`:** El `.env` de Docker usa `http://host.docker.internal:4318/v1/traces` porque dentro del contenedor `localhost` apunta al propio contenedor, no al host. En macOS con Docker Desktop, `host.docker.internal` resuelve al host correctamente.

### Desactivar el tracing

Para desactivar sin tocar código — útil en entornos donde no hay colector disponible:

```bash
OTEL_SDK_DISABLED=true
```

El `NodeSDK` lee esta variable en el constructor y convierte todas las operaciones en no-ops. La app arranca normal, sin intentar conectarse a ningún colector.

---

## Producción (Grafana Cloud)

1. Crear cuenta en [Grafana Cloud](https://grafana.com/auth/sign-up) (free tier: 50 GB/mes).
2. Ir a **Stack → Connections → OpenTelemetry** y copiar el endpoint y el token.
3. Agregar estas variables de entorno (Railway, Docker, etc.):

```bash
OTEL_SERVICE_NAME=api-core
OTEL_EXPORTER_OTLP_ENDPOINT=https://<stack>.grafana.net/otlp/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-token>
```

El código no cambia — solo variables de entorno.

---

## Qué se captura automáticamente

| Span | Qué representa |
|---|---|
| `HTTP GET /v1/...` | Request HTTP entrante completo (Express) |
| `prisma:client:operation` | Operación Prisma (findMany, create, update…) |
| `prisma:client:db_query` | Query SQL enviada a Postgres — visible en el atributo `db.statement` |
| `pg.query:SELECT` | Ejecución real en el pool de conexiones pg |
| `pg-pool.connect` | Adquisición de conexión del pool |
| `AuthController.login` | Método del controlador NestJS |

El filesystem (`fs`) está deshabilitado explícitamente — genera miles de spans de ruido durante el boot de Node sin ningún valor diagnóstico.

---

## Implementación

El SDK se inicializa en `src/instrumentation.ts` y se importa al comienzo de `src/main.ts`, antes de que NestJS cargue. Esto es necesario para que el monkey-patching de Express ocurra antes de que el framework lo use.

```
main.ts
  ├── import 'dotenv/config'       ← carga OTEL_* del .env
  ├── import './instrumentation'   ← NodeSDK.start() (lee las vars, incluyendo OTEL_SDK_DISABLED)
  └── import { NestFactory } ...   ← Express ya está instrumentado
```

`instrumentation.ts` usa el enfoque de SDK manual (en lugar del zero-code `--require`) para poder incluir `@prisma/instrumentation`, que no forma parte del paquete de auto-instrumentaciones estándar de OpenTelemetry.
