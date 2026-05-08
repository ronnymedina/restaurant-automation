# Account Recovery & Wizard UX — Design Spec

**Date:** 2026-05-08
**Branch:** error-prod-prisma
**Scope:** api-core (backend) + ui (frontend)

---

## Problem

1. **Wizard UX**: After completar el registro (Step3), el usuario queda atrapado — no hay botón para ir al login ni a ningún otro lugar.
2. **Recovery gap**: Solo existía `POST /v1/onboarding/resend-activation` para reenviar el email de activación a cuentas inactivas. No había flujo para cuentas activas que olvidaron su contraseña.

---

## Solution Overview

Dos endpoints nuevos en el módulo `auth` reemplazan el endpoint de onboarding, con lógica compartida en `UsersService`. El frontend añade un botón de reenvío en Step3 y una nueva página de reset de contraseña.

**Sin migración Prisma** — se reutiliza el campo `activationToken` existente en `User`.

---

## Backend

### Endpoints eliminados

| Módulo | Ruta | Motivo |
|--------|------|--------|
| `onboarding` | `POST /v1/onboarding/resend-activation` | Movido a auth con lógica extendida |

### Endpoints nuevos en `auth`

#### `POST /v1/auth/resend-activation`
- **Auth:** Público
- **Rate limit:** 3 req/email en ventana de 15 min
- **Body:** `{ email: string }`
- **Flujo:**
  1. Busca usuario por email — si no existe responde `200` (no revela enumeración)
  2. Si `isActive: true` → lanza `UserAlreadyActiveException` (409)
  3. Genera nuevo `activationToken` (UUID), persiste con `refreshActivationToken()`
  4. Envía email de activación — link a `/activate?token=xxx`
  5. Responde `200 { message: string }`

| Caso | Status | Code |
|------|--------|------|
| Reenvío exitoso | 200 | — |
| Email no registrado | 200 | — (seguridad) |
| Cuenta ya activa | 409 | `USER_ALREADY_ACTIVE` |
| Rate limit excedido | 429 | — |

---

#### `POST /v1/auth/recover-password`
- **Auth:** Público
- **Rate limit:** 3 req/email en ventana de 15 min
- **Body:** `{ email: string }`
- **Flujo:**
  1. Busca usuario por email — si no existe responde `200` (no revela enumeración)
  2. Si `isActive: false` → lanza `InactiveAccountException` (403)
  3. Genera nuevo `activationToken` (UUID), persiste con `refreshActivationToken()`
  4. Envía email de reset de contraseña — link a `/reset-password?token=xxx`
  5. Responde `200 { message: string }`

| Caso | Status | Code |
|------|--------|------|
| Email enviado | 200 | — |
| Email no registrado | 200 | — (seguridad) |
| Cuenta no activada | 403 | `ACCOUNT_INACTIVE` |
| Rate limit excedido | 429 | — |

---

#### `PUT /v1/auth/reset-password`
- **Auth:** Público
- **Body:** `{ token: string, password: string }` (password mínimo 8 chars)
- **Flujo:**
  1. Llama `UsersService.resetPassword(token, password)`
  2. Responde `200 { email: string }`

| Caso | Status | Code |
|------|--------|------|
| Reset exitoso | 200 | — |
| Token inválido o expirado | 400 | `INVALID_ACTIVATION_TOKEN` |
| Cuenta no activa | 400 | `ACCOUNT_INACTIVE` |

---

### UsersService — cambios

```typescript
// Método privado compartido — hash + update BD
private async commonActivationOrResetAccount(userId: string, password: string): Promise<User>

// Actualizado — llama commonActivationOrResetAccount en lugar de lógica inline
async activateUser(token: string, password: string): Promise<User>
  // guarda: !user → InvalidActivationTokenException
  // guarda: user.isActive → UserAlreadyActiveException

// Nuevo — reset para cuentas activas
async resetPassword(token: string, password: string): Promise<User>
  // guarda: !user → InvalidActivationTokenException
  // guarda: !user.isActive → InactiveAccountException
```

---

### Tests

| Acción | Archivo |
|--------|---------|
| Eliminar tests de resend-activation | `test/onboarding/resend-activation.e2e-spec.ts` |
| Nuevos tests e2e resend-activation | `test/auth/resend-activation.e2e-spec.ts` |
| Nuevos tests e2e recover-password | `test/auth/recover-password.e2e-spec.ts` |
| Nuevos tests e2e reset-password | `test/auth/reset-password.e2e-spec.ts` |
| Actualizar unit tests UsersService | `src/users/users.service.spec.ts` |

---

### Module info updates

- `auth.module.info.md` — agregar los 3 nuevos endpoints
- `onboarding.module.info.md` — eliminar sección de resend-activation

---

## Frontend

### Step3Success — cambios

1. **Botón "Ir al login"** — link a `/login`, siempre visible
2. **Botón "No me llegó el correo"** — llama `POST /v1/auth/resend-activation` con el email del wizard
   - En éxito: mensaje inline "Correo reenviado. Revisa tu bandeja." + botón deshabilitado temporalmente
   - En error `USER_ALREADY_ACTIVE`: mensaje "Tu cuenta ya está activa, ve al login"
   - En error genérico: mensaje de error inline

El handler `onResend` se define en `OnboardingWizard` (patrón existente) y se pasa como prop a `Step3Success`.

### Nueva página `/reset-password.astro`

Clon de `/activate.astro` con las siguientes diferencias:
- Título: "Restablecer contraseña"
- Subtítulo: "Ingresa tu nueva contraseña"
- Llama `PUT /v1/auth/reset-password` en lugar de `PUT /v1/users/activate`
- En éxito: muestra "Contraseña actualizada" + link al login

### Error messages (ui/src/lib/error-messages.ts)

Agregar:
```
INVALID_ACTIVATION_TOKEN: 'El enlace no es válido o ya fue utilizado.'
```

---

## Flujo completo por caso de uso

```
Registro nuevo
  → Step3: "No me llegó el correo" → POST /v1/auth/resend-activation
  → Email → /activate?token=xxx → PUT /v1/users/activate → login

Olvidé mi contraseña (cuenta activa)
  → POST /v1/auth/recover-password
  → Email → /reset-password?token=xxx → PUT /v1/auth/reset-password → login
```

---

## Out of scope

- Link "¿Olvidaste tu contraseña?" en la página de login (se puede agregar después)
- Expiración de `activationToken` (no existe hoy, se mantiene sin cambio)
