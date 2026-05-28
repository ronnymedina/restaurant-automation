
### Kitchen (kitchen)

### Respuesta serializada

**KitchenTokenSerializer** — usado en `GET /token`:

```json
{
  "hasToken": true,
  "expiresAt": "2026-06-25T00:00:00.000Z"
}
```

> Si no hay token generado o está expirado, `hasToken=false` y `expiresAt=null`. La URL del token solo se entrega en `POST /token/generate` (audit H-14 — el plain token no se persiste, solo su sha256).

**KitchenGeneratedTokenSerializer** — usado en `POST /token/generate`:

```json
{
  "token": "43-char-url-safe-base64",
  "expiresAt": "2026-06-25T00:00:00.000Z",
  "kitchenUrl": "/kitchen?slug=mi-restaurante&token=abc123..."
}
```

> El `token` es un string URL-safe base64 de 43 chars (32 bytes de entropía). Se muestra al admin **exactamente una vez** en esta response — no se persiste en BD (solo se guarda su sha256). Si se pierde, la única recuperación es regenerar (audit H-14).

**KitchenOrderSerializer** — usado en `GET /:slug/orders`, `PATCH /:slug/orders/:id/status`:

```json
{
  "id": "string",
  "orderNumber": 42,
  "status": "CONFIRMED | PROCESSING | SERVED | CANCELLED",
  "totalAmount": 12.5,
  "displayTime": "HH:MM",
  "items": [
    {
      "id": "string",
      "quantity": 2,
      "unitPrice": 6.25,
      "subtotal": 12.5,
      "notes": "string | null",
      "product": {
        "id": "string",
        "name": "string",
        "imageUrl": "string | null"
      }
    }
  ]
}
```

> `totalAmount`, `unitPrice` y `subtotal` se exponen en pesos (divididos por 100 desde centavos). Los campos `restaurantId`, `cashShiftId`, `isPaid`, `paymentMethod`, `cancellationReason`, `updatedAt` **no se exponen**. Nota: el estado `COMPLETED` no se expone en KDS — la cocina entrega en `SERVED` y no ve pedidos pagados.

### Endpoints

| Método | Ruta | Auth | Roles | Respuesta | Descripción |
|---|---|---|---|---|---|
| `GET` | `/v1/kitchen/token` | JWT | ADMIN | `KitchenTokenSerializer` | Token activo del restaurante |
| `POST` | `/v1/kitchen/token/generate` | JWT | ADMIN | `KitchenGeneratedTokenSerializer` | Genera o renueva el token |
| `GET` | `/v1/kitchen/:slug/orders` | Kitchen token (query param) | — | `KitchenOrderSerializer[]` | Pedidos CONFIRMED y PROCESSING |
| `PATCH` | `/v1/kitchen/:slug/orders/:id/status` | Kitchen token (query param) | — | `KitchenOrderSerializer` | Avanza estado del pedido |
| `POST` | `/v1/kitchen/:slug/notify-offline` | Kitchen token (query param) | — | `{ notified: true }` | Notifica que la pantalla está offline |

---

#### GET /token — `GET /v1/kitchen/token`

Requiere JWT con rol ADMIN. Retorna el token activo del restaurante derivado del JWT.

| Caso | Status | Detalle |
|---|---|---|
| Sin token JWT | 401 | Unauthenticated |
| Rol < ADMIN | 403 | Solo ADMIN |
| Sin token generado | 200 | `{ hasToken: false, expiresAt: null }` |
| Token expirado | 200 | `{ hasToken: false, expiresAt: null }` |
| Token activo | 200 | `{ hasToken: true, expiresAt }` (la URL no se expone post-generación) |

---

#### Generate Token — `POST /v1/kitchen/token/generate`

Requiere JWT con rol ADMIN. Genera un token nuevo (invalida el anterior). El `restaurantId` se toma del JWT.

| Caso | Status | Detalle |
|---|---|---|
| Sin token JWT | 401 | Unauthenticated |
| Rol < ADMIN | 403 | Solo ADMIN |
| Sin body (expiresAt por defecto) | 201 | Vence en 60 días |
| Con `expiresAt` futuro válido | 201 | Token con la fecha indicada |
| `expiresAt` = hoy o pasado | 400 | Debe ser al menos mañana |

---

#### Active Orders — `GET /v1/kitchen/:slug/orders?token=...`

Autenticado mediante `KitchenTokenGuard`: el `token` se pasa via header `X-Kitchen-Token` (preferido) o query param `?token=` (legacy fallback para SSE). El guard hashea el token entrante y lo compara contra `restaurant.settings.kitchenTokenHash` con `crypto.timingSafeEqual` (audit H-14).

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Kitchen token required |
| Token inválido | 401 | Invalid kitchen token |
| Token expirado | 401 | Kitchen token expired |
| OK | 200 | Array de órdenes CONFIRMED + PROCESSING (SERVED no se muestra — ya fue entregada), ordenadas por `createdAt desc` |

---

#### Advance Status — `PATCH /v1/kitchen/:slug/orders/:id/status?token=...`

Transiciones permitidas: `CONFIRMED → PROCESSING`, `PROCESSING → SERVED`. La cocina no puede avanzar a `COMPLETED` (lo hace el dashboard después de pago).

| Caso | Status | Detalle |
|---|---|---|
| Token inválido/expirado | 401 | KitchenTokenGuard |
| Pedido no encontrado | 404 | Aislamiento por restaurante |
| Estado ya CANCELLED | 400 | `OrderAlreadyCancelledException` |
| Transición inválida (ej: PROCESSING → COMPLETED) | 400 | `InvalidStatusTransitionException` — máximo kitchen es SERVED |
| OK | 200 | `KitchenOrderSerializer` con nuevo status |

---

#### Notify Offline — `POST /v1/kitchen/:slug/notify-offline?token=...`

Emite el evento SSE `kitchen:offline` al dashboard del restaurante vía `SseService`.

| Caso | Status | Detalle |
|---|---|---|
| Token inválido/expirado | 401 | KitchenTokenGuard |
| OK | 201 | `{ notified: true }` |

---

### Notas de implementación

- El token de cocina se almacena en `RestaurantSettings.kitchenTokenHash` (sha256 hex de 64 chars). El plain token (43 chars URL-safe base64) se muestra al admin exactamente una vez en `POST /token/generate`; no se persiste. Regenerar invalida cualquier token previo.
- El `KitchenTokenGuard` resuelve el restaurante por slug, hashea el token entrante y lo compara contra `kitchenTokenHash` con `crypto.timingSafeEqual` (constant-time, cierra el oracle de byte-guessing). Adjunta el objeto `Restaurant` al request bajo la clave `KITCHEN_RESTAURANT_KEY`. Acepta el token via header `X-Kitchen-Token` (preferido) o query `?token=` (fallback para SSE que no puede setear headers).
- Las rutas con `KitchenTokenGuard` son accesibles sin JWT — diseñadas para pantallas sin sesión de empleado.
- Los endpoints JWT-auth (`/token`, `/token/generate`) derivan el `restaurantId` del payload del JWT, no de parámetros de URL.
- `totalAmount`, `unitPrice` y `subtotal` se almacenan en centavos (BigInt); los serializers los convierten a pesos con `fromCents()`.
- Máximo de transición en kitchen: `PROCESSING → SERVED`. El estado `COMPLETED` solo lo alcanza el dashboard vía `orders.service.markAsPaid()` cuando se paga la orden.

### Serializers

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `KitchenTokenSerializer` | `hasToken` (boolean), `expiresAt` (nullable) | GET /token |
| `KitchenGeneratedTokenSerializer` | `token`, `expiresAt`, `kitchenUrl` | POST /token/generate |
| `KitchenOrderSerializer` | `id`, `orderNumber`, `status`, `totalAmount` (pesos), `displayTime`, `items[]` | GET orders, PATCH status |
| `KitchenOrderItemSerializer` | `id`, `quantity`, `unitPrice` (pesos), `subtotal` (pesos), `notes`, `product{id,name,imageUrl}` | Anidado en KitchenOrderSerializer |

> `displayTime` se formatea en el timezone del restaurante server-side vía `TimezoneService`. El campo `createdAt` no se expone.

---

### Token authentication (audit H-14)

#### Storage
- El plain token se muestra al admin **exactamente una vez** en la response de `POST /token/generate`. Nunca se persiste.
- `RestaurantSettings.kitchenTokenHash` almacena el sha256 hex del token plano. Un leak de BD no expone ningún token usable.
- Si el admin pierde el plain token, la única recuperación es regenerar — lo que invalida cualquier pantalla de cocina actualmente conectada para ese restaurante.

#### Transmission
- Preferido: header `X-Kitchen-Token: <token>`. Los tokens enviados via header no aparecen en URLs, Referer, history del browser ni logs de proxies upstream.
- Legacy: query string `?token=<token>`. Requerido hoy porque el `EventSource` del browser (SSE) no puede mandar headers custom. Se eliminará cuando H-04 introduzca el mecanismo sse-ticket.

#### Comparison
- El token entrante se hashea via sha256 y se compara contra el hash almacenado vía `crypto.timingSafeEqual` (`KitchenTokenService.verifyHash`). Comparación constant-time — cierra el oracle de byte-by-byte timing que `===` crearía.

#### Lifecycle
- Tokens expiran en `kitchenTokenExpiresAt`. Tokens expirados fallan el guard con 401; el admin debe regenerar.

#### Modelo elegido: shared secret vs JWT
- Shared secret per-restaurant elegido sobre JWT. Razón: las sesiones de cocina son long-lived (meses) y los admins necesitan revocación inmediata al regenerar. Per-restaurant secret también acota el blast radius (un leak compromete un restaurante, no todos). Detalles en el spec referenciado en `docs/superpowers/specs/2026-05-27-orders-cashshift-kitchen-token-hardening-design.md`.
