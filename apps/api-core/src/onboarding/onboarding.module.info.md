
### Onboarding (onboarding)

Registro de nuevos restaurantes en la plataforma. Ruta pública con rate limiting.
El flujo crea restaurante + usuario ADMIN + categoría por defecto en una sola transacción, envía el email de activación inmediatamente, y luego procesa productos de forma no-fatal (Gemini AI o datos demo).

### Respuesta serializada

**OnboardingResponse** — único endpoint `POST /register`:

```json
{ "productsCreated": 5 }
```

Con warning (si el procesamiento de productos falló):

```json
{ "productsCreated": 0, "productsWarning": "products_extraction_failed" }
```

### Endpoints

| Método | Ruta | Auth | Respuesta | Descripción |
|---|---|---|---|---|
| `POST` | `/v1/onboarding/register` | Público | `OnboardingResponse` | Registrar restaurante (multipart/form-data) |

---

#### Register — `POST /v1/onboarding/register`

**Content-Type:** `multipart/form-data`

**Rate limit:** 5 requests por IP en ventana de 15 minutos (TTL: 900 000 ms).

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `email` | string | ✅ | email válido |
| `restaurantName` | string | ✅ | solo letras, acentos, espacios, `-`, `_`; máx 60 chars |
| `timezone` | string | ✅ | zona horaria IANA válida |
| `createDemoData` | boolean | ❌ | si `true`, crea 5 productos + menú demo |
| `photo` | binary (JPEG/PNG) | ❌ | máx 5 MB; solo `image/jpeg` o `image/png` |

**Flujo interno:**

1. Valida unicidad de `email` vía `existsByEmail` — lanza `EMAIL_ALREADY_EXISTS` (409) si ya existe
2. Crea restaurante + usuario ADMIN + categoría por defecto en una transacción atómica
3. **Envía email de activación** — inmediatamente tras el setup, independiente de los productos (timeout 5s, retry ×2)
4. Resuelve productos (no-fatal — nunca lanza error, devuelve `productsWarning` en caso de fallo):
   - Si hay `photo` → extracción con Gemini AI; si falla → `productsWarning: "products_extraction_failed"`
   - Si `createDemoData=true` → 5 productos demo + menú; si falla → `productsWarning: "products_creation_failed"`
   - Si ninguno → `productsCreated: 0`, sin warning

**Notas:**
- El nombre del restaurante **no es único** — dos restaurantes pueden tener el mismo nombre. Solo el `slug` (generado desde el nombre) es único.
- El slug se genera normalizando el nombre; si colisiona se agrega un sufijo aleatorio de 4 chars.
- El usuario creado tiene `isActive: false` y `role: ADMIN`; se activa vía link en el email.
- La categoría por defecto se crea con `createDefaultCategory` (INSERT directo, sin lookup previo) ya que el restaurante es nuevo.
- El email usa RxJS `defer()` + `timeout()` + `retry({ count: 2, delay: 1000 })` para resiliencia.

| Caso | Status | Code | `productsWarning` |
|---|---|---|---|
| Registro exitoso sin foto | 201 | — | — |
| Registro exitoso con `createDemoData=true` | 201 | — | — |
| Registro exitoso con foto JPEG válida | 201 | — | — |
| Gemini falla o no extrae productos | 201 | — | `products_extraction_failed` |
| Creación de productos demo falla | 201 | — | `products_creation_failed` |
| Email ya registrado | 409 | `EMAIL_ALREADY_EXISTS` | — |
| Email ausente | 400 | — | — |
| Email con formato inválido | 400 | — | — |
| `restaurantName` ausente | 400 | — | — |
| `restaurantName` > 60 chars | 400 | — | — |
| `restaurantName` contiene números | 400 | — | — |
| `timezone` ausente | 400 | — | — |
| `timezone` inválido (no IANA) | 400 | — | — |
| Foto > 5 MB | 400 | — | — |
| Foto tipo PDF | 400 | — | — |
| 6° request desde misma IP (15 min) | 429 | — | — |
| Error interno (ej: falla de BD) | 500 | `ONBOARDING_FAILED` | — |

### Excepciones

| Clase | Status | Code |
|---|---|---|
| `OnboardingFailedException` | 500 | `ONBOARDING_FAILED` |
| `EmailAlreadyExistsException` | 409 | `EMAIL_ALREADY_EXISTS` |
| `RestaurantCreationFailedException` | 500 | `RESTAURANT_CREATION_FAILED` |
| `UserCreationFailedException` | 500 | `USER_CREATION_FAILED` |
| `DefaultCategoryCreationFailedException` | 500 | `DEFAULT_CATEGORY_CREATION_FAILED` |

### Tests existentes

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit (service) | `src/onboarding/onboarding.service.spec.ts` | ✅ 22 tests |
| Unit (email) | `src/email/email.service.spec.ts` | ✅ 6 tests |
| E2E — registro básico | `test/onboarding/register.e2e-spec.ts` | ✅ 4 tests |
| E2E — conflictos 409 | `test/onboarding/register-conflicts.e2e-spec.ts` | ✅ 2 tests |
| E2E — validaciones DTO | `test/onboarding/register-validation.e2e-spec.ts` | ✅ 7 tests |
| E2E — archivos | `test/onboarding/register-file.e2e-spec.ts` | ✅ 3 tests |
| E2E — demo data | `test/onboarding/register-demo-data.e2e-spec.ts` | ✅ 4 tests |
| E2E — rate limit | `test/onboarding/register-rate-limit.e2e-spec.ts` | ✅ 2 tests |
