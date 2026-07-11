# Módulo de Reservas — Pendiente de Rediseño

El módulo de reservas está **oculto del dashboard** hasta que se resuelvan los problemas de flujo descritos abajo.

## Problemas actuales

### 1. Flujo de estados incompleto
El modelo tiene 6 estados (`PENDING → CONFIRMED → SEATED → COMPLETED / NO_SHOW / CANCELLED`) pero el dashboard no permite avanzar entre ellos de forma clara. No hay una UI que guíe al operador por las transiciones.

### 2. Notificación al cliente ausente
Cuando el operador confirma una reserva (`PENDING → CONFIRMED`), el cliente no recibe ninguna notificación. No hay integración de email/SMS/WhatsApp para avisar que la reserva fue aceptada o rechazada.

### 3. Canal de creación único
El cliente solo puede crear reservas manualmente desde el kiosco o storefront. No hay canal alternativo (link directo, integración externa, etc.).

## Lo que hay que definir antes de reactivar

- ¿Quién confirma la reserva — el operador en el dashboard, o se confirma automáticamente?
- ¿Cómo se notifica al cliente? (email vía Resend, WhatsApp, SMS)
- ¿El cliente puede cancelar su propia reserva desde algún link?
- Simplificar los estados: ¿son necesarios los 6, o con 3 (PENDING / CONFIRMED / CANCELLED) alcanza para el MVP?

## Para reactivar

1. Descomentar la línea en `apps/ui-dashboard/src/layouts/DashboardLayout.astro`:
   ```ts
   // { href: '/dash/reservations', label: 'Reservas' }
   ```
2. Implementar las transiciones de estado en el dashboard
3. Conectar notificación al cliente (mínimo email)
