# k6 Stress Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement k6 stress test scripts (smoke, load, stress, spike) with Grafana + InfluxDB observability for local pre-deploy validation of the api-core NestJS service.

**Architecture:** k6 scripts live in `apps/api-core/test/k6/` and are run via Docker volume mount so relative imports between helpers and scenarios work. Grafana + InfluxDB are provisioned via `docker-compose.k6.yml` (already committed at repo root) and receive k6 metrics via the `--out influxdb` flag.

**Tech Stack:** k6 (via `grafana/k6` Docker image), InfluxDB 1.8, Grafana, Docker Compose

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api-core/test/k6/helpers/data.js` | Shared constants: BASE_URL, credentials, slug |
| Create | `apps/api-core/test/k6/helpers/auth.js` | `getAuthToken()` and `authHeaders()` utilities |
| Create | `apps/api-core/test/k6/scenarios/smoke.js` | 2 VUs × 30s, zero-error baseline |
| Create | `apps/api-core/test/k6/scenarios/load.js` | Ramp 0→20 VUs, 3 min sustained |
| Create | `apps/api-core/test/k6/scenarios/stress.js` | Ramp 0→50 VUs, 5 min sustained |
| Create | `apps/api-core/test/k6/scenarios/spike.js` | 5→80 VUs burst then recovery |
| Create | `apps/api-core/test/k6/grafana/provisioning/datasources/influxdb.yaml` | Auto-provisions InfluxDB datasource in Grafana |
| Modify | `apps/api-core/testing.md` | Fix run commands to use volume mount (stdin piping breaks relative imports) |

---

## Task 1: Helpers — data.js and auth.js

**Files:**
- Create: `apps/api-core/test/k6/helpers/data.js`
- Create: `apps/api-core/test/k6/helpers/auth.js`

- [ ] **Step 1: Create data.js**

```javascript
// apps/api-core/test/k6/helpers/data.js
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const ADMIN_EMAIL = 'admin@demo.com';
export const ADMIN_PASSWORD = '12345678';
export const KIOSK_SLUG = 'demo-restaurant';
```

- [ ] **Step 2: Create auth.js**

```javascript
// apps/api-core/test/k6/helpers/auth.js
import http from 'k6/http';
import { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './data.js';

export function getAuthToken() {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 201) {
    throw new Error(`Login failed — status ${res.status}. Run 'pnpm run cli create-dummy' first.`);
  }

  return res.json('accessToken');
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}
```

- [ ] **Step 3: Verify helpers load without error**

From `apps/api-core/`, run a minimal k6 invocation that imports helpers (smoke test in next task will be the real verification — this step is a reminder to check the Docker setup first):

```bash
# Ensure Docker is running and the api-core Docker Compose stack is up
docker compose up -d
# Confirm api-core responds
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 4: Seed demo data**

```bash
# From apps/api-core/
pnpm run cli create-dummy
# Expected output ends with:
# Restaurant: Demo Restaurant
# Slug:       demo-restaurant
# Email:      admin@demo.com
# Password:   12345678
```

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/test/k6/helpers/
git commit -m "test(k6): add helpers — data constants and auth token utility"
```

---

## Task 2: Smoke Test

**Files:**
- Create: `apps/api-core/test/k6/scenarios/smoke.js`

- [ ] **Step 1: Create smoke.js**

```javascript
// apps/api-core/test/k6/scenarios/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: status 200': (r) => r.status === 200 });

  // Kiosk menus — public, unauthenticated
  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: status 200': (r) => r.status === 200 });

  // Products list — requires JWT
  const productsRes = http.get(`${BASE_URL}/v1/products`, authHeaders(data.token));
  check(productsRes, { 'products: status 200': (r) => r.status === 200 });

  sleep(1);
}
```

- [ ] **Step 2: Run smoke test (no observability)**

From `apps/api-core/`:

**Linux:**
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/smoke.js
```

**macOS:**
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/smoke.js
```

Expected output (last lines):
```
✓ health: status 200
✓ kiosk menus: status 200
✓ products: status 200

checks.........................: 100.00% ✓ ...
http_req_duration.............: p(95)=XXXms  ← must be < 500ms
http_req_failed...............: 0.00%        ← must be < 1%
```

If `http_req_failed > 0`, check that Docker Compose is up and seed data exists.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/k6/scenarios/smoke.js
git commit -m "test(k6): add smoke scenario — 2 VUs x 30s baseline"
```

---

## Task 3: Load Test

**Files:**
- Create: `apps/api-core/test/k6/scenarios/load.js`

- [ ] **Step 1: Create load.js**

```javascript
// apps/api-core/test/k6/scenarios/load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: 200': (r) => r.status === 200 });

  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: 200': (r) => r.status === 200 });

  const productsRes = http.get(`${BASE_URL}/v1/products`, authHeaders(data.token));
  check(productsRes, { 'products: 200': (r) => r.status === 200 });

  sleep(1);
}
```

- [ ] **Step 2: Run load test**

From `apps/api-core/`. The test runs for ~5 minutes total.

**Linux:**
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/load.js
```

**macOS:**
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/load.js
```

Expected: `http_req_failed` rate stays at `0.00%`, `p(95)` under 800ms throughout.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/k6/scenarios/load.js
git commit -m "test(k6): add load scenario — ramp 0→20 VUs, 3min sustained"
```

---

## Task 4: Stress Test

**Files:**
- Create: `apps/api-core/test/k6/scenarios/stress.js`

- [ ] **Step 1: Create stress.js**

```javascript
// apps/api-core/test/k6/scenarios/stress.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(99)<2000'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: 200': (r) => r.status === 200 });

  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: 200': (r) => r.status === 200 });

  const productsRes = http.get(`${BASE_URL}/v1/products`, authHeaders(data.token));
  check(productsRes, { 'products: 200': (r) => r.status === 200 });

  sleep(0.5);
}
```

- [ ] **Step 2: Run stress test**

From `apps/api-core/`. The test runs for ~8 minutes total.

**Linux:**
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/stress.js
```

**macOS:**
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/stress.js
```

Pass criteria: `http_req_failed < 5%` and `p(99) < 2000ms`. If it fails, note which metric breached — that is your bottleneck.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/k6/scenarios/stress.js
git commit -m "test(k6): add stress scenario — ramp 0→50 VUs, 5min sustained"
```

---

## Task 5: Spike Test

**Files:**
- Create: `apps/api-core/test/k6/scenarios/spike.js`

- [ ] **Step 1: Create spike.js**

```javascript
// apps/api-core/test/k6/scenarios/spike.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // warm up
    { duration: '10s', target: 80 },  // sudden spike
    { duration: '1m',  target: 80 },  // hold spike
    { duration: '30s', target: 5 },   // recovery ramp down
    { duration: '30s', target: 5 },   // verify stable after spike
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  // Focus on the highest-traffic public endpoint: kiosk menus
  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: 200': (r) => r.status === 200 });

  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: 200': (r) => r.status === 200 });

  sleep(0.3);
}
```

- [ ] **Step 2: Run spike test**

From `apps/api-core/`. The test runs for ~3 minutes total.

**Linux:**
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/spike.js
```

**macOS:**
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run /scripts/scenarios/spike.js
```

Pass criteria: `http_req_failed < 10%` AND the checks pass rate recovers to >90% after the spike drops back to 5 VUs.

- [ ] **Step 3: Commit**

```bash
git add apps/api-core/test/k6/scenarios/spike.js
git commit -m "test(k6): add spike scenario — 5→80 VUs burst simulating kiosk rush"
```

---

## Task 6: Grafana Datasource Provisioning

**Files:**
- Create: `apps/api-core/test/k6/grafana/provisioning/datasources/influxdb.yaml`

This file is auto-loaded by Grafana on startup (the docker-compose.k6.yml already mounts this path at `/etc/grafana/provisioning`). It connects Grafana to InfluxDB automatically so you don't have to configure it manually each time.

- [ ] **Step 1: Create influxdb.yaml**

```yaml
# apps/api-core/test/k6/grafana/provisioning/datasources/influxdb.yaml
apiVersion: 1
datasources:
  - name: InfluxDB-k6
    type: influxdb
    url: http://influxdb:8086
    database: k6
    isDefault: true
    editable: false
```

- [ ] **Step 2: Verify Grafana picks it up**

From the repo root:

```bash
docker compose -f docker-compose.k6.yml up -d
```

Open `http://localhost:3001`. Navigate to **Connections → Data Sources**. You should see `InfluxDB-k6` already configured without manual setup.

Import the k6 dashboard: **Dashboards → Import → Enter ID `2587` → Load → Select `InfluxDB-k6` datasource → Import**.

- [ ] **Step 3: Run load test with InfluxDB output to verify metrics flow**

From `apps/api-core/`:

**Linux:**
```bash
docker run --rm --network host \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run --out influxdb=http://localhost:8086/k6 \
  /scripts/scenarios/smoke.js
```

**macOS:**
```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run --out influxdb=http://host.docker.internal:8086/k6 \
  /scripts/scenarios/smoke.js
```

Open the Grafana k6 dashboard — you should see live metrics (VUs, request rate, p95 latency) updating during the test run.

- [ ] **Step 4: Commit**

```bash
git add apps/api-core/test/k6/grafana/
git commit -m "test(k6): add Grafana InfluxDB datasource provisioning"
```

---

## Task 7: Fix Run Commands in testing.md

The existing testing.md uses stdin piping (`- < file.js`) which breaks relative ES module imports. Update to volume mount approach.

**Files:**
- Modify: `apps/api-core/testing.md`

- [ ] **Step 1: Replace the "Sin observabilidad" and "Con Grafana" command blocks**

Find the section **"Sin observabilidad (solo output en terminal):"** and replace both Linux and macOS blocks with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/api-core/testing.md
git commit -m "docs: fix k6 run commands to use volume mount for ES module imports"
```

---

## Task 8: Enable pg_stat_statements for Query Bottleneck Analysis

`pg_stat_statements` tracks cumulative query stats. After a stress test you can query which SQL statements were slowest. It must be loaded via `shared_preload_libraries` before PostgreSQL starts — a one-line change to `docker-compose.yml`.

**Files:**
- Modify: `docker-compose.yml` (repo root)

- [ ] **Step 1: Add `shared_preload_libraries` to the res-db service**

In `docker-compose.yml`, add a `command` line to the `res-db` service:

```yaml
  res-db:
    container_name: res-db
    image: postgres:17-alpine
    command: >
      postgres
      -c shared_preload_libraries=pg_stat_statements
      -c pg_stat_statements.track=all
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-restaurants}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}" ]
      interval: 5s
      timeout: 5s
      retries: 5
```

- [ ] **Step 2: Restart postgres and enable the extension**

```bash
# From repo root
docker compose down res-db
docker compose up -d res-db

# Connect and enable the extension (one-time per DB)
docker exec -it res-db psql -U postgres -d restaurants \
  -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
# Expected: CREATE EXTENSION
```

- [ ] **Step 3: Verify stats are collected after a test run**

Run the smoke test, then query:

```bash
docker exec -it res-db psql -U postgres -d restaurants -c "
SELECT
  left(query, 80)                               AS query,
  calls,
  round(total_exec_time::numeric, 2)            AS total_ms,
  round(mean_exec_time::numeric, 2)             AS avg_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
"
```

Expected: rows showing SQL queries from the k6 run with execution time stats.

To reset before a clean test run:
```bash
docker exec -it res-db psql -U postgres -d restaurants \
  -c "SELECT pg_stat_statements_reset();"
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: enable pg_stat_statements in dev postgres for query profiling"
```

---

## Verification Checklist

After completing all tasks, run this sequence from scratch to confirm everything works end-to-end:

```bash
# 1. Start main stack
docker compose up -d

# 2. Start observability stack (from repo root)
docker compose -f docker-compose.k6.yml up -d

# 3. Seed data (from apps/api-core/)
pnpm run cli create-dummy

# 4. Smoke test with metrics
docker run --rm --network host \   # (or macOS variant)
  -v $(pwd)/test/k6:/scripts \
  grafana/k6 run --out influxdb=http://localhost:8086/k6 \
  /scripts/scenarios/smoke.js

# 5. Open http://localhost:3001 and verify k6 dashboard shows data

# 6. Tear down observability stack when done
docker compose -f docker-compose.k6.yml down
```

All 3 checks in the smoke test should show `✓` with 0% failure rate.
