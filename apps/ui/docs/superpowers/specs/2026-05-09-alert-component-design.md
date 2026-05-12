# Alert Component — Design Spec

**Date:** 2026-05-09
**Status:** Approved

## Problema

El dashboard usa `alert()` y `confirm()` nativos del navegador para mostrar errores y confirmaciones. Son difíciles de leer, no tienen contexto visual y rompen la experiencia del usuario.

## Solución

Un componente React `Alert` totalmente controlado por el padre via props. Sin estado interno de visibilidad, sin eventos globales, sin helpers externos. El padre maneja `open` y las opciones con `useState`, igual que un `Dialog` de cualquier librería de diseño.

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

interface AlertProps {
  open: boolean;
  type: AlertType;
  title: string;
  message: string;
  confirmLabel?: string;   // default según tipo: "Entendido", "Confirmar", "Cerrar", "OK"
  cancelLabel?: string;    // solo aplica a warning, default "Cancelar"
  onConfirm: () => void;   // click en botón primario
  onCancel?: () => void;   // click en "Cancelar" (solo warning)
}
```

### Uso en un React island

```tsx
const [alertOpen, setAlertOpen] = useState(false);
const [pendingCount, setPendingCount] = useState(0);

// Al recibir error PENDING_ORDERS_ON_SHIFT:
setPendingCount(err.details.pendingCount);
setAlertOpen(true);

// En el JSX:
<Alert
  open={alertOpen}
  type="error"
  title="No puedes cerrar la caja"
  message={`Hay ${pendingCount} pedido(s) pendiente(s). Complétalos o cancélalos antes de cerrar.`}
  onConfirm={() => setAlertOpen(false)}
/>
```

### Comportamiento

- Fondo oscurecido (backdrop `bg-black/50`) con `z-50`; solo renderiza cuando `open === true`
- Ícono centrado en círculo de color suave (ej. `bg-red-100` para error)
- Título en `font-bold text-slate-800`, mensaje en `text-slate-600`
- Variante `warning`: dos botones ("Cancelar" + "Confirmar")
- Resto de variantes: un solo botón primario
- El backdrop no cierra el modal — requiere click en botón
- Animación de entrada: `scale` + `opacity` con Tailwind transition

## Scope de este task

**Task 1 — este task:** Solo crear el componente `Alert.tsx`. Sin integración en ninguna página.

**Task 2 — siguiente task:** Convertir `register.astro` a un React island (`RegisterIsland.tsx`) e integrar `Alert` para reemplazar el `alert()` de `PENDING_ORDERS_ON_SHIFT`.

## Archivos afectados (Task 1)

| Archivo | Acción |
|---|---|
| `src/components/commons/Alert.tsx` | Crear |

## Fuera de alcance (Task 1)

- Integración en cualquier página
- Migración de `alert()` / `confirm()` existentes
- Tests unitarios
- Uso en páginas fuera del dashboard
