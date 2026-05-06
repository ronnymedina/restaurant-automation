# Testing — api-core

Estrategia de pruebas para `api-core`: unit tests, e2e tests y stress testing con k6.

---

## Unit & E2E Tests

```bash
pnpm test           # unit tests
pnpm test:cov       # cobertura
pnpm test:e2e       # e2e tests (requiere DB levantada)
```

---

## Stress Testing con k6

### Requisitos

- [k6](https://k6.io/docs/get-started/installation/) instalado localmente
- Docker Compose levantado (ver abajo)
- Datos de prueba inicializados (ver abajo)

---

### Docker Compose — profiles

Todo el stack está en un único `docker-compose.yml` en la raíz del proyecto. Usa profiles para levantar solo lo que necesitás:

```bash
# Solo API + DB (desarrollo normal)
docker compose up -d

# API + DB + métricas k6 (Grafana + InfluxDB)
docker compose --profile k6 up -d

# API + DB + trazas distribuidas (Jaeger)
docker compose --profile otel up -d

# Todo junto — sesión completa de load testing
docker compose --profile k6 --profile otel up -d
```

| Profile | Servicios | Puertos |
|---------|-----------|---------|
| *(ninguno)* | `res-api-core`, `res-db` | 3000, 5432 |
| `k6` | + InfluxDB, Grafana | + 8086, 3001 |
| `otel` | + Jaeger | + 16686, 4318 |

Para bajar todo:
```bash
docker compose --profile k6 --profile otel down
```

---

### Estructura

```
test/k6/
  scenarios/
    smoke.js                # Verificación básica: 2 VUs × 30s
    load.js                 # Carga sostenida normal: ramp 0→20 VUs
    stress.js               # Carga extrema: ramp 0→50 VUs
    spike.js                # Ráfaga súbita: simula apertura simultánea de kiosks
    orders.js               # Órdenes concurrentes genéricas: 10→30→50 VUs
    orders-with-stock.js    # Órdenes con stock garantizado (stock=9999): verifica 201 bajo carga
    orders-no-stock.js      # Órdenes sin stock (stock=0): verifica rechazo 409 graceful
    concurrent-readwrite.js # Escenario mixto: escrituras + lecturas dashboard + cocina en paralelo
  helpers/
    auth.js    # getAuthToken(), authHeaders(), openCashRegister()
    data.js    # Constantes: BASE_URL, slug, KITCHEN_TOKEN
    stock.js   # fetchAllProductIds(), resetStock() — manejo de stock en setup()
```

---

### Preparar datos de prueba

**Paso 1 — Crear restaurante y admin:**

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
# Obtener el restaurant ID
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

**Nota:** Los escenarios `orders-with-stock.js` y `orders-no-stock.js` obtienen los IDs de productos dinámicamente vía `GET /v1/products` en su `setup()`. No es necesario actualizar `helpers/data.js` cuando cambia el seed.

---

### Pre-requisitos antes de correr escenarios de órdenes

Los escenarios que crean órdenes (`orders.js`, `orders-with-stock.js`, `orders-no-stock.js`, `concurrent-readwrite.js`) requieren una caja abierta. Esto está automatizado en la función `setup()` de cada escenario via `openCashRegister()` en `helpers/auth.js` — no hace falta abrirla manualmente.

Si la caja ya estaba abierta, `setup()` recibe `409` y continúa sin error.

---

### Ejecutar escenarios

**Sin observabilidad:**
```bash
k6 run apps/api-core/test/k6/scenarios/smoke.js
```

**Con métricas en Grafana:**
```bash
k6 run --out influxdb=http://localhost:8086/k6 \
  apps/api-core/test/k6/scenarios/load.js
```

Escenarios disponibles:

| Escenario | Archivo | Propósito |
|-----------|---------|-----------|
| Verificación básica | `smoke.js` | Confirma que el servidor responde |
| Carga sostenida | `load.js` | Simula tráfico normal de producción |
| Estrés extremo | `stress.js` | Busca el límite del sistema |
| Ráfaga súbita | `spike.js` | Simula apertura simultánea de kiosks |
| Órdenes concurrentes | `orders.js` | Órdenes con stock variable |
| Órdenes con stock | `orders-with-stock.js` | Happy path bajo carga (verifica 201, detecta deadlocks) |
| Órdenes sin stock | `orders-no-stock.js` | Degradación graceful (verifica 409 rápido) |
| Lectura + escritura | `concurrent-readwrite.js` | Contención entre kiosk, dashboard y cocina |

---

### Observabilidad

#### Grafana + InfluxDB (métricas k6)

Con `--profile k6` levantado:

| Dashboard | URL |
|-----------|-----|
| k6 Results | `http://localhost:3001/d/k6-results` |
| PostgreSQL — Slow Queries | `http://localhost:3001/d/pg-slow-queries` |

Los dashboards se provisionan automáticamente.

**Setup inicial (una sola vez):**
```bash
docker exec res-db psql -U postgres -d restaurants \
  -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

**Resetear estadísticas antes de un test limpio:**
```bash
docker exec res-db psql -U postgres -d restaurants \
  -c "SELECT pg_stat_statements_reset();"
```

**Queries más lentas después de un test:**
```sql
SELECT query, calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2)  AS avg_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

#### Jaeger (trazas distribuidas)

Con `--profile otel` levantado, la API exporta trazas automáticamente según las variables `OTEL_*` del `.env`.

**Variables en `apps/api-core/.env`:**
```bash
OTEL_SERVICE_NAME=api-core
OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318/v1/traces
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1   # 10% bajo load testing; cambiar a 1.0 para debugging puntual
```

> El sampler al 10% reduce el volumen de trazas bajo carga y evita que Jaeger se quede sin memoria. Para investigar un endpoint específico, cambiar `OTEL_TRACES_SAMPLER_ARG=1.0` y reiniciar el contenedor.

**Jaeger UI:** `http://localhost:16686`

1. **Service** → `api-core`
2. **Operation** → endpoint a analizar (ej. `POST /v1/kiosk/:slug/orders`)
3. **Find Traces** → seleccionar una traza para ver el breakdown de spans

**Señales de alerta:**

| Patrón | Causa probable |
|--------|---------------|
| `pg-pool.connect` con duración alta | Pool de conexiones agotado |
| `prisma:client:db_query` crece con los VUs | Query sin índice o full table scan |
| Muchos `prisma:client:operation` en serie | Problema N+1 |
| `pg.query:UPDATE` lento en la misma fila | Lock contention (ej. `CashShift.lastOrderNumber`) |

---

### Thresholds (criterios de éxito)

| Escenario | Perfil de carga | Error rate | Latencia |
|-----------|----------------|------------|----------|
| Smoke | 2 VUs × 30s | < 1% | p95 < 500ms |
| Load | Ramp 0→20 VUs, sostenido 3min | < 1% | p95 < 800ms |
| Stress | Ramp 0→50 VUs, sostenido 5min | < 5% | p99 < 2s |
| Spike | 5→80 VUs en 10s, hold 1min | < 10% | — |
| orders-with-stock | Ramp 0→50 VUs | < 1% | p95 < 800ms |
| orders-no-stock | Ramp 0→40 VUs | 409 esperado | p95 < 300ms |
| Concurrent R/W | 20 kiosk + 5 dashboard + 3 cocina | < 2% | p95 < 1.2s kiosk, < 800ms lecturas |

---

### Límites de recursos del contenedor

`res-api-core` tiene límites configurados en `docker-compose.yml` para simular un servidor de producción:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 1536M
```

Equivale aproximadamente a una instancia Railway Pro de 2 vCPUs / 1.5 GB RAM. Si los tests fallan con estos límites pero pasaban sin ellos, el cuello de botella es de recursos, no de código.

---

### Flujo recomendado pre-deploy

```bash
# 1. Levantar todo el stack
docker compose --profile k6 --profile otel up -d

# 2. Crear restaurante y admin (si no existe)
docker compose exec res-api-core pnpm run cli create-dummy

# 3. Seed de volumen
docker exec res-db psql -U postgres -d restaurants -c "SELECT id FROM \"Restaurant\";"
docker compose exec res-api-core pnpm run cli seed \
  --restaurant-id <ID> \
  --categories 15 --products 200 --menus 8 --items-per-menu 40

# 4. Habilitar pg_stat_statements (solo la primera vez)
docker exec res-db psql -U postgres -d restaurants \
  -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

# 5. Regenerar Prisma client si hubo cambios de schema
docker compose exec res-api-core pnpm exec prisma generate \
  --schema=prisma/schema.postgresql.prisma

# 6. Resetear stats antes del test
docker exec res-db psql -U postgres -d restaurants \
  -c "SELECT pg_stat_statements_reset();"

# 7. Correr escenarios en orden
k6 run --out influxdb=http://localhost:8086/k6 apps/api-core/test/k6/scenarios/smoke.js
k6 run --out influxdb=http://localhost:8086/k6 apps/api-core/test/k6/scenarios/load.js
k6 run --out influxdb=http://localhost:8086/k6 apps/api-core/test/k6/scenarios/stress.js
k6 run --out influxdb=http://localhost:8086/k6 apps/api-core/test/k6/scenarios/orders-with-stock.js
k6 run --out influxdb=http://localhost:8086/k6 apps/api-core/test/k6/scenarios/orders-no-stock.js
k6 run --out influxdb=http://localhost:8086/k6 apps/api-core/test/k6/scenarios/concurrent-readwrite.js

# 8. Revisar resultados
#    → Grafana k6:    http://localhost:3001/d/k6-results
#    → Grafana PG:    http://localhost:3001/d/pg-slow-queries
#    → Jaeger:        http://localhost:16686  (servicio: api-core)

# 9. Si todo pasa: proceder al deploy en Railway
```
