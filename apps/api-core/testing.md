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

Antes de correr cualquier escenario, inicializa la DB con datos demo:

```bash
# Desde apps/api-core/
pnpm run cli create-dummy
```

Esto crea un restaurante de prueba, un usuario admin y productos con las siguientes credenciales fijas:

| Campo | Valor |
|-------|-------|
| Email | `admin@demo.com` |
| Password | `12345678` |
| Slug | `demo-restaurant` |

Los scripts en `helpers/data.js` usan estas constantes como valores por defecto.

---

### Observabilidad — Grafana + InfluxDB (opcional pero recomendado)

Para ver gráficas en tiempo real durante los tests, levanta los servicios de observabilidad desde la raíz del monorepo:

```bash
# Desde la raíz del proyecto
docker compose -f docker-compose.k6.yml up -d
```

Esto levanta:
- **InfluxDB** en `localhost:8086` — recibe las métricas de k6
- **Grafana** en `localhost:3001` — dashboard visual (usuario: cualquiera, sin contraseña en local)

En Grafana, importa el dashboard oficial de k6 con ID **`2587`** (Dashboards → Import → ID 2587). Queda guardado para futuras sesiones gracias al volumen de Grafana.

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

### Flujo recomendado pre-deploy

1. Levantar entorno principal: `docker compose up -d`
2. Levantar observabilidad: `docker compose -f docker-compose.k6.yml up -d` (desde la raíz)
3. Seed de datos: `pnpm run cli create-dummy`
4. Abrir Grafana en `http://localhost:3001` e importar dashboard ID `2587`
5. Resetear stats de Postgres: `SELECT pg_stat_statements_reset();`
6. Correr smoke → si pasa, correr load → si pasa, correr stress
7. Revisar gráficas en Grafana y queries lentas con `pg_stat_statements`
8. Si todo pasa: proceder al deploy en Railway
