# Kiosk Redesign — Design Spec

**Date:** 2026-05-05
**Status:** Approved

## Summary

Rediseño visual del kiosk de cliente. El objetivo es un look más limpio y moderno: blanco dominante, sombras en lugar de bordes, y negro carbón como color de acento único. La funcionalidad no cambia.

---

## Design Decisions

| Decisión | Actual | Nuevo |
|---|---|---|
| Color primario | Verde `#059669` | Carbón `#111827` |
| Color primario dark | `#047857` | `#1f2937` |
| Fondo | Crema `#fffbeb` | Gris claro `#f8fafc` |
| Surface | Blanco `#ffffff` | Blanco `#ffffff` |
| Texto | `#1e293b` | `#0f172a` |
| Texto muted | `#94a3b8` | `#94a3b8` |
| Accent | Ámbar `#d97706` | Se mantiene solo para estado "precio actualizado" en ProductCard |
| Cards | `border border-slate-200` | Shadow doble `0 1px 2px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.05)`, sin borde |
| Botón "Agregar" | texto normal | uppercase + letter-spacing |
| Peso del precio | `font-bold` | `font-black` / `font-weight:900` |

---

## Componentes afectados

Todos los componentes del kiosk reciben `theme: KioskTheme` como prop, por lo que el cambio de paleta se aplica actualizando el `defaultTheme` en `KioskApp.tsx`. Los cambios visuales adicionales (sombras, tipografía) se aplican componente a componente.

### KioskApp.tsx
- Actualizar `defaultTheme`: `primary`, `primaryDark`, `background`, `accent`

### ProductCard.tsx
- Reemplazar `border border-slate-200` → `shadow-sm` (sombra suave)
- Botón "Agregar": agregar `uppercase tracking-wide`
- Precio: cambiar a `font-black`

### KioskHeader.tsx
- Agregar badge "Abierto" con `bg-white/10` para dar contexto visual
- Sin cambios estructurales

### MenuTabs.tsx
- Tab inactiva: `bg-slate-100` → mantener, sin cambios de color (el activo ya usa `theme.primary`)
- Border bottom: `border-b border-slate-100` (más sutil que el actual)

### CartPanel.tsx
- Sin cambios estructurales. El botón "Pagar" hereda `theme.primary` → queda carbón.

### CartFab.tsx
- Ícono: `🛒` → `🛍️` (más minimal)

### LoadingScreen.tsx / SessionClosedScreen.tsx / OrderConfirmation.tsx / PaymentMethodSelector.tsx
- Heredan colores vía `theme` prop → actualizados automáticamente con el nuevo `defaultTheme`

---

## Arquitectura de layouts (próxima iteración)

> **Nota:** el split en dos archivos de layout es un objetivo declarado pero se trata como trabajo separado, después de validar el rediseño visual.

El plan acordado:
- `KioskMobileLayout.tsx` — teléfonos (`< 768px`): FAB + CartPanel como bottom sheet
- `KioskDesktopLayout.tsx` — tablets y desktop (`≥ 768px`): sidebar con carrito, grid adaptable
- `KioskApp.tsx` — detecta viewport con `useViewport` y renderiza el layout correcto

El breakpoint actual en `useViewport.ts` es `>= 1024`, lo que excluye tablets en portrait. Cambiar a `>= 768` como parte de esa iteración.

---

## Out of scope

- Cambios en la API o el store (`kiosk.store.ts`)
- Cambios en los tipos (`kiosk.types.ts`)
- Funcionalidad nueva
- Bug de viewport (`useViewport` no responde correctamente en algunos tamaños) — trabajo separado
