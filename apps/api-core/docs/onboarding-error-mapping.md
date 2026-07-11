# Mapeo de errores — Onboarding

Catálogo de los errores que devuelve el módulo de onboarding y su significado, para que el
frontend los mapee a mensajes friendly (ver `apps/ui/src/lib/error-messages.ts`).

## Contrato de error de la API

Todas las respuestas de error siguen una forma común (ver [ADR 0007](./adr/0007-contrato-de-error-unificado.md)):

```jsonc
{
  "message": string[],   // SIEMPRE un array. Validación → N mensajes; error custom → 1 elemento
  "code": string,        // SIEMPRE presente. Clave estable para mapear en el frontend
  "statusCode": number,
  "details"?: object     // opcional, solo cuando la excepción aporta datos extra (ej. { email })
}
```

- Los **mensajes (`message`) están en inglés** (técnicos). El texto friendly en español vive en
  el frontend, mapeado por `code`.
- El frontend debe clasificar por **`code` + `statusCode`**, no por el texto de `message`.

Ejemplos reales:

```jsonc
// 400 validación (varios mensajes)
{ "message": ["country is required", "country must be a supported LATAM ISO code"],
  "code": "VALIDATION_ERROR", "statusCode": 400 }

// 409 custom (un elemento)
{ "message": ["Email 'x@y.com' is already registered"],
  "code": "EMAIL_ALREADY_EXISTS", "statusCode": 409, "details": { "email": "x@y.com" } }
```

## Códigos de error

| `code` | HTTP | Cuándo ocurre | `details` | Mensaje friendly (ES) |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | DTO inválido: email/restaurantName/timezone/country/decimalSeparator | — | `Los datos ingresados no son válidos.` |
| `EMAIL_ALREADY_EXISTS` | 409 | El email ya está registrado | `{ email }` | `Este correo ya está registrado` |
| `ONBOARDING_CLOSED` | 403 | Registro cerrado (modo single-restaurant, ya existe ≥1 restaurante) | — | `El registro ya no está disponible en esta instalación.` |
| `ONBOARDING_FAILED` | 500 | Error inesperado durante el setup | — | `Error en el proceso de registro. Intenta nuevamente.` |
| `RESTAURANT_CREATION_FAILED` | 500 | Falló crear el restaurante | `{ restaurantName }` | `No se pudo completar el registro del restaurante. Intenta nuevamente.` |
| `USER_CREATION_FAILED` | 500 | Falló crear el usuario | `{ email, restaurantName }` | `No se pudo crear la cuenta. Intenta nuevamente.` |
| `DEFAULT_CATEGORY_CREATION_FAILED` | 500 | Falló crear la categoría default | `{ restaurantId }` | `Hubo un problema al completar el registro de tu restaurante. Intenta nuevamente.` |
| *(throttle)* | 429 | Más de 5 registros en 15 min (rate limit) | — | `Demasiadas solicitudes. Intenta más tarde.` |

> Validaciones de DTO relevantes (mensajes en inglés que pueden aparecer dentro de `message[]`):
> `email must be valid`, `email is required`, `restaurantName is required`,
> `restaurantName must not exceed 60 characters`, `timezone must be a valid IANA timezone`,
> `country is required`, `country must be a supported LATAM ISO code`,
> `decimalSeparator must be "." or ","`.

## Warnings (no son errores — viajan en el `201`)

Cuando el registro **sí** se completa pero la creación de productos falla, la respuesta es `201`
con `productsCreated: 0` y un `productsWarning` en el body (no es un error HTTP):

| `productsWarning` | Cuándo |
|---|---|
| `products_extraction_failed` | Se subió una foto pero Gemini no extrajo productos válidos |
| `products_creation_failed` | Falló la creación de los productos demo |

El restaurante y la cuenta quedan creados igual; el dueño puede cargar productos luego.

## Email de activación y reenvío

> **Self-hosted:** si no hay `RESEND_API_KEY`, la respuesta 201 de `POST /v1/onboarding/register`
> incluye `activationUrl`. La UI lo muestra como botón de activación. No se envía email.

- El envío del email de activación es **no bloqueante**: el onboarding responde **`201` aunque el
  email falle** (solo no se entrega). La cuenta queda creada e inactiva.
- **Reenvío:** `POST /v1/auth/recover { email }` (throttle 3/15 min). Para una cuenta **inactiva**
  reenvía el email de activación; para una **activa**, envía un reset de contraseña. Siempre
  responde `200` con un mensaje genérico (no revela si el email existe). Ya está cableado en el
  wizard (`Step3Success` → botón de reenvío).
- **Limitación conocida:** `AuthService.recoverAccount` traga las fallas de envío (catch + log) y
  responde `200` igual, por lo que la UI muestra "enviado" aunque el segundo intento también falle.
  Pendiente de mejora (señalizar la falla de envío al cliente).
