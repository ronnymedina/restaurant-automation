# Distribución self-hosted con Docker

**Fecha:** 2026-06-17
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Reemplaza a:** los specs de packaging desktop/Electron
(`2026-03-10-desktop-distribution-design.md`,
`pending-2026-03-18-desktop-packaging-design.md`,
`pending-2026-03-25-electron-app-dev-mode-design.md`,
`2026-03-26-electron-macos-packaging-design.md`). El enfoque Electron / instalador
de Windows / Servicio de Windows queda descartado para esta línea de trabajo.

## Objetivo

Permitir que cualquier persona **autohospede** la plataforma en su propia
computadora mediante **Docker**, sin depender de la nube. Se publican imágenes
Docker prearmadas de `api-core` y `ui`, y se entrega un `docker-compose.yml` +
`.env.example` + una guía paso a paso (base de un post). El sistema es **gratis**.

El público objetivo no es técnico, por lo que la experiencia debe minimizar pasos
manuales; la fricción restante se cubre con la guía.

## Decisiones tomadas (resumen del brainstorming)

| Tema | Decisión |
|------|----------|
| Modelo | Stack completo **on-premise** en la PC del usuario (offline). |
| Distribución | Imágenes Docker `prod` de `api-core` + `ui`, **publicadas a mano** en **GHCR público**. |
| Base de datos | **PostgreSQL** en contenedor (imagen oficial), no SQLite, no Postgres embebido. |
| Topología | La PC instalada es el **servidor LAN**; otros dispositivos (tótem, cocina, caja) entran por su IP. |
| Migraciones | **Automáticas** al arrancar api-core (`prisma migrate deploy`). |
| Provisioning | **Onboarding interactivo** en la UI: crea restaurante + admin + categoría por defecto. |
| Productos | **Manuales**. Sin onboarding por IA (Gemini opcional/deshabilitado). |
| Activación de cuenta | **Sin email**: la respuesta del onboarding incluye el link de activación y la UI lo muestra. |
| Email (Resend) | **Opcional** (`RESEND_API_KEY` no requerida). |
| Descartado | Electron, tray, Servicio de Windows, Postgres portable, NSIS, firma de código, auto-updater de Electron, cámara, license-server. |

## Arquitectura

Tres contenedores orquestados por un `docker-compose.yml`:

```
┌─────────────────────────────────────────────────────────┐
│  PC servidor (LAN, IP estática recomendada)              │
│                                                          │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────────┐  │
│  │ postgres │◄──┤  api-core   │   │  ui (nginx)      │  │
│  │  :5432   │   │  :3000      │   │  :8080 → SPA     │  │
│  │ (interno)│   │  migrate +  │   │  inyecta         │  │
│  │          │   │  server     │   │  PUBLIC_API_URL  │  │
│  └──────────┘   └─────────────┘   └──────────────────┘  │
│       ▲ red interna de Docker          ▲                 │
└───────┼────────────────────────────────┼────────────────┘
        │                                 │
   (no expuesto a LAN)        Dispositivos LAN: tótem, cocina,
                              caja, dashboard → http://<IP>:8080
                              (SPA llama a la API en http://<IP>:3000)
```

- **postgres**: imagen oficial `postgres:17-alpine`. Datos en un volumen Docker.
  Solo accesible dentro de la red de Docker (no se publica a la LAN).
- **api-core**: imagen `prod` ya existente. Al arrancar corre
  `prisma migrate deploy` y luego `node dist/src/main`. Expone `:3000` a la LAN.
- **ui**: imagen `prod` ya existente (nginx). Sirve la SPA e inyecta
  `PUBLIC_API_URL` en runtime vía el `entrypoint.sh` (reemplaza el placeholder
  `__PLACEHOLDER_API_URL__`). Expone `:8080` a la LAN.

### Por qué dos imágenes (y no same-origin)

El deploy actual de Railway ya corre `ui` y `api` en orígenes separados con CORS +
cookies, así que el modelo de dos contenedores **ya está probado**. Como sitio y
API comparten el mismo eTLD+1 (la IP del servidor), las cookies `SameSite=Lax`
funcionan entre puertos distintos sobre HTTP de LAN; CORS se habilita vía
`CORS_ORIGIN`. Un reverse proxy de un solo puerto (same-origin) queda como posible
mejora futura, no es necesario para v1.

### Configuración por `.env`

El usuario fija **una sola vez** la IP LAN del servidor; el resto se deriva:

```
SERVER_IP=192.168.1.50          # IP LAN de la PC servidor
API_PORT=3000
UI_PORT=8080

# Derivados (en el compose):
PUBLIC_API_URL=http://${SERVER_IP}:${API_PORT}   # baked en la SPA en runtime
FRONTEND_URL=http://${SERVER_IP}:${UI_PORT}       # usado en el link de activación
CORS_ORIGIN=http://${SERVER_IP}:${UI_PORT}

# Requeridos:
JWT_SECRET=<generado por el usuario>
POSTGRES_PASSWORD=<generado por el usuario>

# Opcionales (si se omiten, las features degradan con gracia):
RESEND_API_KEY=          # emails de activación/reset; si falta, link se muestra en la UI
GEMINI_API_KEY=          # onboarding por IA; si falta, productos solo manuales
```

> **Requisito documentado:** configurar **IP estática o reserva DHCP** en el router
> para la PC servidor. Si la IP cambia, `PUBLIC_API_URL`/`FRONTEND_URL`/`CORS_ORIGIN`
> dejan de coincidir y los dispositivos pierden conexión.

## Flujo de primer arranque

1. `docker compose up -d` → levanta `postgres`, espera healthcheck.
2. `api-core` arranca → `prisma migrate deploy` (vía `commands/execute-migrations.sh`)
   → `node dist/src/main`. La BD queda con el esquema al día sin intervención.
3. `ui` arranca → `entrypoint.sh` inyecta `PUBLIC_API_URL` → nginx sirve la SPA.
4. El dueño abre `http://<IP>:8080`, va al **onboarding** y crea restaurante + admin.
5. Como el email está deshabilitado, la respuesta del onboarding trae el **link de
   activación**; la UI lo muestra. El dueño hace clic → fija su contraseña → cuenta
   activa.
6. El dueño agrega productos **manualmente** desde el dashboard.
7. Los dispositivos de la LAN (tótem, cocina) entran por `http://<IP>:8080`.

## Nueva lógica: activación sin email

Hoy el `EmailService` ya degrada con gracia: sin `RESEND_API_KEY`, **loguea** la
URL de activación (`/activate?token=...`) y devuelve `true`. Pero ese link solo
queda en los logs del contenedor — inviable para un usuario no técnico.

**Cambio:** cuando el email está deshabilitado, el onboarding debe **devolver el
activation token/URL en la respuesta** del endpoint, y la UI debe **mostrarlo** en
pantalla tras completar el alta ("Activá tu cuenta aquí").

Consideraciones:
- Solo exponer el link cuando el email está efectivamente deshabilitado
  (sin `RESEND_API_KEY`). Con email configurado, el comportamiento actual no cambia
  (el link va por correo y **no** se expone en la respuesta).
- El token sigue siendo de un solo uso y se limpia al activar (lógica existente en
  `users.service.ts`).

## Componentes a modificar / crear

### api-core
- **Onboarding**: incluir el activation token/URL en la respuesta cuando el email
  está deshabilitado. Tocar `onboarding.service.ts`,
  `serializers/onboarding-response.serializer.ts` y el DTO/contrato de respuesta.
- **Arranque con migraciones**: asegurar que el contenedor corra
  `prisma migrate deploy` antes de `node dist/src/main` (vía `command` del compose
  o ajuste del `CMD`/entrypoint, reutilizando `commands/execute-migrations.sh`).
- **IA opcional**: confirmar que sin `GEMINI_API_KEY` el onboarding crea
  restaurante + admin + categoría por defecto sin requerir fotos ni IA (productos
  se cargan manualmente después).

### ui
- **Pantalla de onboarding**: mostrar el link de activación cuando la respuesta lo
  incluya. Mapear el nuevo estado en `error-messages.ts`/textos friendly si aplica.

### Documentación (a actualizar por la nueva lógica)
- `apps/api-core/src/onboarding/onboarding.module.info.md` — documentar el modo
  self-hosted y la activación vía link en la respuesta.
- `apps/api-core/src/onboarding/onboarding.flow.mmd` — reflejar la rama "email
  deshabilitado → link en respuesta".
- Catálogo de email/errores del onboarding
  (`apps/api-core/docs/onboarding-error-mapping.md` y doc de flujo de email/reenvío).

### Entregables nuevos
- `docker-compose.yml` de self-host (raíz o `deploy/`), referenciando imágenes GHCR
  (`ghcr.io/<usuario>/restaurants-api-core` y `...-ui`) — separado del
  `docker-compose.yml` de desarrollo actual.
- `.env.example` para self-host (con `SERVER_IP`, secretos y opcionales).
- **Guía de instalación** en `docs/` (base del post): requisitos (Docker Desktop,
  IP estática), pasos `docker compose up -d`, onboarding, activación, alta de
  productos, troubleshooting.
- **Instrucciones de build/push manual a GHCR**: cómo construir las imágenes `prod`
  y publicarlas; recordatorio de **marcar los packages como públicos** (en GHCR
  nacen privados).

## Fuera de alcance (futuro)

- Reverse proxy de un solo puerto (same-origin, sin editar IP en `.env`).
- Auto-actualización (hoy: actualizar = `docker compose pull && up -d`, documentado
  en la guía).
- Validación de licencia (license-server).
- Firma de código (no aplica: ya no hay `.exe`).
- CI/CD para publicar imágenes (v1 es publicación manual).
- Estrategia de backups del volumen de Postgres + uploads (mencionar en la guía
  como recomendación, sin automatizar).

## Verificación

- `docker compose up -d` desde cero levanta los tres servicios; api-core aplica
  migraciones solo y responde `GET /health` 200.
- Onboarding desde la UI sin `RESEND_API_KEY` crea la cuenta y **muestra el link de
  activación**; el link activa la cuenta y permite login.
- Un segundo dispositivo en la LAN abre `http://<IP>:8080` y opera (kiosko/cocina).
- Sin `GEMINI_API_KEY`, el onboarding no falla y los productos se cargan a mano.
