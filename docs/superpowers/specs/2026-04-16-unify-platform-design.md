# Unify Platform — Design Spec

**Date:** 2026-04-16  
**Branch:** `restaurante-verifications` (worktree: `unify-platform`)  
**Status:** Approved

---

## Contexto y motivación

El proyecto originalmente separaba el frontend en múltiples servicios (kiosk separado, dashboard separado). Esto implica mantener múltiples URLs, levantar múltiples servidores, y coordinar lógica entre ellos — complejidad que no es sostenible para un solo desarrollador.

**Objetivo:** Un único frontend unificado (`apps/ui`) que sirve tres secciones: marketing homepage, dashboard del restaurante, y kiosk de pedidos. Este frontend se compila a archivos estáticos que NestJS sirve directamente.

**Restricción central:** El mismo binario compilado de `api-core` debe funcionar tanto en cloud (Railway) como en desktop (Electron/local). Esto requiere que el frontend sea completamente estático — NestJS es el único servidor en ambos contextos.

---

## Arquitectura

### Stack unificado

```
Browser / Electron
      ↕ HTTP + SSE
NestJS (api-core)
  ├── /v1/**         → REST API + SSE (autenticado)
  └── /**            → ServeStaticModule → apps/api-core/public/
      ↕
SQLite (local) | PostgreSQL (cloud)
```

### Deployment contexts

| Aspecto | Cloud | Desktop (Electron) |
|---|---|---|
| Frontend | Archivos estáticos en `api-core/public/` | Ídem — incluidos en el binary de pkg |
| Backend | NestJS en Railway | NestJS binary spawneado por Electron |
| DB | PostgreSQL | SQLite en `~/Library/Application Support/Restaurantes/` |
| Protección de red | Cloudflare (CDN + DDoS + rate limiting) | Sin gateway — localhost directo |
| Proceso único | Sí (NestJS) | Sí (un solo binary) |

### Decisión: SSR vs Static

Se elige `output: 'static'` en Astro por las siguientes razones:
- Electron requiere un único proceso — SSR necesitaría spawnear un segundo servidor Node
- El pipeline `copy-static.mjs` ya está diseñado para este flujo
- La autenticación es 100% client-side (JWT en localStorage) — SSR no agrega valor
- SEO de la marketing homepage es suficiente con prerender estático

---

## Frontend (`apps/ui`)

### Cambios en configuración

**Renombre:** `apps/restaurant-ui` → `apps/ui`  
**Package name:** `@restaurants/ui`

**`astro.config.mjs` — antes vs después:**

```js
// Antes
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind()],
})

// Después
export default defineConfig({
  output: 'static',
  integrations: [react(), tailwind()],
})
```

### Estructura de rutas

| Ruta | Tipo | Estado |
|---|---|---|
| `/` | Astro puro — marketing homepage | Nuevo |
| `/login` | Astro puro | Sin cambios |
| `/onboarding` | Astro puro | Sin cambios |
| `/activate` | Astro puro | Sin cambios |
| `/dash/*` | Astro shell + React islands | Migrar |
| `/kiosk/index` | Astro shell + React island | Migrar (ver routing) |

### Routing del kiosk — query param

**Problema:** `/kiosk/[slug].astro` usa un parámetro dinámico de ruta. En modo estático, Astro necesita `getStaticPaths()` en build time — los slugs vienen de la DB, imposible en build time.

**Solución:** mover el identificador del restaurante a query param. Sin wildcards ni handlers especiales en NestJS — `ServeStaticModule` sirve `/kiosk/index.html` de forma natural.

```
# Antes
/kiosk/mi-restaurante

# Después
/kiosk?r=mi-restaurante
```

1. Renombrar `src/pages/kiosk/[slug].astro` → `src/pages/kiosk/index.astro`
2. El componente React lee el slug del query param:

```tsx
// KioskApp.tsx
const slug = new URLSearchParams(window.location.search).get('r')
```

Todos los QR codes y links al kiosk deben usar el nuevo formato de URL. No hay impacto ya que el proyecto está en desarrollo.

### React islands

Los componentes interactivos se convierten a React islands con `client:load`. Las páginas de Astro mantienen su shell estático.

| Componente | Página | Responsabilidad |
|---|---|---|
| `KioskApp.tsx` | `/kiosk` | Carrito, menús, checkout, confirmación |
| `OrdersLive.tsx` | `/dash/orders` | Tabla de órdenes en tiempo real via SSE |
| `ProductsTable.tsx` | `/dash/products` | CRUD de productos con estado |
| `MenusTable.tsx` | `/dash/menus` | Gestión de menús |
| `CategoriesTable.tsx` | `/dash/categories` | Gestión de categorías |

**Migración progresiva del dashboard (Post Planes 1–4):** Los componentes del dashboard (`ProductsTable`, `MenusTable`, `CategoriesTable`) se migran incrementalmente después de que los planes principales estén completos y la app sea estable. No son parte de un plan formal — se trabajan uno a uno según prioridad.

---

## Backend (`apps/api-core`)

### ServeStaticModule

Agregar `@nestjs/serve-static` para servir el frontend desde `public/`. Con query params en el kiosk y páginas Astro separadas para cada ruta del dashboard, `ServeStaticModule` es suficiente — sin handlers wildcard adicionales.

```ts
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'public'),
  exclude: ['/v1/*'],
})
```

Astro genera un archivo HTML por cada página estática (`dist/dash/orders/index.html`, `dist/kiosk/index.html`, etc.). NestJS los sirve directamente sin configuración extra.

### Server-Sent Events (reemplaza WebSocket)

**Motivación:** El flujo de notificaciones es unidireccional (servidor → cliente). SSE es más simple, sin overhead de upgrade HTTP, y funciona con `EventSource` nativo del browser sin dependencias extra.

**Backend:**
```ts
// events.controller.ts
@Sse('/v1/events/:restaurantId')
@UseGuards(JwtAuthGuard)
stream(@Param('restaurantId') id: string): Observable<MessageEvent> {
  return this.eventsService.getStream(id)
}
```

**Frontend:**
```tsx
// OrdersLive.tsx
useEffect(() => {
  const es = new EventSource(`/v1/events/${restaurantId}`)
  es.onmessage = (e) => setOrders(prev => [JSON.parse(e.data), ...prev])
  return () => es.close()
}, [restaurantId])
```

**Eliminaciones del backend:**
- `apps/api-core/src/events/events.gateway.ts`
- Dependencia `socket.io` de `package.json`
- `@nestjs/websockets` y `@nestjs/platform-socket.io`

---

## Build pipeline

Sin cambios en el pipeline existente. Flujo completo:

```bash
# 1. Build frontend
pnpm --filter @restaurants/ui build
# → apps/ui/dist/

# 2. Copiar a NestJS
pnpm copy-static
# → apps/api-core/public/

# 3a. Cloud
pnpm build:cloud   # obfusca + bytecode → Railway

# 3b. Desktop
pnpm build:desktop # obfusca + pkg binary → Electron lo spawna
```

`copy-static.mjs` requiere actualización mínima: cambiar el path fuente de `apps/restaurant-ui/dist/` a `apps/ui/dist/`.

---

## Planes de implementación

Cada plan es independiente y ejecutable por separado. Orden de dependencias:

```
Plan 1 (base unification)
  ├── Plan 2 (kiosk query param) → Plan 4 (React kiosk island)
  ├── Plan 3 (WebSocket→SSE)     → dashboard islands (incremental, sin plan formal)
  └── Plan 5 (marketing homepage)
```

| Plan | Nombre | Scope |
|---|---|---|
| 1 | `plan-unify-frontend-base` | Renombrar a `apps/ui`, static output, agregar React, ServeStaticModule, verificar build |
| 2 | `plan-kiosk-query-param` | Renombrar kiosk page, cambiar URL a query param, actualizar links/QR |
| 3 | `plan-websocket-to-sse` | Remover WebSocket gateway, crear SSE endpoint, conectar con EventSource |
| 4 | `plan-react-island-kiosk` | Migrar KioskApp de vanilla JS a componente React |
| 5 | `plan-marketing-homepage` | Construir landing page en `/` con Astro puro |

> **Plan 5 (dashboard islands):** Migración incremental post-lanzamiento. Sin plan formal — se trabaja componente a componente según prioridad.

---

## Fuera de scope

- Dual-DB strategy (SQLite/PostgreSQL) — documentado en `docs/different-db-in-local-vs-cloud.md`, plan separado
- macOS DMG packaging — plan existente en `docs/superpowers/plans/pending-2026-03-26-electron-macos-packaging.md`
- Windows packaging
- Auto-update de Electron
- License/trial system — `apps/license-server` ya existe
- Reservations module — `docs/pending-reservations-module.md`
