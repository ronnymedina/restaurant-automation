# Design: Migración de autenticación a cookies httpOnly + Origin check

**Fecha:** 2026-05-30
**Estado:** Aprobado (pendiente plan de implementación)
**Hallazgos cubiertos:** H-04 (tokens JWT en query string SSE). Sienta base parcial para H-39 (SSR dashboard).
**Auditoría base:** `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md`
**Specs relacionados:**
- `2026-05-27-orders-cashshift-kitchen-token-hardening-design.md` — H-14 (kitchen token hash + timingSafeEqual) — predecesor del cambio de transporte en cocina.

---

## Resumen ejecutivo

Refactor de la capa de autenticación de la API: el JWT pasa de viajar como `Authorization: Bearer` + `localStorage` a viajar como cookie `httpOnly` `Secure` `SameSite=Lax` con `Domain=.daikulab.com` en prod. El refresh token deja de viajar en el body de `/v1/auth/refresh` para vivir en una segunda cookie path-scoped a `/v1/auth`. La defensa contra CSRF se monta en dos capas: `SameSite=Lax` (browser-level) + un `CsrfOriginGuard` global que valida el header `Origin` para métodos mutadores.

En paralelo, el SSE del dashboard deja de aceptar `?token=` y lee la cookie `access_token` directamente. El kitchen token migra a header `X-Kitchen-Token` (tanto para SSE como para las llamadas REST de `/v1/kitchen/*`), eliminando el `?token=` del query y del `sessionStorage`.

Decisiones tomadas durante el brainstorming:

| Decisión | Valor |
|----------|-------|
| Esquema de cookies | 2 cookies: `access_token` (Path=/) + `refresh_token` (Path=/v1/auth) |
| Defensa CSRF | `SameSite=Lax` + `CsrfOriginGuard` (Origin header allowlist) |
| Topología de dominios | Mantener `resapp.daikulab.com` + `resapi.daikulab.com` (same-site, cross-origin) |
| Kitchen scope | SSE + REST a header `X-Kitchen-Token` |
| Dev local | Cookies sin `Domain`, `Secure=false`, `SameSite=Lax` — `localhost:3000` ↔ `localhost:4321` mismo host |
| Deploy | Big-bang con re-login forzado. Cajeros con `localStorage` legacy reciben 401 → redirect a `/login` |

Fuera de scope:

- **H-39** (SSR del dashboard) — habilitada por este cambio pero implementación queda para spec propio (requiere migrar Astro a `hybrid`/`server` con adapter).
- **H-AUX-02** (payload SSE vacío + full refetch) — spec propio.
- **Same-origin unificado** (todo bajo un host) — decisión arquitectónica explícitamente postergada. Origin check sigue siendo necesario porque `SameSite=Lax` no distingue subdominios del mismo eTLD+1.
- **Tokens de activación de cuenta y reset de contraseña** — viajan por URL en email, no son auth de sesión. Sin cambios.

---

## Contexto y motivación

### Estado actual

El JWT viaja como `Authorization: Bearer <token>` en cada request a `resapi.daikulab.com`. El cliente (Astro static + React islands) lo guarda en `localStorage` y lo lee en `lib/auth.ts`. El refresh token (UUID en BD) se envía en el body de `POST /v1/auth/refresh`.

El SSE del dashboard recibe el JWT por query (`/v1/events/dashboard?token=<jwt>`) porque la API `EventSource` del navegador no acepta headers. El SSE de cocina recibe el `kitchenToken` por query (`/v1/events/kitchen?slug=&token=`). Las llamadas REST de cocina (`kitchenFetch`) usan el mismo patrón.

### Problemas

1. **H-04 (CRÍTICO)**: tokens viajan en URL → quedan en logs nginx/Cloudflare, en `Referer` saliente, en historial del navegador, visibles a extensiones del navegador. Una filtración de logs compromete sesiones activas.
2. **XSS exfiltration**: cualquier XSS en `resapp.daikulab.com` (o dependencia npm comprometida) puede `localStorage.getItem('accessToken')` y exfiltrar el token a un endpoint externo. El atacante lo usa **desde su propia infraestructura** durante 15 minutos (TTL del access token) o hasta que el usuario haga logout. El blast radius es persistente.
3. **H-39 (MEDIO)**: el dashboard está marcado `prerender = true` porque no puede haber auth check server-side (server no ve `localStorage`). El bug no expone datos hoy pero contradice el modelo de página autenticada.

### Por qué cookies httpOnly mitiga (no elimina) estos riesgos

| Amenaza | localStorage (hoy) | Cookies httpOnly |
|---------|-------------------|------------------|
| XSS exfiltración del token | 🔴 Token robado, atacante actúa desde otra máquina, 15 min de uso libre | 🟡 Atacante actúa solo mientras víctima tiene la pestaña abierta, sin persistencia |
| CSRF clásico cross-site | 🟢 N/A (no hay cookie automática) | 🟢 Bloqueado por `SameSite=Lax` |
| CSRF desde subdominio comprometido de `daikulab.com` | 🟢 Inalcanzable | 🟡 Mitigado por `CsrfOriginGuard` (capa adicional) |
| Token en URL (H-04) | 🔴 Necesario para SSE | 🟢 Cookie viaja sola |
| SSR auth (H-39) | 🔴 Imposible | 🟢 Backend lee `req.cookies` |

### Por qué Origin check sobre `SameSite=Lax`

`SameSite=Lax` opera sobre eTLD+1 ("mismo sitio"). `blog.daikulab.com` y `resapi.daikulab.com` son **same-site** aunque sean origins distintos. Un POST cross-origin pero same-site sí lleva la cookie. Origin check cierra esa puerta: si el `Origin` no es `https://resapp.daikulab.com`, el backend rechaza con 403.

El usuario confirmó que planea agregar más subdominios bajo `daikulab.com` (`blog.daikulab.com`, raíz `daikulab.com`, etc.). El riesgo de "subdominio comprometido" deja de ser teórico.

---

## Arquitectura nueva

### Flujo de auth

```
┌──────────────────────────┐                       ┌──────────────────────────┐
│  resapp.daikulab.com     │  ① POST /v1/auth/login│  resapi.daikulab.com     │
│  (Astro static)          │ ──────────────────────▶│  (NestJS)                │
│                          │                       │                          │
│  - Sin localStorage      │  ② Set-Cookie:        │  - cookie-parser         │
│  - apiFetch con          │     access_token=...; │  - CsrfOriginGuard       │
│    credentials: include  │ ◀──────────────────────│  - JWT extractor lee     │
│                          │     refresh_token=...;│    de req.cookies        │
│  - EventSource sin       │                       │                          │
│    ?token= (cookie auto) │  ③ Cualquier request  │                          │
│                          │ ──────────────────────▶│                          │
│                          │  Cookie: access_token │                          │
│                          │  Origin: resapp.*     │                          │
│                          │                       │                          │
│                          │  ④ 401 access expirado│                          │
│                          │ ◀──────────────────────│                          │
│                          │  ⑤ POST /v1/auth/refresh                         │
│                          │ ──────────────────────▶│                          │
│                          │  Cookie: refresh_token│                          │
│                          │  ⑥ Set-Cookie nuevas  │                          │
│                          │ ◀──────────────────────│                          │
│                          │  ⑦ Retry request orig.│                          │
└──────────────────────────┘                       └──────────────────────────┘
                            ▲
                            │
                            │  blog.daikulab.com hace POST con
                            │  credentials → Origin: blog.*
                            │  → CsrfOriginGuard rechaza 403
                            │
```

### Cookies que setea el backend

| Cookie | Path | Max-Age | HttpOnly | SameSite | Secure | Domain (prod) | Domain (dev) |
|--------|------|---------|----------|----------|--------|---------------|--------------|
| `access_token` | `/` | 15 min | ✅ | Lax | ✅ | `.daikulab.com` | (sin atributo) |
| `refresh_token` | `/v1/auth` | 7 días | ✅ | Lax | ✅ | `.daikulab.com` | (sin atributo) |

Configurable vía env vars `COOKIE_DOMAIN` (string vacío = sin atributo) y `COOKIE_SECURE` (`false` en dev).

### Defensa CSRF en capas

1. **`SameSite=Lax`** (browser-level) — bloquea POST/PUT/PATCH/DELETE cross-site desde sitios externos (`malicioso.com`).
2. **`CsrfOriginGuard`** (NestJS global guard) — valida que `Origin` ∈ allowlist en métodos mutadores. Cubre subdominios comprometidos de `daikulab.com`. Allowlist parametrizada por env var `CORS_ORIGIN`.
3. **Eliminación del extractor Bearer** — `JwtStrategy` ya no acepta `Authorization: Bearer`. Solo lee de `req.cookies['access_token']`. Nadie puede inyectar token por header.

### Manejo del Kitchen token

Migra de query (`?token=`) a header `X-Kitchen-Token` en:
- SSE: `/v1/events/kitchen?slug=<slug>` + header `X-Kitchen-Token`.
- REST: todas las llamadas a `/v1/kitchen/*` envían el token en el mismo header.

Continúa guardado en `sessionStorage` (es un device token, no user token — la cocina es un kiosko compartido). No usa cookies para no entrar en conflicto con la auth de usuario en el mismo dominio.

Para SSE, `EventSource` nativo no permite headers. Se reemplaza por `@microsoft/fetch-event-source` (5KB, mantenido por Microsoft) **solo en cocina**. El dashboard sigue usando `EventSource` nativo porque la cookie viaja sola.

---

## Cambios por archivo

### Backend (`apps/api-core`)

#### Dependencias nuevas

```bash
pnpm add cookie-parser
pnpm add -D @types/cookie-parser
```

#### `src/main.ts`

```ts
import cookieParser from 'cookie-parser';
// ...
app.use(cookieParser());

// CORS ya tenía credentials: true. Garantizar origin explícito (no wildcard) en prod.
app.enableCors({
  origin: isProduction ? FRONTEND_URL : ['http://localhost:4321'],
  credentials: true,
});
```

#### `src/config/index.ts` (o donde estén las env vars)

Añadir:
- `COOKIE_DOMAIN` (string, default `''`)
- `COOKIE_SECURE` (boolean, default `true`)
- `COOKIE_ACCESS_MAX_AGE` (ms, default `15 * 60 * 1000`)
- `COOKIE_REFRESH_MAX_AGE` (ms, default `7 * 24 * 60 * 60 * 1000`)

#### `src/auth/auth.controller.ts`

`POST /v1/auth/login`:
- Mantener body `{ email, password }`.
- En éxito: `res.cookie('access_token', accessToken, opts)` + `res.cookie('refresh_token', refreshToken, refreshOpts)`. Body de respuesta NO incluye tokens; sí mantiene `{ timezone }` para el cliente.
- Decorar el método con `@Res({ passthrough: true })` para acceder a `Response`.

`POST /v1/auth/refresh`:
- Ya NO acepta body con `refreshToken`. Lee de `req.cookies['refresh_token']`.
- Si no hay cookie → 401.
- En éxito: setea nuevas cookies (rotación). Body vacío `{ timezone }`.
- DTO `RefreshTokenDto` se elimina (o se reduce a clase vacía si Swagger lo necesita).

`POST /v1/auth/logout`:
- Lee `req.cookies['refresh_token']`, lo revoca en BD.
- `res.clearCookie('access_token', { domain, path: '/' })`.
- `res.clearCookie('refresh_token', { domain, path: '/v1/auth' })`.
- Mantiene revocación de todos los refresh tokens del usuario (revokeAllTokens) — comportamiento actual.

#### `src/auth/strategies/jwt.strategy.ts`

Reemplazar el extractor:

```ts
import type { Request } from 'express';

super({
  jwtFromRequest: ExtractJwt.fromExtractors([
    (req: Request) => req?.cookies?.access_token ?? null,
  ]),
  ignoreExpiration: false,
  secretOrKey: configService.jwtSecret,
});
```

`ExtractJwt.fromAuthHeaderAsBearerToken()` deja de funcionar — comportamiento intencional.

#### `src/auth/guards/csrf-origin.guard.ts` (nuevo)

```ts
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;
  private readonly safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(@Inject(...) configService) {
    this.allowedOrigins = new Set(configService.corsAllowedOrigins);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (this.safeMethods.has(req.method)) return true;

    const origin = req.headers.origin ?? this.extractOriginFromReferer(req.headers.referer);
    if (!origin) throw new ForbiddenException('ORIGIN_REQUIRED');
    if (!this.allowedOrigins.has(origin)) throw new ForbiddenException('ORIGIN_NOT_ALLOWED');
    return true;
  }

  private extractOriginFromReferer(referer?: string): string | null {
    if (!referer) return null;
    try { return new URL(referer).origin; } catch { return null; }
  }
}
```

Registrar como `APP_GUARD` en `app.module.ts`. Orden de ejecución: `CsrfOriginGuard` antes que `JwtAuthGuard` (CSRF se evalúa antes de auth — si el origin es malo, ni siquiera intentamos validar JWT).

**Excepción intencional:** las rutas `@Public()` (kiosk endpoints) saltan `JwtAuthGuard` pero **NO** saltan `CsrfOriginGuard`. El kiosk es navegable público y debe respetar Origin también (un sitio externo no debería poder crear órdenes en el restaurante del usuario aprovechando que el kiosk es público). Caveat: el kiosk SÍ recibe requests directas del navegador del cliente final desde su propio dominio (`resapp.daikulab.com/kiosk?slug=...`) → mismo origen permitido. OK.

#### `src/events/events.controller.ts`

`GET /v1/events/dashboard`:
- Eliminar `@Query('token')`. Usar `JwtAuthGuard` normal (ya verifica vía cookie tras el cambio de extractor).
- El handler se simplifica: recibe `@CurrentUser()` y pasa `user.restaurantId` a `sseService.streamForRestaurant`.

`GET /v1/events/kitchen`:
- Eliminar `@Query('token')`.
- Leer header `X-Kitchen-Token` (vía `@Headers('x-kitchen-token')` o reutilizar `KitchenTokenGuard`).
- Validar con `kitchenTokenService.hash` + `verifyHash` como hoy.

#### `src/kitchen/guards/kitchen-token.guard.ts`

Cambiar extractor de query a header:
```ts
const token = req.headers['x-kitchen-token'] as string | undefined;
```

Mantener resto de lógica (hash, timingSafeEqual, expiry check).

#### Tests

- `src/auth/auth.service.spec.ts`, `src/auth/auth.controller.spec.ts`: actualizar a nuevo contrato (login no devuelve tokens en body).
- `src/auth/guards/csrf-origin.guard.spec.ts` (nuevo): tabla de matriz origen × método.
- `src/events/events.controller.spec.ts`: cookie en vez de query.
- `src/kitchen/guards/kitchen-token.guard.spec.ts`: header en vez de query.
- e2e `test/auth.e2e-spec.ts`, `test/orders.e2e-spec.ts`, `test/kioskCreateOrder.e2e-spec.ts`: usar `supertest` con `.set('Cookie', ...)` en vez de `.set('Authorization', 'Bearer ...')`.

### Frontend (`apps/ui`)

#### `src/lib/auth.ts`

Reducir a:
```ts
const TIMEZONE_KEY = 'restaurantTimezone';

export function getRestaurantTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) ?? 'UTC';
}
export function setRestaurantTimezone(timezone: string): void {
  localStorage.setItem(TIMEZONE_KEY, timezone);
}
export function clearLocalAuthState(): void {
  localStorage.removeItem(TIMEZONE_KEY);
}
export async function isAuthenticated(): Promise<boolean> {
  const res = await fetch(`${API_URL}/v1/auth/me`, { credentials: 'include' });
  return res.ok;
}
```

`getAccessToken`, `getRefreshToken`, `setTokens`, `clearTokens` se eliminan.

`isAuthenticated()` pasa de síncrona a asíncrona (un fetch a `/v1/auth/me`). Los callers (`pages/login.astro:105`, `layouts/ProtectedLayout.astro:12`) se ajustan.

#### `src/lib/api.ts`

```ts
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',  // ← clave
  });

  if (response.status === 401 && !path.startsWith('/v1/auth/')) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
    } else {
      window.location.href = '/login';
    }
  }
  return response;
}
```

`refreshTokens()` ahora hace `POST /v1/auth/refresh` con `credentials: 'include'` y body vacío. Singleton `refreshInFlight` se mantiene (H-49 ya implementado).

#### `src/pages/login.astro`

```ts
const res = await fetch(`${API_URL}/v1/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (res.ok) {
  const { timezone } = await res.json();
  setRestaurantTimezone(timezone);
  window.location.href = '/dash';
}
```

`setTokens` desaparece.

#### `src/layouts/DashboardLayout.astro` (logout)

```ts
await fetch(`${API_URL}/v1/auth/logout`, { method: 'POST', credentials: 'include' });
clearLocalAuthState();
window.location.href = '/login';
```

#### `src/layouts/ProtectedLayout.astro`

`isAuthenticated()` ahora es async — convertir el script en `<script>` que use `top-level await` (Astro lo soporta en módulos client-side) o usar `.then`. Si el check falla, redirect a `/login`.

#### `src/components/dash/orders/OrdersPanel.tsx`

```tsx
useEffect(() => {
  if (status !== ORDERS_STATUS.OPEN || !session) return;
  const es = new EventSource(`${config.apiUrl}/v1/events/dashboard`, { withCredentials: true });
  // ...
}, [status, session]);
```

Sin `getAccessToken()`, sin `?token=`. `{ withCredentials: true }` activa el envío de cookie cross-origin.

#### `src/pages/kitchen/index.astro`

Migrar a `fetchEventSource`:

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';

await fetchEventSource(`${API_URL}/v1/events/kitchen?slug=${slug}`, {
  headers: { 'X-Kitchen-Token': token },
  onopen: async (res) => { if (res.ok) { setConnected(); loadOrders(); } },
  onerror: () => { setOffline(); },
  onmessage: (msg) => {
    if (msg.event === ORDER_EVENTS.NEW || msg.event === ORDER_EVENTS.UPDATED) loadOrders();
  },
});
```

`kitchenFetch` cambia query → header:
```ts
async function kitchenFetch(path: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Kitchen-Token': token,
      ...(options.headers ?? {}),
    },
  });
}
```

#### `src/components/kitchen/KitchenConfirmModal.tsx`

Mismo patrón: `X-Kitchen-Token` por header.

#### `apps/ui/package.json`

```bash
pnpm add @microsoft/fetch-event-source
```

#### Tests

- `OrdersPanel.test.tsx`: mock de `EventSource` no necesita token, sí simula reconexión.
- `KitchenConfirmModal.test.tsx`: el test "uses sessionStorage token when not in URL" sigue válido, ahora el token va por header.

---

## CORS, Cloudflare y entornos

### Backend `CORS_ORIGIN` env var

| Entorno | Valor |
|---------|-------|
| Prod | `https://resapp.daikulab.com` |
| Staging (si existe) | `https://staging-resapp.daikulab.com` |
| Dev local | `http://localhost:4321` |

`origin` en `enableCors` debe ser un array exacto (no wildcard) cuando `credentials: true`.

### Cloudflare

Verificar que CF **no strippea** los headers `Cookie` ni `Set-Cookie` en el tránsito CF → Railway. Por defecto los pasa; confirmar en page rules. CF tampoco debe cachear responses con `Set-Cookie` (default OK, pero confirmar).

### Cookies `Secure=true` requiere HTTPS

En prod (CF + HTTPS end-to-end), OK. En dev (`http://localhost`), `Secure=true` haría que el navegador descartara la cookie. Por eso `COOKIE_SECURE=false` en dev.

---

## Migración y deploy

### Estrategia: big-bang con re-login forzado

**Orden de deploy: backend primero, frontend después.** Hay una ventana entre ambos deploys donde el frontend viejo (en cache del navegador) sigue enviando `Authorization: Bearer` que el backend nuevo ignora. Durante esa ventana, todos los usuarios activos reciben 401 y son redirigidos a `/login` por `apiFetch`. Esto es **intencional** — no podemos evitar la fricción sin agregar lógica dual transitoria.

1. Merge a `main`.
2. Deploy backend (Railway). El backend ahora:
   - Acepta cookies en `JwtStrategy`.
   - **NO acepta `Authorization: Bearer`** (intencional — fuerza migración).
   - `POST /v1/auth/login` y `/refresh` setean cookies.
3. Ventana intermedia (~1-2 min mientras Railway despliega el frontend):
   - Usuarios con frontend viejo en cache → 401 en próxima request → `apiFetch` intenta refresh con body (formato viejo) → falla → redirect a `/login` → backend nuevo en `/login` les responde la página y al loguear setea cookies.
4. Deploy frontend (Railway). El frontend ahora:
   - Usa `credentials: 'include'`.
   - No lee/escribe localStorage para tokens.
5. Usuarios que ya re-loguearon en la ventana intermedia siguen operando sin fricción adicional.

**Ventana de fricción esperada**: 5-15 segundos por usuario activo (tiempo de redirect + nuevo login). Una sola vez. Mitigable con horario de deploy en madrugada.

**Comunicación al cliente:** anuncio con anticipación. Window de deploy en horario sin operación (madrugada).

### Rollback

Si algo falla:
- Revert del frontend deploy → frontend viejo intenta `Authorization: Bearer` que el backend nuevo ignora → todos 401. **No funciona.**
- Revert del backend → backend viejo no setea cookies, frontend nuevo no recibe nada del login → todos sin auth. **No funciona.**

Conclusión: **rollback requiere revert simultáneo de ambos servicios** (o re-deploy de versiones anteriores). Documentar el procedimiento.

### Health checks post-deploy

Smoke tests post-deploy en orden:
1. `POST /v1/auth/login` → 201 + `Set-Cookie: access_token=...; refresh_token=...`.
2. `GET /v1/auth/me` con cookie → 200.
3. `GET /v1/auth/me` sin cookie → 401.
4. `GET /v1/auth/me` con `Authorization: Bearer <jwt válido>` → 401 (confirmar Bearer descontinuado).
5. `POST /v1/orders` con cookie pero `Origin: https://malicioso.com` → 403.
6. SSE: `EventSource('/v1/events/dashboard')` con cookie → conecta.
7. SSE: `EventSource('/v1/events/dashboard')` sin cookie → 401.
8. Kitchen REST: `GET /v1/kitchen/<slug>/orders` con `X-Kitchen-Token` → 200.
9. Kitchen REST: el mismo sin header → 401.

---

## Testing strategy

### Unit (backend)

- `csrf-origin.guard.spec.ts`: matriz {GET, POST, PUT, DELETE, OPTIONS} × {origin allowlisted, no allowlisted, ausente}.
- `jwt.strategy.spec.ts`: cookie presente → user; cookie ausente → unauth; cookie con JWT inválido → unauth.
- `auth.controller.spec.ts`: login setea ambas cookies con opciones correctas; refresh lee cookie, descarta body; logout limpia cookies y revoca refresh.
- `kitchen-token.guard.spec.ts`: header presente → ok; header ausente → unauth; header con valor inválido → unauth.

### Unit (frontend)

- `apiFetch.test.ts`: incluye `credentials: 'include'`; en 401 dispara refresh; redirect en refresh fail.
- `OrdersPanel.test.tsx`: `EventSource` se abre sin token, con `withCredentials: true`.
- `KitchenConfirmModal.test.tsx`: usa header `X-Kitchen-Token`, no `?token=`.

### E2E (backend)

- `auth.e2e-spec.ts`:
  - Login → cookies en respuesta.
  - Request autenticado con cookie → 200.
  - Request con `Authorization: Bearer` → 401 (regression).
  - Refresh → cookies rotadas.
  - Logout → cookies limpiadas.
- `csrf.e2e-spec.ts` (nuevo):
  - POST con `Origin: resapp.daikulab.com` → pasa.
  - POST con `Origin: malicioso.com` → 403.
  - POST sin Origin → 403.
  - GET sin Origin → pasa.
- Tests existentes: ajustar todos los que usan `.set('Authorization', 'Bearer ...')` → `.set('Cookie', 'access_token=...')`.

### Smoke manual

Reproducir flujo completo en staging:
1. Login en el dashboard.
2. Crear orden, cobrar.
3. Reload de pantalla → sigue logueado.
4. Esperar 15 min → access expira → refresh transparente → seguir operando.
5. Cocina: cargar `/kitchen?slug=<slug>&token=<kitchenToken>` → token se mueve a sessionStorage, SSE conecta, orden aparece.
6. Logout → redirect a `/login`, intentar visitar `/dash/orders` → redirect a `/login`.

---

## ADR (Architecture Decision Record)

Crear nueva carpeta `apps/api-core/docs/adr/` con un primer ADR documentando esta decisión.

### `apps/api-core/docs/adr/README.md`

```markdown
# ADRs — apps/api-core

Architecture Decision Records: registro inmutable de decisiones arquitectónicas significativas.

Convenciones:
- Numeración secuencial de 4 dígitos: `0001-`, `0002-`, etc.
- Nombre kebab-case descriptivo: `0001-cookie-httponly-auth.md`.
- Cada ADR es inmutable una vez aceptado. Cambios → nuevo ADR que supersede el anterior.

| # | Título | Estado | Fecha |
|---|--------|--------|-------|
| 0001 | [Autenticación por cookies httpOnly](./0001-cookie-httponly-auth.md) | Aceptado | 2026-05-30 |
```

### `apps/api-core/docs/adr/0001-cookie-httponly-auth.md`

Documenta:
- **Contexto:** estado anterior (JWT en `Authorization: Bearer` + localStorage + tokens en query SSE).
- **Decisión:** migración a cookies httpOnly + Origin check (referencia al spec actual).
- **Consecuencias positivas:** mitigación XSS exfiltration, H-04 cerrado, base para H-39.
- **Consecuencias negativas:** ventana de re-login en deploy, dependencia de cookie-parser y fetch-event-source, complejidad de dev local (envs distintos prod/dev).
- **Alternativas consideradas:** SSE-ticket (rechazado), polyfill EventSource con headers (rechazado por inconsistencia entre dashboard y cocina), same-origin unificado (postergado).
- **Referencias:** spec `2026-05-30-cookie-httponly-auth-migration-design.md`, hallazgos H-04 y H-39 del audit.

El contenido completo del ADR se redacta como parte de la implementación, una vez los cambios estén mergeados, para que refleje la realidad y no la intención.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Cloudflare strippea cookies | Baja | Alto (auth quebrada en prod) | Validar en staging con CF antes del deploy. CF por defecto pasa cookies; confirmar reglas. |
| Origin check rechaza tráfico legítimo (postman, curl interno, healthchecks) | Media | Medio | Whitelistear `OPTIONS` y métodos seguros sin Origin. Para healthchecks internos (Railway probe), usar paths fuera de `/v1/*` o `OPTIONS` con Origin vacío. |
| `fetch-event-source` se comporta distinto al `EventSource` nativo (reconexión, backoff) | Media | Bajo | Smoke test extenso en cocina antes del deploy. Mantener fallback de "recargar página" si el stream se cae. |
| Dev local diverge de prod (cookies sin Domain) y oculta bugs | Media | Medio | Documentar en `apps/ui/README.md` y `apps/api-core/docs/environments.md` la diferencia. Smoke test en staging es obligatorio antes de deploy a prod. |
| Tests e2e existentes rompen masivamente | Alta | Bajo (esperado) | Helper compartido en `test/helpers/auth.ts` para login → cookies; refactorizar tests en una sola pasada. |
| Usuarios reportan "me sacó del sistema" tras deploy | Alta | Bajo | Comunicación previa. Deploy en madrugada. Documentar en release notes que el primer login post-deploy es esperado. |

---

## Implementation tracker

Se actualizará a medida que avance la implementación.

### Backend

| Cambio | Archivos | Estado |
|--------|----------|--------|
| Añadir `cookie-parser` | `package.json` | ⏳ Pendiente |
| Configurar `app.use(cookieParser())` | `main.ts` | ⏳ Pendiente |
| Env vars `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_*_MAX_AGE` | `config/index.ts`, `environments.md` | ⏳ Pendiente |
| `JwtStrategy` extractor cookie-only | `auth/strategies/jwt.strategy.ts` | ⏳ Pendiente |
| `AuthController.login` setea cookies | `auth/auth.controller.ts`, `auth.service.ts` | ⏳ Pendiente |
| `AuthController.refresh` lee cookie | `auth/auth.controller.ts`, `dto/refresh-token.dto.ts` | ⏳ Pendiente |
| `AuthController.logout` clearCookie | `auth/auth.controller.ts` | ⏳ Pendiente |
| `CsrfOriginGuard` (nuevo) | `auth/guards/csrf-origin.guard.ts` | ⏳ Pendiente |
| Registrar `CsrfOriginGuard` como `APP_GUARD` | `app.module.ts` | ⏳ Pendiente |
| `EventsController.dashboard` lee cookie vía JwtAuthGuard | `events/events.controller.ts` | ⏳ Pendiente |
| `EventsController.kitchen` lee `X-Kitchen-Token` header | `events/events.controller.ts` | ⏳ Pendiente |
| `KitchenTokenGuard` extractor header | `kitchen/guards/kitchen-token.guard.ts` | ⏳ Pendiente |
| Specs unit actualizados | `*.spec.ts` | ⏳ Pendiente |
| Specs e2e actualizados | `test/*.e2e-spec.ts` | ⏳ Pendiente |
| `csrf.e2e-spec.ts` (nuevo) | `test/csrf.e2e-spec.ts` | ⏳ Pendiente |

### Frontend

| Cambio | Archivos | Estado |
|--------|----------|--------|
| Añadir `@microsoft/fetch-event-source` | `apps/ui/package.json` | ⏳ Pendiente |
| Reducir `lib/auth.ts` (eliminar token storage) | `apps/ui/src/lib/auth.ts` | ⏳ Pendiente |
| `apiFetch` con `credentials: 'include'` | `apps/ui/src/lib/api.ts` | ⏳ Pendiente |
| `pages/login.astro` no llama `setTokens` | `apps/ui/src/pages/login.astro` | ⏳ Pendiente |
| `DashboardLayout` logout llama backend | `apps/ui/src/layouts/DashboardLayout.astro` | ⏳ Pendiente |
| `ProtectedLayout` `isAuthenticated` async | `apps/ui/src/layouts/ProtectedLayout.astro` | ⏳ Pendiente |
| `OrdersPanel` EventSource con `withCredentials` | `apps/ui/src/components/dash/orders/OrdersPanel.tsx` | ⏳ Pendiente |
| Kitchen REST con header | `apps/ui/src/pages/kitchen/index.astro` | ⏳ Pendiente |
| Kitchen SSE con fetchEventSource | `apps/ui/src/pages/kitchen/index.astro` | ⏳ Pendiente |
| `KitchenConfirmModal` header | `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx` | ⏳ Pendiente |
| Tests frontend actualizados | `*.test.tsx` | ⏳ Pendiente |

### Infraestructura

| Cambio | Archivos | Estado |
|--------|----------|--------|
| Railway env vars (backend) prod | Railway dashboard | ⏳ Pendiente |
| Railway env vars (backend) staging | Railway dashboard | ⏳ Pendiente |
| Verificar Cloudflare pasa cookies | CF dashboard | ⏳ Pendiente |
| `docker-compose.yml` env vars dev | `docker-compose.yml` | ⏳ Pendiente |

### Documentación

| Cambio | Archivos | Estado |
|--------|----------|--------|
| `apps/api-core/docs/adr/README.md` | nuevo | ⏳ Pendiente |
| `apps/api-core/docs/adr/0001-cookie-httponly-auth.md` | nuevo | ⏳ Pendiente |
| `apps/api-core/docs/environments.md` actualizado | existente | ⏳ Pendiente |
| `apps/api-core/src/auth/auth.module.info.md` actualizado | existente | ⏳ Pendiente |
| `apps/ui/README.md` actualizado (auth flow) | existente | ⏳ Pendiente |
| Audit findings H-04 marcado ✅ | `2026-05-24-orders-cash-kitchen-audit-findings.md` | ⏳ Pendiente |

---

## Open questions

- **Healthchecks Railway**: si Railway hace probes a `/v1/health`, ese endpoint necesita estar exento de `CsrfOriginGuard` (Origin vacío). Confirmar path y configurar.
- **Activación de cuenta**: tras activar (`/activate?token=...`), ¿el usuario queda automáticamente logueado (cookie seteada por el endpoint de activación) o se le redirige a `/login`? Mantener comportamiento actual hasta confirmar.
- **`/v1/auth/me`** sigue siendo el endpoint que `isAuthenticated()` consulta. No requiere cambios pero verificar que tiene rate limit razonable (puede ser llamado al cargar cada página).
