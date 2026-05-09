# Alert Component — Design Spec

**Date:** 2026-05-09
**Status:** Approved

## Problema

El dashboard usa `alert()` y `confirm()` nativos del navegador para mostrar errores y confirmaciones. Son difíciles de leer, no tienen contexto visual y rompen la experiencia del usuario.

## Solución

Un componente React `Alert` montado como island en `DashboardLayout`, que reemplaza los diálogos nativos con un modal visual. Se comunica con el resto del código Astro (vanilla JS) mediante un evento DOM personalizado.

## Componente: `Alert.tsx`

**Ubicación:** `src/components/commons/Alert.tsx`

### Variantes

| Tipo | Color | Icono | Botones |
|---|---|---|---|
| `error` | Rojo (`red-500`) | 🚫 | "Entendido" |
| `warning` | Amarillo (`amber-500`) | ⚠️ | "Cancelar" + "Confirmar" |
| `success` | Verde (`emerald-500`) | ✅ | "Cerrar" |
| `info` | Índigo (`indigo-500`) | ℹ️ | "OK" |

### Props

```ts
type AlertType = 'error' | 'warning' | 'success' | 'info';

interface AlertOptions {
  type: AlertType;
  title: string;
  message: string;
  confirmLabel?: string;  // override del botón de confirmación
  cancelLabel?: string;   // solo aplica a warning
}
```

### Comportamiento

- Fondo oscurecido (backdrop `bg-black/50`) con `z-50`
- Ícono centrado en círculo de color suave (ej. `bg-red-100` para error)
- Título en `font-bold text-slate-800`, mensaje en `text-slate-600`
- Variante `warning`: dos botones ("Cancelar" + "Confirmar")
- Resto de variantes: un botón de cierre
- El backdrop no cierra el modal (requiere click en botón)
- Animación de entrada: `scale` + `opacity` con Tailwind transition
- Gestiona su propio estado visible/oculto via `useState`

### Mecanismo de comunicación

El componente escucha el evento DOM `show-alert` via `useEffect`:

```ts
// Dentro del componente, en useEffect
window.addEventListener('show-alert', (e: CustomEvent) => {
  setOptions(e.detail.options);
  setResolve(() => e.detail.resolve);
  setVisible(true);
});
```

El evento lleva un `resolve` callback para que `showAlert()` / `showConfirm()` retornen Promises.

## Helper: `alert-events.ts`

**Ubicación:** `src/lib/alert-events.ts`

Expone dos funciones que cualquier `<script>` de Astro puede importar:

```ts
// Muestra un alert. Resuelve cuando el usuario hace click en el botón.
export function showAlert(options: Omit<AlertOptions, 'cancelLabel'>): Promise<void>

// Muestra un confirm de tipo warning. Resuelve true (confirmar) o false (cancelar).
export function showConfirm(options: Pick<AlertOptions, 'title' | 'message'> & { confirmLabel?: string; cancelLabel?: string }): Promise<boolean>
```

Ambas crean una Promise, despachan `show-alert` con el `resolve` callback, y retornan la Promise.

## Montaje en el Layout

En `DashboardLayout.astro`, se agrega el island una sola vez:

```astro
import AlertIsland from '../components/commons/Alert';
---
<!-- justo antes del cierre de </body> -->
<AlertIsland client:only="react" />
```

El island es global al dashboard — todas las páginas lo heredan.

## Primer uso: `register.astro`

Solo se reemplaza el `alert()` del caso `PENDING_ORDERS_ON_SHIFT` en `closeRegister()`:

```ts
// Antes
alert(`No puedes cerrar la caja: hay ${count} pedido(s) pendiente(s).`);

// Después
import { showAlert } from '../../lib/alert-events';
await showAlert({
  type: 'error',
  title: 'No puedes cerrar la caja',
  message: `Hay ${count} pedido(s) pendiente(s). Complétalos o cancélalos antes de cerrar.`,
});
```

Los demás `alert()` y `confirm()` del archivo se migran en iteraciones posteriores.

## Archivos afectados

| Archivo | Acción |
|---|---|
| `src/components/commons/Alert.tsx` | Crear |
| `src/lib/alert-events.ts` | Crear |
| `src/layouts/DashboardLayout.astro` | Agregar island `<AlertIsland client:only="react" />` |
| `src/pages/dash/register.astro` | Reemplazar el `alert()` de PENDING_ORDERS |

## Fuera de alcance

- Migración de los demás `alert()` / `confirm()` del dashboard
- Tests unitarios del componente (se agregan en iteración posterior)
- Uso en páginas fuera del DashboardLayout (login, kiosk, etc.)
