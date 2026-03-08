# Módulo: Users

**Location:** `apps/api-core/src/users`
**Autenticación requerida:** Mixta (ver tabla de endpoints)
**Versión:** v1

---

## Descripción

Módulo de gestión de usuarios. Permite activar cuentas (público), listar usuarios (ADMIN y MANAGER), y crear/editar/eliminar usuarios (solo ADMIN). Todas las operaciones autenticadas están aisladas por `restaurantId` — un usuario no puede operar sobre usuarios de otro restaurante.

---

## Endpoints

| Método | Ruta | Auth | Roles | Descripción |
|--------|------|------|-------|-------------|
| `PUT` | `/v1/users/activate` | No | — | Activar cuenta con token de activación |
| `POST` | `/v1/users` | Sí | ADMIN | Crear nuevo usuario (no puede asignar rol ADMIN) |
| `GET` | `/v1/users` | Sí | ADMIN, MANAGER | Listar usuarios del restaurante (paginado) |
| `PATCH` | `/v1/users/:id` | Sí | ADMIN | Editar usuario (no puede promover a ADMIN) |
| `DELETE` | `/v1/users/:id` | Sí | ADMIN | Eliminar usuario |

---

## Flujos

### Activar cuenta (`PUT /v1/users/activate`)

```mermaid
flowchart TD
    A([PUT /v1/users/activate]) --> B{¿Token válido?}
    B -- No --> ERR1[400 INVALID_ACTIVATION_TOKEN]
    B -- Sí --> C{¿Cuenta ya activa?}
    C -- Sí --> ERR2[409 USER_ALREADY_ACTIVE]
    C -- No --> D[Hash de contraseña]
    D --> E[Activar usuario\nisActive=true\nactivationToken=null]
    E --> F([200 · email])

    style ERR1 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style F fill:#dcfce7,stroke:#22c55e,color:#14532d
```

### Crear usuario (`POST /v1/users`)

```mermaid
flowchart TD
    A([POST /v1/users\nBearer JWT · ADMIN]) --> B{¿JWT válido\ny rol ADMIN?}
    B -- No --> ERR1[401/403 Unauthorized]
    B -- Sí --> C{¿role = ADMIN?}
    C -- Sí --> ERR2[400 INVALID_ROLE\nNo se puede crear otro ADMIN]
    C -- No --> D{¿Email ya existe?}
    D -- Sí --> ERR3[409 EMAIL_ALREADY_EXISTS]
    D -- No --> E[Hash de contraseña]
    E --> F[Crear usuario\ncon restaurantId del ADMIN]
    F --> G([201 · usuario sin passwordHash])

    style ERR1 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR3 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style G fill:#dcfce7,stroke:#22c55e,color:#14532d
```

### Listar usuarios (`GET /v1/users`)

```mermaid
flowchart LR
    A([GET /v1/users\nBearer JWT · ADMIN o MANAGER]) --> B{¿JWT válido\ny rol permitido?}
    B -- No --> ERR[401/403 Unauthorized]
    B -- Sí --> C[Buscar usuarios\npor restaurantId del token]
    C --> D([200 · lista paginada])

    style ERR fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style D fill:#dcfce7,stroke:#22c55e,color:#14532d
```

### Editar usuario (`PATCH /v1/users/:id`)

```mermaid
flowchart TD
    A([PATCH /v1/users/:id\nBearer JWT · ADMIN]) --> B{¿JWT válido\ny rol ADMIN?}
    B -- No --> ERR1[401/403 Unauthorized]
    B -- Sí --> C{¿role = ADMIN\nen el body?}
    C -- Sí --> ERR2[400 INVALID_ROLE\nNo se puede promover a ADMIN]
    C -- No --> D{¿Usuario existe?}
    D -- No --> ERR3[404 USER_NOT_FOUND]
    D -- Sí --> E{¿Usuario pertenece\nal mismo restaurante?}
    E -- No --> ERR4[403 FORBIDDEN_ACCESS]
    E -- Sí --> F[Actualizar usuario]
    F --> G([200 · usuario actualizado])

    style ERR1 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR3 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR4 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style G fill:#dcfce7,stroke:#22c55e,color:#14532d
```

### Eliminar usuario (`DELETE /v1/users/:id`)

```mermaid
flowchart TD
    A([DELETE /v1/users/:id\nBearer JWT · ADMIN]) --> B{¿JWT válido\ny rol ADMIN?}
    B -- No --> ERR1[401/403 Unauthorized]
    B -- Sí --> C{¿Usuario existe?}
    C -- No --> ERR2[404 USER_NOT_FOUND]
    C -- Sí --> D{¿Usuario pertenece\nal mismo restaurante?}
    D -- No --> ERR3[403 FORBIDDEN_ACCESS]
    D -- Sí --> E[Eliminar usuario]
    E --> F([200 · usuario eliminado])

    style ERR1 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style ERR3 fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    style F fill:#dcfce7,stroke:#22c55e,color:#14532d
```

---

## Parámetros

### `PUT /v1/users/activate`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `token` | string | Sí | Token de activación recibido por email |
| `password` | string | Sí | Nueva contraseña |

### `POST /v1/users`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string (email) | Sí | Email del nuevo usuario |
| `password` | string | Sí | Contraseña inicial |
| `role` | enum (MANAGER, BASIC) | Sí | Rol del usuario. No puede ser ADMIN |

### `GET /v1/users`

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | No | Página (default: 1) |
| `limit` | number | No | Registros por página (default: `DEFAULT_PAGE_SIZE`) |

### `PATCH /v1/users/:id`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string (email) | No | Nuevo email |
| `role` | enum (MANAGER, BASIC) | No | Nuevo rol. No puede ser ADMIN |
| `isActive` | boolean | No | Estado de la cuenta |

---

## Respuestas

### Activate — HTTP 200

```json
{ "email": "chef@restaurant.com" }
```

### Create / Update — HTTP 201 / 200

```json
{
  "id": "user-uuid",
  "email": "staff@restaurant.com",
  "role": "MANAGER",
  "isActive": true,
  "restaurantId": "restaurant-uuid"
}
```

> `passwordHash` nunca se incluye en la respuesta.

### List — HTTP 200

```json
{
  "data": [
    { "id": "...", "email": "...", "role": "MANAGER", "isActive": true }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### Delete — HTTP 200

Devuelve el usuario eliminado (sin `passwordHash`).

---

## Códigos de error

| Código | Error code | Descripción |
|--------|-----------|-------------|
| 400 | `INVALID_ACTIVATION_TOKEN` | Token de activación inválido o expirado |
| 400 | `INVALID_ROLE` | Se intentó asignar el rol ADMIN desde el dashboard |
| 401 | — | JWT ausente o inválido |
| 403 | — | Rol insuficiente (MANAGER intentando crear/editar/eliminar) |
| 403 | `FORBIDDEN_ACCESS` | El usuario objetivo pertenece a otro restaurante |
| 404 | `USER_NOT_FOUND` | Usuario no encontrado |
| 409 | `EMAIL_ALREADY_EXISTS` | El email ya está registrado |
| 409 | `USER_ALREADY_ACTIVE` | La cuenta ya fue activada previamente |

---

## Aislamiento por restaurantId

Todas las operaciones autenticadas extraen el `restaurantId` del JWT del usuario autenticado:

- **Crear:** el nuevo usuario queda vinculado al `restaurantId` del ADMIN que lo crea.
- **Listar:** solo devuelve usuarios del mismo restaurante.
- **Editar / Eliminar:** verifica que el usuario objetivo pertenezca al mismo restaurante antes de operar. Si no, lanza `403 FORBIDDEN_ACCESS`.

Este mecanismo garantiza que un ADMIN de un restaurante no pueda operar sobre usuarios de otro cliente.

---

## Restricciones de seguridad

- **El rol ADMIN no puede asignarse desde el dashboard.** Solo se crea durante el onboarding inicial. Ver `apps/api-core/docs/pending/verification-to-create-or-delete-admin.md` para la propuesta de implementación futura.
- **El passwordHash nunca se expone** en respuestas de API.
- **Activación pública:** el endpoint `PUT /v1/users/activate` no requiere JWT porque el usuario aún no tiene credenciales activas.

---

## Dependencias de módulos

| Módulo | Uso |
|--------|-----|
| `UserRepository` | Acceso a DB para CRUD de usuarios |
| `AuthModule` | Guards JWT y Roles para proteger endpoints |
| `OnboardingModule` | Crea el usuario ADMIN inicial (único punto válido) |

---

## Notas de diseño

- **Sin transacción en operaciones simples:** `createUser`, `updateUser`, `deleteUser` son operaciones atómicas de una sola entidad. No requieren transacción.
- **Activación desacoplada del onboarding:** `activateUser` es un flujo independiente que ocurre cuando el usuario hace clic en el email. No depende del flujo de onboarding en ejecución.
- **Paginación por defecto:** `findByRestaurantIdPaginated` usa `DEFAULT_PAGE_SIZE` del config global para consistencia.
