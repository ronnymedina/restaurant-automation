# Arquitectura: Conexion UI Kiosk, Dashboard y Backend

## Apps del sistema

```
apps/
├── api-core/        → Backend NestJS (REST + WebSocket)
├── ui-storefront/   → Kiosk (Astro) — interfaz para el cliente final
└── ui-dashboard/    → Dashboard (Astro) — interfaz de administracion
```

---

## Comunicacion HTTP (REST)

### Kiosk (`ui-storefront`)

Archivo: `apps/ui-storefront/src/lib/kiosk-api.ts`

- Sin autenticacion. Usa el `slug` del restaurante como identificador publico en la URL.
- URL base configurable via variable de entorno `PUBLIC_API_URL` (default: `http://localhost:3000`).

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/v1/kiosk/{slug}/status` | Verifica si la caja esta abierta |
| GET | `/v1/kiosk/{slug}/menus` | Lista de menus disponibles |
| GET | `/v1/kiosk/{slug}/menus/{id}/items` | Productos de un menu (agrupados por seccion) |
| POST | `/v1/kiosk/{slug}/orders` | Crear pedido (incluye `expectedTotal` para detectar cambios de precio) |

### Dashboard (`ui-dashboard`)

Archivo: `apps/ui-dashboard/src/lib/api.ts`

- Autenticado via JWT en el header `Authorization: Bearer <token>`.
- Auto-refresh de token: si recibe un `401`, llama a `/v1/auth/refresh` con el refresh token y reintenta la request original.
- Si el refresh falla, limpia los tokens y redirige a `/login`.

---

## Comunicacion WebSocket (Socket.IO)

Ambas apps se conectan al mismo `EventsGateway` en `api-core`.

### Kiosk — conexion por slug

```ts
// apps/ui-storefront/src/lib/socket.ts
io(WS_URL, { query: { slug }, transports: ['websocket'], reconnection: true })
```

### Dashboard — conexion por JWT

```ts
// apps/ui-dashboard/src/lib/socket.ts
io(WS_URL, { auth: { token }, transports: ['websocket'], reconnection: true })
```

### Separacion en rooms (backend)

Archivo: `apps/api-core/src/events/events.gateway.ts`

El gateway identifica el tipo de cliente al conectarse y los asigna a rooms separadas:

| Cliente | Room asignada |
|---------|--------------|
| Kiosk (con `slug`) | `kiosk:{restaurantId}` |
| Dashboard (con JWT) | `restaurant:{restaurantId}` |

Si no se provee ni `slug` ni `token`, la conexion es rechazada (`client.disconnect()`).

---

## Eventos en tiempo real

### Backend → Kiosk (`emitToKiosk`)

Disparado cuando el admin modifica el catalogo desde el dashboard.

| Evento | Origen | Payload |
|--------|--------|---------|
| `catalog:changed` | Cambio en menus | `{ type: 'menu', action: 'created' \| 'updated' \| 'deleted' }` |
| `catalog:changed` | Cambio en productos | `{ type: 'product', action: 'created' \| 'updated' \| 'deleted' }` |
| `catalog:changed` | Cambio en menu items | `{ type: 'menuItem', action: 'created' \| 'updated' \| 'deleted' }` |
| `catalog:changed` | Cambio en categorias | `{ type: 'category', action: 'created' \| 'updated' \| 'deleted' }` |

El kiosk recibe `catalog:changed` y recarga el catalogo automaticamente, mostrando un toast "Menu actualizado".

### Backend → Dashboard (`emitToRestaurant`)

Disparado cuando hay actividad en los pedidos.

| Evento | Origen | Payload |
|--------|--------|---------|
| `order:new` | Nuevo pedido creado (desde kiosk) | `{ order }` |
| `order:updated` | Cambio de estado, cancelacion o pago | `{ order }` |

---

## Flujo completo: pedido desde el kiosk

```
1. GET /v1/kiosk/{slug}/status
      └── Verifica si registerOpen === true → muestra el kiosk o pantalla "Caja cerrada"

2. GET /v1/kiosk/{slug}/menus
      └── Carga las pestanas de menus disponibles

3. GET /v1/kiosk/{slug}/menus/{id}/items
      └── Carga productos agrupados por seccion
      └── Incluye stockStatus: 'ok' | 'low_stock' | 'out_of_stock'

4. Cliente agrega productos al carrito y selecciona metodo de pago

5. POST /v1/kiosk/{slug}/orders
      └── Body: { items, paymentMethod, customerEmail?, expectedTotal }
      └── Backend valida stock y precios
      └── Si expectedTotal no coincide → 400 → kiosk refresca precios y muestra diferencias
      └── Si ok → decrementa stock, crea orden, retorna { orderNumber, totalAmount }

6. Backend emite order:new → room restaurant:{id}
      └── Dashboard recibe el pedido en tiempo real (KDS / Kitchen Display System)

7. Dashboard cambia estado del pedido (PROCESSING → COMPLETED) o lo cancela
      └── Backend emite order:updated → room restaurant:{id}
      └── Dashboard actualiza la vista KDS
```

---

## Proteccion de precios (anti-race condition)

Cuando el cliente intenta pagar, el kiosk envia `expectedTotal` calculado en el momento de ver los precios. Si el backend detecta que los precios cambiaron (diferencia > $0.01), devuelve un `400`. El kiosk entonces:

1. Toma un snapshot de los precios actuales del carrito.
2. Recarga el menu activo.
3. Compara precios nuevos vs snapshot y resalta los cambios en la UI.
4. El cliente puede revisar y reintentar con los precios actualizados.
