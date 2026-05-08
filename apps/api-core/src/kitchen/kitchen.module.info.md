
### Kitchen (kitchen)

### Respuesta serializada

**KitchenTokenSerializer** — usado en `GET /token`:

```json
{
  "kitchenUrl": "/kitchen?slug=mi-restaurante&token=abc123...",
  "expiresAt": "2026-06-25T00:00:00.000Z"
}
```

> Si no hay token generado o está expirado, ambos campos retornan `null`.

**KitchenGeneratedTokenSerializer** — usado en `POST /token/generate`:

```json
{
  "expiresAt": "2026-06-25T00:00:00.000Z",
  "kitchenUrl": "/kitchen?slug=mi-restaurante&token=abc123..."
}
```

**KitchenOrderSerializer** — usado en `GET /:slug/orders`, `PATCH /:slug/orders/:id/status`, `PATCH /:slug/orders/:id/cancel`:

```json
{
  "id": "string",
  "orderNumber": 42,
  "status": "CREATED | PROCESSING | COMPLETED | CANCELLED",
  "totalAmount": 12.5,
  "createdAt": "ISO8601",
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

> `totalAmount`, `unitPrice` y `subtotal` se exponen en pesos (divididos por 100 desde centavos). Los campos `restaurantId`, `cashShiftId`, `isPaid`, `paymentMethod`, `cancellationReason`, `updatedAt` **no se exponen**.

### Endpoints

| Método | Ruta | Auth | Roles | Respuesta | Descripción |
|---|---|---|---|---|---|
| `GET` | `/v1/kitchen/token` | JWT | ADMIN | `KitchenTokenSerializer` | Token activo del restaurante |
| `POST` | `/v1/kitchen/token/generate` | JWT | ADMIN | `KitchenGeneratedTokenSerializer` | Genera o renueva el token |
| `GET` | `/v1/kitchen/:slug/orders` | Kitchen token (query param) | — | `KitchenOrderSerializer[]` | Pedidos CREATED y PROCESSING |
| `PATCH` | `/v1/kitchen/:slug/orders/:id/status` | Kitchen token (query param) | — | `KitchenOrderSerializer` | Avanza estado del pedido |
| `PATCH` | `/v1/kitchen/:slug/orders/:id/cancel` | Kitchen token (query param) | — | `KitchenOrderSerializer` | Cancela un pedido |
| `POST` | `/v1/kitchen/:slug/notify-offline` | Kitchen token (query param) | — | `{ notified: true }` | Notifica que la pantalla está offline |

---

#### GET /token — `GET /v1/kitchen/token`

Requiere JWT con rol ADMIN. Retorna el token activo del restaurante derivado del JWT.

| Caso | Status | Detalle |
|---|---|---|
| Sin token JWT | 401 | Unauthenticated |
| Rol < ADMIN | 403 | Solo ADMIN |
| Sin token generado | 200 | `{ kitchenUrl: null, expiresAt: null }` |
| Token expirado | 200 | `{ kitchenUrl: null, expiresAt: null }` |
| Token activo | 200 | `{ kitchenUrl, expiresAt }` |

---

#### Generate Token — `POST /v1/kitchen/token/generate`

Requiere JWT con rol ADMIN. Genera un token nuevo (invalida el anterior). El `restaurantId` se toma del JWT.

| Caso | Status | Detalle |
|---|---|---|
| Sin token JWT | 401 | Unauthenticated |
| Rol < ADMIN | 403 | Solo ADMIN |
| Válido | 201 | Token generado, vence en 30 días |

---

#### Active Orders — `GET /v1/kitchen/:slug/orders?token=...`

Autenticado mediante `KitchenTokenGuard`: el `token` se pasa como query param y se valida contra `restaurant.settings.kitchenToken`.

| Caso | Status | Detalle |
|---|---|---|
| Sin token | 401 | Kitchen token required |
| Token inválido | 401 | Invalid kitchen token |
| Token expirado | 401 | Kitchen token expired |
| OK | 200 | Array de órdenes CREATED + PROCESSING, ordenadas por `createdAt desc` |

---

#### Advance Status — `PATCH /v1/kitchen/:slug/orders/:id/status?token=...`

Transiciones permitidas: `CREATED → PROCESSING`, `PROCESSING → COMPLETED`. No salta estados.

| Caso | Status | Detalle |
|---|---|---|
| Token inválido/expirado | 401 | KitchenTokenGuard |
| Pedido no encontrado | 404 | Aislamiento por restaurante |
| Estado ya CANCELLED | 400 | `OrderAlreadyCancelledException` |
| Transición inválida | 400 | `InvalidStatusTransitionException` |
| OK | 200 | `KitchenOrderSerializer` con nuevo status |

---

#### Cancel Order — `PATCH /v1/kitchen/:slug/orders/:id/cancel?token=...`

Solo se puede cancelar si el pedido está en CREATED o PROCESSING.

| Caso | Status | Detalle |
|---|---|---|
| Token inválido/expirado | 401 | KitchenTokenGuard |
| Pedido no encontrado | 404 | Aislamiento por restaurante |
| Ya CANCELLED | 400 | `OrderAlreadyCancelledException` |
| Estado no cancelable (ej. PAID) | 400 | `InvalidStatusTransitionException` |
| `reason` < 3 chars | 400 | `@MinLength(3)` en DTO |
| OK | 200 | `KitchenOrderSerializer` con status CANCELLED |

---

#### Notify Offline — `POST /v1/kitchen/:slug/notify-offline?token=...`

Emite el evento SSE `kitchen:offline` al dashboard del restaurante vía `SseService`.

| Caso | Status | Detalle |
|---|---|---|
| Token inválido/expirado | 401 | KitchenTokenGuard |
| OK | 201 | `{ notified: true }` |

---

### Notas de implementación

- El token de cocina se almacena en `RestaurantSettings.kitchenToken` (hex de 32 bytes = 64 chars). Se invalida al generar uno nuevo.
- El `KitchenTokenGuard` resuelve el restaurante por slug y compara el token del query param contra el almacenado en BD. Adjunta el objeto `Restaurant` al request bajo la clave `KITCHEN_RESTAURANT_KEY`.
- Las rutas con `KitchenTokenGuard` son accesibles sin JWT — diseñadas para pantallas sin sesión de empleado.
- Los endpoints JWT-auth (`/token`, `/token/generate`) derivan el `restaurantId` del payload del JWT, no de parámetros de URL.
- `totalAmount`, `unitPrice` y `subtotal` se almacenan en centavos (BigInt); los serializers los convierten a pesos con `fromCents()`.

### Serializers

| Clase | Campos expuestos | Usado en |
|---|---|---|
| `KitchenTokenSerializer` | `kitchenUrl`, `expiresAt` (ambos nullable) | GET /token |
| `KitchenGeneratedTokenSerializer` | `expiresAt`, `kitchenUrl` | POST /token/generate |
| `KitchenOrderSerializer` | `id`, `orderNumber`, `status`, `totalAmount` (pesos), `createdAt`, `items[]` | GET orders, PATCH status/cancel |
| `KitchenOrderItemSerializer` | `id`, `quantity`, `unitPrice` (pesos), `subtotal` (pesos), `notes`, `product{id,name,imageUrl}` | Anidado en KitchenOrderSerializer |
