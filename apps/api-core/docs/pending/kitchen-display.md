# Pendiente: Kitchen Display (Pantalla de Cocina)

**Fecha:** 2026-03-09
**Área:** `apps/api-core/src/kiosk/`, nuevo módulo o extensión
**Prioridad:** Media-Alta

---

## Contexto

El restaurante necesita que la cocina pueda ver los pedidos entrantes en tiempo real desde otra pantalla (tablet, monitor de bajo costo, TV). Este módulo debe ser:

- **De fácil instalación**: abrir URL en un browser, sin login complejo.
- **Seguro**: no expuesto públicamente sin alguna barrera mínima, para evitar que cualquier persona vea los pedidos.
- **Liviano**: sin WebSockets ni infraestructura compleja si no es necesario.

---

## Problema de seguridad con acceso público total

Exponer `/orders` al público sin restricción permitiría:
- Competidores ver volumen y tipos de pedidos.
- Bots hacer polling masivo.
- Filtración de emails de clientes si se incluyen en la respuesta.

---

## Solución Propuesta: Token de cocina por slug

Similar al módulo Kiosk (identificado por `slug`, sin JWT), pero con un **token de solo lectura** específico para la pantalla de cocina.

### Flujo de autenticación de la cocina

```
GET /v1/kitchen/:slug/orders?token=KITCHEN_TOKEN
```

- El `KITCHEN_TOKEN` es generado por el ADMIN desde el dashboard (o al hacer onboarding).
- Es un token de **solo lectura**, sin expiración (o expiración larga), almacenado en la tabla `Restaurant`.
- Si se compromete, el ADMIN puede regenerarlo desde el dashboard.

### Cambio en el schema

```prisma
model Restaurant {
  // ... campos existentes
  kitchenToken String? @unique  // token generado para la pantalla de cocina
}
```

### Endpoints del módulo Kitchen

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/v1/kitchen/:slug/orders` | `?token=KITCHEN_TOKEN` | Order[] activas |
| POST | `/v1/kitchen/:slug/orders/:id/status` | `?token=KITCHEN_TOKEN` | Order actualizada |

**Filtro de órdenes activas**: solo devuelve órdenes con status `CREATED` o `PROCESSING` de la sesión de caja activa. Nunca devuelve emails de clientes.

### Protección contra abuso (rate limiting)

Aplicar `@Throttle` del módulo `@nestjs/throttler` en los endpoints de kitchen:
- `GET orders`: máximo 1 request/segundo por IP (para polling).
- `PATCH status`: máximo 10 requests/minuto por IP.

### Polling desde el cliente (sin WebSockets)

La pantalla de cocina hace polling cada 3-5 segundos:

```
GET /v1/kitchen/:slug/orders?token=TOKEN
```

Esto es suficiente para un restaurante local. La latencia de 3-5s es imperceptible en el contexto de preparación de alimentos.

Si en el futuro se quiere tiempo real: agregar **SSE (Server-Sent Events)** como upgrade opcional, sin romper el polling existente.

---

## Alternativa más simple (MVP)

Si se quiere evitar el token en la DB, una opción más rápida:

- El `kitchenToken` se deriva del slug + un secreto del servidor: `hash(slug + KITCHEN_SECRET_ENV)`.
- Sin persistencia en DB, solo con una variable de entorno.
- Ventaja: no requiere migración ni cambio de schema.
- Desventaja: no se puede revocar sin cambiar el env var (lo que afecta a todos los restaurantes).

**Recomendación:** Usar token por restaurante en DB para permitir revocación granular.

---

## Datos que devuelve la pantalla de cocina

```ts
interface KitchenOrder {
  id: string;
  orderNumber: number;
  status: 'CREATED' | 'PROCESSING';
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    notes?: string;
    // NO incluir precios — la cocina no los necesita
  }>;
}
```

---

## Consideraciones de implementación

- **Módulo nuevo**: `KitchenModule` separado de `KioskModule` y `OrdersModule` para mantener responsabilidades claras.
- **Guard personalizado**: `KitchenTokenGuard` que valide `token` del query param contra el `kitchenToken` del restaurante.
- **Sin JWT**: igual que el módulo Kiosk, identificado por slug.
- **Acceso de escritura limitado**: solo cambiar status de `CREATED → PROCESSING` y `PROCESSING → COMPLETED` desde la cocina. El `cancel` sigue siendo solo para ADMIN/MANAGER desde el dashboard.

---

## Referencias

- `apps/api-core/src/kiosk/` — patrón de autenticación por slug a replicar
- `apps/api-core/docs/modules/orders.md` — transiciones de estado de órdenes
- `apps/api-core/docs/modules/kiosk.md` — módulo público de referencia
