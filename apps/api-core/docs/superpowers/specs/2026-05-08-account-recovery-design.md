# Account Recovery & Wizard UX — Design Spec

**Date:** 2026-05-08
**Branch:** error-prod-prisma
**Scope:** api-core (backend) + ui (frontend)

---

## Problem

1. **Wizard UX**: Después de completar el registro (Step3), el usuario queda atrapado — no hay botón para ir al login ni salida alguna. Si el email no llegó y el usuario cierra la pestaña, no tiene forma de volver a pedirlo.
2. **Recovery gap**: Solo existía `POST /v1/onboarding/resend-activation` para reenviar el email de activación a cuentas inactivas. No había flujo para cuentas activas que olvidaron su contraseña.
3. **Enumeración de usuarios**: Exponer errores distintos por estado de cuenta (activa/inactiva) revela información sobre los usuarios registrados.

---

## Solution Overview

Un solo endpoint público `POST /v1/auth/recover` reemplaza el endpoint de onboarding y cubre ambos casos internamente. Siempre responde `200` — el cliente nunca sabe si el email existe ni cuál es el estado de la cuenta. El frontend tiene una única página `/recover.astro` como punto de entrada.

**Sin migración Prisma** — se reutiliza el campo `activationToken` existente en `User`.

---

## Backend

### Endpoints eliminados

| Módulo | Ruta | Motivo |
|--------|------|--------|
| `onboarding` | `POST /v1/onboarding/resend-activation` | Reemplazado por `POST /v1/auth/recover` |

### Endpoints nuevos en `auth`

#### `POST /v1/auth/recover`
- **Auth:** Público
- **Rate limit:** 3 req/email en ventana de 15 min (clave: email del body)
- **Body:** `{ email: string }`
- **Flujo:**
  1. Busca usuario por email — si no existe, **no hace nada** y responde `200`
  2. Si `isActive: false` → genera nuevo `activationToken` (UUID), persiste, envía email de activación — link a `/activate?token=xxx`
  3. Si `isActive: true` → genera nuevo `activationToken` (UUID), persiste, envía email de reset de contraseña — link a `/reset-password?token=xxx`
  4. Siempre responde `200 { message: "Si el correo está registrado, recibirás un email en breve." }`

| Caso | Status | Code |
|------|--------|------|
| Cualquier resultado | 200 | — |
| Rate limit excedido | 429 | — |

> **Seguridad:** La respuesta es siempre idéntica — no se revela si el email existe ni si la cuenta está activa o inactiva.

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
| Token inválido | 400 | `INVALID_ACTIVATION_TOKEN` |
| Cuenta no activa | 400 | `ACCOUNT_INACTIVE` |

---

### UsersService — cambios

```typescript
// Método privado compartido — hash + update BD
private async commonActivationOrResetAccount(userId: string, password: string): Promise<User>
  // bcrypt.hash(password)
  // userRepository.update(userId, { passwordHash, isActive: true, activationToken: null })

// Actualizado — llama commonActivationOrResetAccount en lugar de lógica inline
async activateUser(token: string, password: string): Promise<User>
  // guarda: !user → InvalidActivationTokenException
  // guarda: user.isActive → UserAlreadyActiveException
  // → commonActivationOrResetAccount(user.id, password)

// Nuevo — reset para cuentas activas
async resetPassword(token: string, password: string): Promise<User>
  // guarda: !user → InvalidActivationTokenException
  // guarda: !user.isActive → InactiveAccountException
  // → commonActivationOrResetAccount(user.id, password)
```

---

### Tests

| Acción | Archivo |
|--------|---------|
| Eliminar tests de resend-activation | `test/onboarding/resend-activation.e2e-spec.ts` |
| Nuevos tests e2e recover | `test/auth/recover.e2e-spec.ts` |
| Nuevos tests e2e reset-password | `test/auth/reset-password.e2e-spec.ts` |
| Actualizar unit tests UsersService | `src/users/users.service.spec.ts` |

---

### Module info updates

- `auth.module.info.md` — agregar `POST /v1/auth/recover` y `PUT /v1/auth/reset-password`
- `onboarding.module.info.md` — eliminar sección de resend-activation

---

## Frontend

### Step3Success — cambios

1. **Botón "Ir al login"** — link a `/login`, siempre visible
2. **Botón "No me llegó el correo"** — llama `POST /v1/auth/recover` con el email del wizard
   - En éxito (siempre 200): mensaje inline "Si el correo está registrado, recibirás un email en breve." + botón deshabilitado temporalmente
   - En error de red: mensaje de error genérico inline

El handler `onResend` se define en `OnboardingWizard` (patrón existente) y se pasa como prop a `Step3Success`.

### Nueva página `/recover.astro`

Página pública accesible en cualquier momento. Único punto de entrada para recuperación de cuenta.

- Campo: email
- Llama `POST /v1/auth/recover`
- En éxito: muestra mensaje genérico "Si el correo está registrado, recibirás un email en breve."
- No revela nada sobre el estado de la cuenta
- Link "Volver al login" siempre visible

### Nueva página `/reset-password.astro`

Clon de `/activate.astro` con las siguientes diferencias:
- Título: "Restablecer contraseña"
- Subtítulo: "Ingresa tu nueva contraseña"
- Llama `PUT /v1/auth/reset-password` en lugar de `PUT /v1/users/activate`
- En éxito: muestra "Contraseña actualizada" + link al login

### Error messages (`ui/src/lib/error-messages.ts`)

Agregar:
```
INVALID_ACTIVATION_TOKEN: 'El enlace no es válido o ya fue utilizado.'
```

---

## Flujo completo por caso de uso

```
Registro nuevo — email no llegó, usuario aún en Step3
  → Botón "No me llegó el correo" → POST /v1/auth/recover
  → Email de activación → /activate?token=xxx → PUT /v1/users/activate → login

Registro nuevo — usuario cerró el browser sin activar
  → /recover.astro → ingresa email → POST /v1/auth/recover
  → Email de activación → /activate?token=xxx → PUT /v1/users/activate → login

Olvidé mi contraseña (cuenta activa)
  → /recover.astro → ingresa email → POST /v1/auth/recover
  → Email de reset → /reset-password?token=xxx → PUT /v1/auth/reset-password → login
```

---

## Out of scope

- Link "¿Olvidaste tu contraseña?" en la página de login (se puede agregar después usando `/recover.astro`)
- Expiración de `activationToken` (no existe hoy, se mantiene sin cambio)
