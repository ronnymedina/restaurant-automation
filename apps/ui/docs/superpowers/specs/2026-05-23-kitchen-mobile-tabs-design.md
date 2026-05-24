# Kitchen Mobile Tabs — Design Spec

**Date:** 2026-05-23  
**Scope:** `apps/ui` — `pages/kitchen/index.astro` + `components/commons/Modal.tsx` + new `components/kitchen/KitchenConfirmModal.tsx`

---

## Problem

La kitchen page usa un grid de 2 columnas fijo sin media queries. En mobile el layout se comprime hasta ser ilegible. Los cocineros necesitan poder usar la pantalla desde un celular.

---

## Solution Overview

En mobile (≤640px): ocultar el grid 2 columnas y mostrar una sola columna a la vez, con una **barra de tabs fija al fondo** para cambiar entre columnas. Solo el botón "✓ LISTO" requiere confirmación, via un **modal centrado** implementado como React island que reutiliza `Modal.tsx`.

Desktop (≥641px): sin cambios.

---

## Layout Mobile

- Breakpoint: `max-width: 640px`
- El `<main>` cambia de `grid-template-columns: 1fr 1fr` a una sola columna
- La columna inactiva se oculta con `display: none`
- **Default**: tab "Nuevos" (CONFIRMED) activo al cargar
- El `<main>` recibe `padding-bottom: 64px` para que las cards no queden detrás del tab bar

### Tab Bar

- Posición: `fixed; bottom: 0; left: 0; right: 0`; altura 64px
- Solo visible en mobile (`display: none` en desktop)
- **Tab 1 — Nuevos** (izquierda): ícono 📋, color activo `#a78bfa` (purple), badge con count de CONFIRMED
- **Tab 2 — En Proceso** (derecha): ícono 🔥, color activo `#60a5fa` (blue), badge con count de PROCESSING
- Tab activo: `border-top: 3px solid <color>` + fondo semitransparente
- Al cambiar de tab: JS muestra la columna correspondiente y oculta la otra; actualiza estilos del tab bar; actualiza los badges

---

## Confirmation Modal

### Trigger

Solo el botón **"✓ LISTO"** (columna En Proceso, status PROCESSING → SERVED) dispara confirmación.  
El botón **"EN PROCESO →"** (columna Nuevos, CONFIRMED → PROCESSING) **no** requiere confirmación.

### Flujo

1. Cocinero toca "✓ LISTO"
2. JS vanilla despacha `CustomEvent('kitchen:confirm', { detail: { orderId, orderNumber, items } })`
3. `KitchenConfirmModal` (React island) escucha el evento, setea `open = true` con los datos del pedido
4. Modal muestra: título "Confirmar pedido listo", número de pedido, lista de ítems, botones Cancelar + Confirmar
5. **Cancelar**: cierra el modal, no hace nada
6. **Confirmar**: llama `PATCH /v1/kitchen/:slug/orders/:orderId/status` con `{ status: 'SERVED' }`, cierra modal, despacha `CustomEvent('kitchen:order-updated')` → vanilla JS llama `loadOrders()`
7. Si la API falla: muestra el error dentro del modal (misma lógica de mensajes de error ya existente)

---

## File Changes

### 1. `apps/ui/src/pages/kitchen/index.astro`

- Agregar media queries CSS para mobile (tab bar visible, columna inactiva oculta, padding-bottom en main)
- Agregar HTML del tab bar (fijo al fondo, oculto en desktop)
- Agregar `<KitchenConfirmModal client:only="react" slug={slug} token={token} apiUrl={apiUrl} />` en el template (slug/token/apiUrl leídos desde query params en el frontmatter)
- En el `<script>`: interceptar click en "✓ LISTO" → despachar `kitchen:confirm` CustomEvent en vez de llamar directamente al PATCH
- Agregar lógica de tab switching (mostrar/ocultar columnas, actualizar estilos)
- Escuchar `kitchen:order-updated` → llamar `loadOrders()`

### 2. `apps/ui/src/components/commons/Modal.tsx`

Agregar 2 props opcionales (backward-compatible):

```ts
dark?: boolean          // fondo oscuro (#1e293b) en vez de bg-white
hideCloseButton?: boolean  // oculta el botón "Cerrar" default
```

Cuando `dark=true`: `bg-[#1e293b]` + texto `text-slate-100` + border `border-slate-700`.

### 3. `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx` (nuevo)

```ts
interface Props {
  slug: string;
  token: string;
  apiUrl: string;
}
```

- Estado local: `open`, `order` (id, orderNumber, items), `loading`, `error`
- `useEffect`: registra listener para `CustomEvent('kitchen:confirm')`
- On confirm: hace fetch directo a la API con token; on success despacha `kitchen:order-updated`
- Usa `<Modal open={open} title="Confirmar pedido listo" onClose={handleClose} dark hideCloseButton>`
- Children del Modal: lista de ítems + botones Cancelar / Confirmar

---

## Desktop Behavior

Sin cambios. El grid 2 columnas, los headers de columna y el layout actual se mantienen igual en `≥641px`.

---

## Out of Scope

- Animación de transición entre tabs
- Swipe gesture para cambiar de tab
- Confirmación para el botón "EN PROCESO →"
