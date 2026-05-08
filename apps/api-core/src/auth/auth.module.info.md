
### Auth (auth)

Autenticación basada en JWT con refresh token rotation. Gestiona login, renovación de tokens, perfil y logout.
Los access tokens tienen vida corta; los refresh tokens se rotan en cada uso — el token consumido se elimina y se emite uno nuevo.

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/v1/auth/login` | Público | Autenticar usuario, obtener tokens |
| `POST` | `/v1/auth/refresh` | Público | Rotar refresh token, obtener nuevos tokens |
| `GET` | `/v1/auth/me` | Bearer JWT | Obtener perfil del usuario autenticado |
| `POST` | `/v1/auth/logout` | Bearer JWT | Revocar todos los refresh tokens del usuario |
| `POST` | `/v1/auth/recover` | Público | Solicitar recuperación (activa o reset) |
| `PUT` | `/v1/auth/reset-password` | Público | Restablecer contraseña con token |

---

#### Login — `POST /v1/auth/login`

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `email` | string | ✅ | email válido |
| `password` | string | ✅ | mínimo 8 caracteres |

**Flujo interno:**

1. Busca usuario por email — lanza `INVALID_CREDENTIALS` si no existe o no tiene `passwordHash`
2. Verifica contraseña con bcrypt — lanza `INVALID_CREDENTIALS` si no coincide
3. Verifica `isActive: true` — lanza `ACCOUNT_INACTIVE` si está inactiva
4. Verifica que el restaurante asociado existe
5. Genera `accessToken` (JWT firmado) + `refreshToken` (UUID persistido en DB)

| Caso | Status | Code |
|---|---|---|
| Login exitoso | 200 | — |
| Email o contraseña incorrectos | 401 | `INVALID_CREDENTIALS` |
| Cuenta no activada | 403 | `ACCOUNT_INACTIVE` |
| Datos inválidos (email mal formado, etc.) | 400 | — |

---

#### Refresh — `POST /v1/auth/refresh`

| Campo | Tipo | Requerido |
|---|---|---|
| `refreshToken` | string | ✅ |

**Flujo interno:**

1. Busca el token en DB — lanza `INVALID_REFRESH_TOKEN` si no existe
2. Verifica que no esté expirado — elimina y lanza si expiró
3. Elimina el token usado (rotación)
4. Verifica que el usuario y su restaurante existen
5. Genera nuevo `accessToken` + `refreshToken`

**Nota:** El delete usa `deleteMany` (en lugar de `delete`) para tolerar requests concurrentes que usen el mismo token simultáneamente sin lanzar P2025.

| Caso | Status | Code |
|---|---|---|
| Refresh exitoso | 200 | — |
| Token no encontrado o expirado | 401 | `INVALID_REFRESH_TOKEN` |

---

#### Me — `GET /v1/auth/me`

Retorna el perfil del usuario autenticado extraído del JWT.

**Respuesta 200:**
```json
{
  "id": "user-uuid",
  "email": "chef@restaurant.com",
  "role": "MANAGER",
  "restaurant": {
    "id": "restaurant-uuid",
    "name": "Mi Restaurante",
    "slug": "mi-restaurante"
  }
}
```

---

#### Logout — `POST /v1/auth/logout`

Revoca **todos** los refresh tokens del usuario (invalida todas las sesiones activas).

**Respuesta 200:**
```json
{ "message": "Logged out successfully" }
```

---

#### Recover — `POST /v1/auth/recover`

**Rate limit:** 3 requests por email en ventana de 15 minutos. La clave de throttle es el email del body.

| Campo | Tipo | Requerido |
|---|---|---|
| `email` | string | ✅ |

**Flujo interno:**
1. Si el email no existe — no hace nada, responde 200
2. Si `isActive: false` → genera nuevo `activationToken`, envía email de activación (link a `/activate?token=xxx`)
3. Si `isActive: true` → genera nuevo `activationToken`, envía email de reset de contraseña (link a `/reset-password?token=xxx`)
4. Siempre responde `200 { message: "Si el correo está registrado, recibirás un email en breve." }`

| Caso | Status | Code |
|---|---|---|
| Cualquier resultado | 200 | — |
| Rate limit excedido | 429 | — |

> **Seguridad:** La respuesta es siempre idéntica — no revela si el email existe ni el estado de la cuenta.

---

#### Reset Password — `PUT /v1/auth/reset-password`

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `token` | string | ✅ | — |
| `password` | string | ✅ | mínimo 8 caracteres |

**Flujo interno:**
1. Busca usuario por `activationToken` — lanza `INVALID_ACTIVATION_TOKEN` si no existe
2. Verifica `isActive: true` — lanza `ACCOUNT_INACTIVE` si la cuenta está inactiva
3. Hashea nueva contraseña, actualiza BD, borra `activationToken`
4. Responde `200 { email: string }`

| Caso | Status | Code |
|---|---|---|
| Reset exitoso | 200 | — |
| Token inválido | 400 | `INVALID_ACTIVATION_TOKEN` |
| Cuenta inactiva | 400 | `ACCOUNT_INACTIVE` |

---

### Respuesta serializada Login / Refresh

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "timezone": "America/Bogota"
}
```

### Excepciones

| Clase | Status | Code |
|---|---|---|
| `InvalidCredentialsException` | 401 | `INVALID_CREDENTIALS` |
| `InactiveAccountException` | 403 | `ACCOUNT_INACTIVE` |
| `InvalidRefreshTokenException` | 401 | `INVALID_REFRESH_TOKEN` |
| `InactiveAccountException` (users) | 400 | `ACCOUNT_INACTIVE` |

### Mecanismo de seguridad

- **Access token:** JWT HS256, vida corta (configurable, defecto 15m). No se persiste en DB.
- **Refresh token:** UUID aleatorio con fecha de expiración persistido en DB. Se rota en cada uso.
- **Logout:** Elimina todos los refresh tokens del usuario en una sola operación.
- **Enumeración de usuarios:** Los errores de "usuario no encontrado" y "contraseña incorrecta" retornan el mismo `INVALID_CREDENTIALS`. La cuenta inactiva sí se distingue (403) porque el usuario debe saber que necesita activarse.
