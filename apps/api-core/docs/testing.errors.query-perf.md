# Hallazgos de rendimiento de queries — api-core

Observaciones de latencia y uso de índices detectadas durante los escenarios k6. Estas no son fallas sino optimizaciones pendientes — los thresholds se cumplieron en todos los casos.

---

## [PERF-01] Lecturas del dashboard y cocina más lentas que escrituras bajo carga mixta

**Fecha:** 2026-05-06  
**Escenario:** concurrent-readwrite.js (20 kiosk + 5 dashboard + 3 kitchen)  
**Severidad:** Baja — dentro de threshold, pero contraintuitivo

### Síntoma

En el escenario de lectura/escritura concurrente, las lecturas resultaron significativamente más lentas que las escrituras:

| Rol | Endpoint | p95 | avg |
|-----|----------|-----|-----|
| kiosk (escritura) | `POST /v1/kiosk/:slug/orders` | **50ms** | 17ms |
| dashboard (lectura) | `GET /v1/orders` | **120ms** | 81ms |
| kitchen (lectura) | `GET /v1/kitchen/:slug/orders` | **115ms** | 80ms |

Las lecturas tardan ~2.5× más que las escrituras bajo carga concurrente.

### Causa raíz probable

El `POST` de orden hace un `INSERT` simple + incremento de contador — operaciones acotadas. Los `GET` del dashboard y cocina hacen `SELECT` con filtros y joins entre `Order`, `OrderItem` y `Product`. Bajo carga concurrente:

1. **Falta de índices compuestos** — si `GET /v1/orders` filtra por `restaurantId` + `status` + `createdAt` sin índices compuestos, cada lectura hace un full scan parcial sobre la tabla `Order`.
2. **Tabla `Order` creciendo activamente** — mientras 20 VUs insertan filas, los `SELECT` paginados trabajan sobre una tabla en cambio constante.
3. **MVCC overhead** — Postgres mantiene versiones de filas durante INSERTs activos; el vacuuming genera I/O que compite con las lecturas.
4. **Paginación por offset** — `OFFSET n LIMIT 20` es costoso en tablas grandes; keyset pagination (`WHERE id < last_seen_id`) sería más eficiente.

### Pendiente

- [ ] Revisar en Jaeger el breakdown de spans de `GET /v1/orders` — identificar si la latencia está en el query o en la serialización de respuesta
- [ ] Verificar índices en `Order` para los filtros del dashboard (`restaurantId`, `status`, `createdAt`)
- [ ] Correr `EXPLAIN ANALYZE` en los queries de lectura después de un test de carga para ver el plan de ejecución real
- [ ] Correr `pg_stat_statements` después del test para comparar `avg_ms` de lecturas vs. escrituras
- [ ] Evaluar migrar paginación a keyset si la tabla crece significativamente
