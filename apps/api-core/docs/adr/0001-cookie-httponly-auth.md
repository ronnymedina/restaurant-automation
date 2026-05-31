# ADR 0001 — Autenticación por cookies httpOnly

**Estado:** Aceptado
**Fecha:** 2026-05-30
**Hallazgos atendidos:** H-04 (tokens en query string SSE).
**Spec de diseño:** `apps/api-core/docs/superpowers/specs/2026-05-30-cookie-httponly-auth-migration-design.md`
**Plan de implementación:** `apps/api-core/docs/superpowers/plans/2026-05-30-cookie-httponly-auth-migration.md`

## Contexto

Antes de esta decisión:
- El JWT viajaba como `Authorization: Bearer <jwt>` y se almacenaba en `localStorage` (`apps/ui/src/lib/auth.ts`). Cualquier XSS o dependencia npm comprometida podía leerlo y exfiltrarlo. El atacante mantenía el token los 15 minutos del TTL del access, o más si renovaba con el refresh.
- El refresh token viajaba en el body de `POST /v1/auth/refresh`.
- SSE del dashboard recibía el JWT por `?token=` en la URL — visible en logs de nginx/Cloudflare, `Referer` saliente, historial del navegador y extensiones.
- SSE de cocina recibía el `kitchenToken` por `?slug=&token=` con los mismos problemas.

## Decisión

1. Mover el JWT y el refresh a **cookies `httpOnly` `Secure` `SameSite=Lax`**:
   - `access_token` (Path=/, Max-Age=15 min).
   - `refresh_token` (Path=/v1/auth, Max-Age=7 días).
   - En producción `Domain=.daikulab.com`; en dev sin atributo de domain.
2. Eliminar el extractor `Authorization: Bearer` en `JwtStrategy`. Las únicas formas de autenticarse son la cookie (sesión de usuario) o `X-Kitchen-Token` (token de dispositivo de cocina).
3. Añadir `CsrfOriginGuard` global que valida el header `Origin` contra una allowlist (`CORS_ORIGIN` env). Defensa en capas con `SameSite=Lax` (browser-level) más Origin check (server-level) para cubrir el caso de un subdominio comprometido bajo `daikulab.com`.
4. SSE del dashboard pasa a usar `JwtAuthGuard` + cookie (vía `EventSource(..., { withCredentials: true })` en el cliente).
5. SSE y REST de cocina pasan a usar `X-Kitchen-Token` en header. El cliente reemplaza `EventSource` nativo por `@microsoft/fetch-event-source` solo en la pantalla de cocina (que necesita custom headers para SSE).

## Consecuencias positivas

- **Mitigación de exfiltración por XSS:** un script malicioso ya no puede leer el JWT (no está en `localStorage` ni accesible desde JS). Sigue pudiendo hacer requests autenticadas mientras la pestaña está abierta, pero sin persistencia ni capacidad de exfiltrar.
- **Cierre de H-04:** ningún token aparece en URL, logs, Referer o historial.
- **Base para H-39 (SSR del dashboard):** el backend puede validar la cookie server-side en una futura migración a Astro `hybrid`/`server`.
- **CSRF defendido en dos capas** (`SameSite=Lax` + Origin allowlist).
- **Contrato de auth más limpio:** un solo extractor en `JwtStrategy`, sin lógica de doble-fuente.

## Consecuencias negativas

- **Ventana de fricción en el deploy:** los usuarios activos reciben 401 una vez y deben re-loguearse (las sesiones viejas en `localStorage` ya no funcionan). Mitigado con anuncio previo y deploy en madrugada.
- **Dependencias nuevas:** `cookie-parser` (backend), `@microsoft/fetch-event-source` (frontend, ~5KB).
- **Divergencia dev/prod:** `Secure=true` requiere HTTPS, por lo que dev usa `COOKIE_SECURE=false`. Los smoke tests obligatoriamente pasan por staging antes de prod.
- **e2e tests reescritos:** ~30 archivos migrados de `.set('Authorization', ...)` a `.set('Cookie', ...).set('Origin', ...)`. Mantenimiento futuro debe seguir el mismo patrón.

## Alternativas consideradas

- **SSE-ticket de corta duración** (un endpoint que devuelve un token efímero específico para SSE, que viaja en la URL): rechazado por complejidad y porque las cookies resuelven el problema directamente sin endpoint adicional.
- **Polyfill `EventSource` con headers en TODO el frontend**: rechazado por inconsistencia — el dashboard puede seguir usando el `EventSource` nativo gracias a la cookie automática; solo cocina necesita el polyfill.
- **Same-origin unificado** (montar UI y API bajo un único hostname): postergado. Implicaría infraestructura más invasiva; el Origin check + `SameSite=Lax` cubre el riesgo actual sin tocar el routing de hostnames.

## Referencias

- Auditoría base: `apps/api-core/docs/superpowers/specs/2026-05-24-orders-cash-kitchen-audit-findings.md` (H-04).
- Spec de diseño: `2026-05-30-cookie-httponly-auth-migration-design.md`.
- Plan de implementación: `2026-05-30-cookie-httponly-auth-migration.md`.
- Implementación: PR de la rama `feat/auth-cookie-httponly`.
