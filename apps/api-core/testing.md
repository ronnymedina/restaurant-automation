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

### Ejecutar escenarios

**Linux:**
```bash
docker run --rm -i --network host grafana/k6 run - < test/k6/scenarios/smoke.js
docker run --rm -i --network host grafana/k6 run - < test/k6/scenarios/load.js
docker run --rm -i --network host grafana/k6 run - < test/k6/scenarios/stress.js
docker run --rm -i --network host grafana/k6 run - < test/k6/scenarios/spike.js
```

**macOS** (`--network host` no funciona en Docker Desktop — usar `host.docker.internal`):
```bash
docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 grafana/k6 run - < test/k6/scenarios/smoke.js
docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 grafana/k6 run - < test/k6/scenarios/load.js
docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 grafana/k6 run - < test/k6/scenarios/stress.js
docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 grafana/k6 run - < test/k6/scenarios/spike.js
```

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

1. Levantar entorno local: `docker compose up`
2. Seed de datos: `pnpm run cli create-dummy`
3. Correr smoke → si pasa, correr load → si pasa, correr stress
4. Revisar thresholds en el output
5. Si todo pasa: proceder al deploy en Railway
