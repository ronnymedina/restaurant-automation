# Testing — api-core

Estrategia de pruebas para `api-core`: unit tests, e2e tests y stress testing con k6.

---

## Unit & E2E Tests

Ver comandos en el [README principal](../../README.md) y en [`docs/commands.md`](docs/commands.md).

```bash
pnpm test           # unit tests
pnpm test:cov       # cobertura
pnpm test:e2e       # e2e tests (requiere DB levantada)
```

---

## Stress Testing con k6

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) — para correr k6 y el entorno local
- Docker Compose levantado con `api-core` + PostgreSQL + Redis
- Datos de prueba inicializados (ver abajo)

No se requiere instalar k6 globalmente — se corre vía imagen Docker.

---

### Estructura

```
test/k6/
  scenarios/
    smoke.js      # Verificación básica: 2 VUs × 30s
    load.js       # Carga sostenida normal: ramp 0→20 VUs
    stress.js     # Carga extrema: ramp 0→50 VUs
    spike.js      # Ráfaga súbita: simula apertura simultánea de kiosks
  helpers/
    auth.js       # Obtiene JWT de admin antes de cada suite
    data.js       # Constantes: BASE_URL, restaurantId, slug, etc.
```

---

### Preparar datos de prueba

Los tests requieren dos pasos: crear el restaurante base y luego cargar volumen de datos realista.

**Paso 1 — Crear restaurante y admin** (desde el contenedor o desde `apps/api-core/`):

```bash
docker compose exec res-api-core pnpm run cli create-dummy
```

Credenciales fijas que usan los scripts de k6:

| Campo | Valor |
|-------|-------|
| Email | `admin@demo.com` |
| Password | `12345678` |
| Slug | `demo-restaurant` |

**Paso 2 — Seed de volumen para escenarios realistas:**

```bash
# Obtener el restaurant ID del paso anterior (o desde la DB)
docker exec res-db psql -U postgres -d restaurants -c "SELECT id FROM \"Restaurant\";"

# Cargar datos de volumen
docker compose exec res-api-core pnpm run cli seed \
  --restaurant-id <ID> \
  --categories 15 \
  --products 200 \
  --menus 8 \
  --items-per-menu 40
```

Esto carga **15 categorías, 200 productos y 8 menús con 320 items** — suficiente para que los endpoints devuelvan payloads reales y los queries toquen índices y joins.

> Sin el seed de volumen los endpoints responden con listas vacías, lo que produce latencias artificialmente bajas y no representa producción.

---

### Observabilidad — Grafana + InfluxDB (opcional pero recomendado)

Para ver gráficas en tiempo real durante los tests, levanta los servicios de observabilidad desde la raíz del monorepo:

```bash
# Desde la raíz del proyecto
docker compose -f docker-compose.k6.yml up -d
```

Esto levanta:
- **InfluxDB** en `localhost:8086` — recibe las métricas de k6
- **Grafana** en `localhost:3001` — sin login, acceso anónimo con rol Admin

Los dashboards se provisionan automáticamente — no hace falta importar nada:

| Dashboard | URL |
|-----------|-----|
| k6 Results | `http://localhost:3001/d/k6-results` |
| PostgreSQL — Slow Queries | `http://localhost:3001/d/pg-slow-queries` |

**Setup inicial (una sola vez):** habilitar `pg_stat_statements` en la DB:

```bash
docker exec res-db psql -U postgres -d restaurants -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

Al terminar las pruebas:
```bash
docker compose -f docker-compose.k6.yml down
```

---

### Cuellos de botella en queries (pg_stat_statements)

PostgreSQL acumula estadísticas de todas las queries ejecutadas. Después de un test puedes ver las más lentas:

```sql
-- Conectarse al postgres del Docker Compose principal y ejecutar:
SELECT
  query,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2)  AS avg_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Para habilitar la extensión (solo la primera vez):
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Para resetear las estadísticas antes de un test limpio:
```sql
SELECT pg_stat_statements_reset();
```

---

### Ejecutar escenarios

**Sin observabilidad (solo output en terminal):**

Linux (desde `apps/api-core/`):
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/smoke.js
```
macOS (desde `apps/api-core/`):
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/smoke.js
```

**Con Grafana + InfluxDB (métricas en tiempo real):**

Linux (desde `apps/api-core/`):
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run --out influxdb=http://localhost:8086/k6 \
  /scripts/scenarios/load.js
```
macOS (desde `apps/api-core/`):
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run --out influxdb=http://host.docker.internal:8086/k6 \
  /scripts/scenarios/load.js
```

Sustituye `smoke.js` / `load.js` / `stress.js` / `spike.js` según el escenario a correr.
Los scripts leen `__ENV.BASE_URL` y usan `http://localhost:3000` como fallback para Linux.

---

### Endpoints cubiertos

| Prioridad | Endpoint | Motivo |
|-----------|----------|--------|
| Alta | `GET /health` | Baseline — debe aguantar siempre |
| Alta | `POST /v1/auth/login` | bcrypt es costoso en CPU, vulnerable a spikes |
| Alta | `GET /v1/kiosk/menu?slug=X` | Endpoint público, mayor superficie de abuso |
| Media | `POST /v1/orders` | Escritura en DB + eventos WebSocket |
| Media | `GET /v1/products` | Lectura paginada + cache Redis |
| Baja | `POST /v1/onboarding` | Llama a Gemini API — requiere throttle estricto |

---

### Thresholds (criterios de éxito)

| Escenario | Perfil de carga | Error rate | Latencia |
|-----------|----------------|------------|----------|
| Smoke | 2 VUs × 30s | 0% | p95 < 500ms |
| Load | Ramp 0→20 VUs en 1min, sostenido 3min, ramp down 1min | < 1% | p95 < 800ms |
| Stress | Ramp 0→50 VUs en 2min, sostenido 5min | < 5% | p99 < 2s |
| Spike | 5 VUs → 80 VUs en 10s → vuelve a 5 VUs | sistema se recupera | p95 < 3s post-spike |

Si algún threshold falla, k6 termina con código de salida no-cero — útil para bloquear deploys en CI.

---

### Interpretar resultados

Los campos clave del output de k6:

- `http_req_failed` — porcentaje de requests con error (threshold principal)
- `http_req_duration{p(95)}` — latencia del percentil 95
- `http_req_duration{p(99)}` — latencia del percentil 99 (stress/spike)
- `vus_max` — pico de usuarios virtuales alcanzado
- `iterations` — total de ciclos completados

Un resultado saludable antes de desplegar a Railway debe pasar el escenario **load** sin errores y el **stress** con menos de 5% de error rate.

---

### Trazas distribuidas con Jaeger (OpenTelemetry)

Mientras k6 genera carga, Jaeger captura el rastro interno de cada request: qué hizo el controlador, qué queries Prisma ejecutó, cuánto tardó cada span. Esto permite cruzar "la latencia sube en el load test" con "este query SQL específico es el culpable".

#### Levantar Jaeger

Corre en un compose separado para no contaminar el stack principal:

```bash
# Desde la raíz del proyecto
docker compose -f docker-compose.otel.yml up -d
```

La API detecta automáticamente las variables `OTEL_*` del `.env` y empieza a exportar trazas. No se requiere reiniciar nada más.

#### Variables necesarias en `apps/api-core/.env`

```bash
OTEL_SERVICE_NAME=api-core
OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318/v1/traces
```

> `host.docker.internal` es necesario porque la API corre dentro de Docker. En Linux, reemplazar por la IP del host o usar `--network host`.

#### Visualizar trazas en Jaeger UI

Abrir `http://localhost:16686`:

1. **Service** → seleccionar `api-core`
2. **Operation** → elegir el endpoint a analizar (ej. `GET /v1/kiosk/:slug/menus`) o dejar `all`
3. Hacer clic en **Find Traces**
4. Seleccionar cualquier traza para ver el breakdown de spans:

```
GET /v1/kiosk/demo-restaurant/menus   (total: 18ms)
  ├── middleware chain                 (1ms)
  ├── KioskController.getMenus        (16ms)
  │     ├── prisma:client:operation   (14ms)   ← findMany
  │     │     ├── prisma:client:db_query (11ms) ← SQL en db.statement
  │     │     └── pg.query:SELECT     (10ms)   ← ejecución real en pool
  │     └── pg-pool.connect           (1ms)    ← adquisición de conexión
  └── serialize response              (<1ms)
```

#### Cómo usar Jaeger durante un test k6

1. Abrir Jaeger UI antes de correr el escenario
2. Correr el test (smoke / load / stress)
3. Mientras corre: ir a Jaeger → buscar trazas del endpoint bajo carga → observar si algún span crece
4. Después del test: comparar trazas del inicio vs. el pico de VUs — si `prisma:client:db_query` crece de 5ms a 400ms bajo carga, el cuello de botella está en la DB

#### Señales de alerta en Jaeger

| Patrón | Causa probable |
|--------|---------------|
| `pg-pool.connect` con duración alta | Pool de conexiones agotado — muchos VUs esperando conexión |
| `prisma:client:db_query` crece linealmente con los VUs | Query sin índice o full table scan |
| Muchos spans `prisma:client:operation` en serie dentro del mismo request | Problema N+1 — cada item hace su propia query |
| Span total del request alto pero `db_query` bajo | Cuello de botella en CPU (bcrypt, serialización) o en red |

#### Cerrar Jaeger

```bash
docker compose -f docker-compose.otel.yml down
```

---

### Flujo recomendado pre-deploy

```bash
# 1. Levantar entorno principal
docker compose up -d

# 2. Levantar observabilidad (desde la raíz)
docker compose -f docker-compose.k6.yml up -d

# 3. Crear restaurante y admin (si no existe)
docker compose exec res-api-core pnpm run cli create-dummy

# 4. Seed de volumen (obtener el ID primero)
docker exec res-db psql -U postgres -d restaurants -c "SELECT id FROM \"Restaurant\";"
docker compose exec res-api-core pnpm run cli seed \
  --restaurant-id <ID> \
  --categories 15 --products 200 --menus 8 --items-per-menu 40

# 5. Habilitar pg_stat_statements (solo la primera vez)
docker exec res-db psql -U postgres -d restaurants -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# 6. Resetear stats antes del test
docker exec res-db psql -U postgres -d restaurants -c "SELECT pg_stat_statements_reset();"

# 7. Correr smoke → load → stress (desde apps/api-core/)
docker run --rm -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run --out influxdb=http://host.docker.internal:8086/k6 \
  /scripts/scenarios/load.js

# 8. Revisar resultados
#    → Grafana k6:       http://localhost:3001/d/k6-results
#    → Grafana Postgres: http://localhost:3001/d/pg-slow-queries

# 9. Si todo pasa: proceder al deploy en Railway
```
