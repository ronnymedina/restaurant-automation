# k6 — Guía de métricas y escenarios

## Endpoints bajo prueba

| Endpoint | Auth | Por qué se eligió |
|----------|------|-------------------|
| `GET /health` | No | Baseline — si esto falla, el servidor cayó |
| `GET /v1/kiosk/demo-restaurant/menus` | No | Endpoint público de mayor tráfico — lo accede cada kiosk |
| `GET /v1/products` | JWT | Lectura autenticada — valida que el sistema de auth aguante carga |

---

## Los 4 escenarios

| Escenario | Perfil de carga | Duración | Para qué sirve |
|-----------|----------------|----------|----------------|
| **smoke** | 2 VUs fijos | 30s | Confirma que todo funciona antes de pruebas reales |
| **load** | 0→20 VUs, sostenido 3min | ~5min | Simula uso normal de producción |
| **stress** | 0→50 VUs, sostenido 5min | ~8min | Encuentra el límite donde el sistema se degrada |
| **spike** | 5→80 VUs en 10s, vuelve a 5 | ~3min | Simula apertura simultánea de múltiples kiosks |

---

## Thresholds (criterios de éxito)

| Escenario | Error rate | Latencia |
|-----------|------------|----------|
| smoke | < 1% | p95 < 500ms |
| load | < 1% | p95 < 800ms |
| stress | < 5% | p99 < 2000ms |
| spike | < 10% | — (foco en recuperación) |

Si un threshold falla, k6 termina con código de salida no-cero — útil para bloquear deploys en CI.

---

## Cómo leer las métricas en Grafana

### Panel de números (fila superior)

| Métrica | Qué indica | Señal de alerta |
|---------|-----------|-----------------|
| **Virtual Users (max)** | Pico de usuarios simultáneos | — |
| **Total Requests** | Requests enviados en total | — |
| **Error Rate** | % de requests fallidos | > 1% en load, > 5% en stress |
| **Avg Latency** | Tiempo promedio de respuesta | > 200ms en condiciones normales |
| **p95 Latency** | El 95% de requests tardó menos que esto | > 800ms en load |
| **p99 Latency** | El 99% tardó menos que esto (peor caso real) | > 2000ms en stress |

### Gráficas

**Requests per Second** — throughput a lo largo del tiempo. Debe mantenerse estable durante la fase sostenida. Una caída brusca indica que el servidor dejó de responder.

**Virtual Users over Time** — la curva de carga ejecutada. Confirma que el ramp-up se ejecutó como se configuró (útil para comparar con la latencia).

**HTTP Request Duration (mean / p95 / p99)** — las 3 líneas juntas cuentan la historia completa:
- Si las 3 suben juntas → la carga general satura el sistema
- Si p99 se dispara pero mean se mantiene bajo → hay requests lentos aislados (posible lock de DB o timeout puntual)
- Si mean y p95 son estables pero p99 crece → outliers, revisar queries lentas con `pg_stat_statements`

**Error Rate over Time** — debe ser 0% en smoke y load. En stress/spike se tolera algo, pero debe recuperarse cuando bajan los VUs.

### Regla general

Si la latencia sube **linealmente** con los VUs → el sistema escala bien.
Si sube **exponencialmente** → hay un cuello de botella (CPU, pool de conexiones DB, Redis, etc.).

---

## Métricas clave en el output de terminal

```
http_req_failed...: 0.00%    ← % de errores (threshold principal)
http_req_duration.: p(95)=22ms p(99)=35ms
http_reqs.........: 14098    46.8/s   ← throughput total
vus_max...........: 20       ← pico de VUs alcanzado
iterations........: 4699     ← ciclos completos
```

---

## Datos de referencia (load test — 20 VUs, 5 min)

Resultados medidos localmente con **200 productos / 8 menús / 320 items**:

| Métrica | Resultado |
|---------|-----------|
| Error rate | 0.00% |
| p95 latencia | 17ms |
| Avg latencia | 8ms |
| Requests totales | ~14,000 |
| Throughput | ~47 req/s |
| Data transferida | 114 MB |

> Estos números sirven como baseline. Una regresión significativa (p95 > 100ms o error rate > 0%) con la misma carga local indica un problema introducido en el código.

### Importancia del seed de volumen

Correr los tests sin seed de volumen (`create-dummy` solo) produce resultados engañosos:

| Condición | p95 | Data recibida | Realismo |
|-----------|-----|---------------|---------|
| DB vacía (solo create-dummy) | ~22ms | 14 MB | ❌ No representa producción |
| Con seed (200 productos, 8 menús) | ~17ms | 114 MB | ✅ Carga real de payloads |

Siempre correr el `seed` antes de cualquier test que se use como referencia.

---

## Dashboards en Grafana

Grafana corre en `http://localhost:3001` (sin login, acceso anónimo con rol Admin).

Los dashboards se provisionan automáticamente desde archivos en `test/k6/grafana/provisioning/dashboards/` — no hace falta importarlos manualmente, aparecen al levantar el stack.

| Dashboard | URL directa | Datasource |
|-----------|-------------|------------|
| k6 Results | `http://localhost:3001/d/k6-results` | InfluxDB-k6 |
| PostgreSQL — Slow Queries | `http://localhost:3001/d/pg-slow-queries` | PostgreSQL |

### Setup inicial (una sola vez)

La extensión `pg_stat_statements` debe estar habilitada en la DB antes de que el dashboard de Postgres muestre datos:

```bash
docker exec res-db psql -U postgres -d restaurants -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

Si Grafana no levanta correctamente los datasources, reiniciar el contenedor:

```bash
docker compose -f docker-compose.k6.yml restart grafana
```

---

## Queries lentas — dashboard PostgreSQL

### Flujo de uso

1. Resetear stats antes del test para tener datos limpios:
```bash
docker exec res-db psql -U postgres -d restaurants -c "SELECT pg_stat_statements_reset();"
```
2. Correr el escenario k6 que querés analizar
3. Abrir `http://localhost:3001/d/pg-slow-queries`

### Qué muestra cada panel

| Panel | Qué indica |
|-------|-----------|
| **Tabla — Queries más lentas** | Las 20 queries ordenadas por `total_ms`. Color rojo = avg > 100ms, amarillo = avg > 20ms |
| **Barras — avg_ms** | Top 10 queries por tiempo promedio por ejecución |
| **Barras — calls** | Top 10 queries más ejecutadas (frecuencia) |
| **Query más lenta** | El peor caso individual en avg_ms |
| **Total ejecuciones** | Cuántas veces se ejecutaron queries en total durante el test |
| **Tiempo total en DB** | Suma de todo el tiempo que pasó el sistema ejecutando SQL |

### Cómo interpretar los resultados

**`avg_ms` alto + `calls` bajo** → query puntual costosa. Candidata a índice o reescritura.

**`avg_ms` bajo + `calls` alto** → query barata pero muy frecuente. Revisar si se puede cachear con Redis o reducir llamadas (N+1 clásico de ORM).

**`avg_ms` alto + `calls` alto** → problema crítico. Está consumiendo la mayor parte del tiempo de DB bajo carga.

**`total_ms` como prioridad** → ordená siempre por `total_ms` para encontrar el cuello de botella real. Una query de 5ms llamada 10,000 veces (50,000ms total) es más urgente que una de 200ms llamada 10 veces (2,000ms total).

### Señales de alerta comunes

| Síntoma | Causa probable | Acción |
|---------|---------------|--------|
| Query con `SELECT *` y `avg_ms` > 50ms | Falta índice o trae columnas de más | Agregar índice en el WHERE, seleccionar solo columnas necesarias |
| Misma query aparece N veces con distinto ID | Parámetros no parametrizados (query literal) | Usar Prisma params en vez de interpolación manual |
| Query de `UPDATE` con `avg_ms` muy alto bajo carga | Lock contention — múltiples requests actualizan la misma fila | Revisar si se puede hacer optimistic locking o batch updates |
| `calls` exponencialmente alto en un JOIN | Problema N+1 — cada item hace su propia query | Usar `include` en Prisma para hacer el JOIN en una sola query |

### Comando alternativo por terminal

```bash
docker exec res-db psql -U postgres -d restaurants -c "
SELECT
  left(query, 80)                            AS query,
  calls,
  round(total_exec_time::numeric, 2)         AS total_ms,
  round(mean_exec_time::numeric, 2)          AS avg_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
"
```
