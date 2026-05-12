---
title: Register Panel — Refactor a React
date: 2026-05-09
status: approved
---

# Register Panel — Refactor a React

## Contexto

`register.astro` tiene toda su lógica en un bloque `<script>` de vanilla TS. Esto hace imposible usar el componente `Alert.tsx` (React) para reemplazar los diálogos nativos del browser (`confirm`, `alert`). El patrón establecido en el proyecto (ver `categories.astro`) es mover la lógica de página a un componente React usado con `client:load`.

## Objetivo

Migrar `register.astro` a React para:
- Reemplazar los 3 diálogos nativos con el componente `Alert` controlado
- Seguir el patrón de componentes React del proyecto
- Facilitar testing y mejoras futuras

## Arquitectura

`register.astro` queda como shell mínima:

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import RegisterPanel from '../../components/dash/register/RegisterPanel';
---
<DashboardLayout>
  <RegisterPanel client:load />
</DashboardLayout>
```

### Nuevos archivos

```
src/components/dash/register/
  RegisterPanel.tsx          — orquestador principal
  RegisterSummaryModal.tsx   — modal de resumen de cierre
```

El componente `Alert.tsx` existente en `commons/` se reutiliza sin modificaciones.

## Diseño de `RegisterPanel`

### Estado

```ts
type AlertConfig = {
  type: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

// Estado del componente
status: 'loading' | 'open' | 'closed'
registerData: RegisterData | null     // datos del turno activo (id, user, openedAt, etc.)
alert: AlertConfig | null             // null = Alert cerrado
summaryData: CloseSummary | null      // payload de cierre para el modal
showSummary: boolean
showId: boolean                       // toggle campo ofuscado id
showEmail: boolean                    // toggle campo ofuscado email
```

### Lógica de negocio

Misma lógica que el `<script>` actual, adaptada a React:

- `loadStatus()` — fetch `GET /v1/cash-register/current`, actualiza `status` y `registerData`
- `openRegister()` — `POST /v1/cash-register/open`; en error muestra Alert tipo `error`
- `closeRegister()` — muestra Alert tipo `warning` para confirmar; en confirmación llama API; en error muestra Alert tipo `error`; en éxito almacena `summaryData` y abre `RegisterSummaryModal`

### Reemplazo de diálogos nativos

| Diálogo actual | Tipo Alert | Cuándo se muestra |
|---|---|---|
| `confirm('¿Estás seguro de cerrar la caja?')` | `warning` | Click "Cerrar Caja" |
| `alert('Error al abrir caja')` | `error` | API falla en open |
| `alert('PENDING_ORDERS / Error al cerrar')` | `error` | API falla en close |

### Campos ofuscados

Los campos `id` y `email` del turno activo se muestran/ocultan con estado React (`showId`, `showEmail`) en lugar de manipulación directa del DOM. El toggle usa el mismo icono ojo/ojo-tachado que el código actual.

## Diseño de `RegisterSummaryModal`

Componente presentacional puro. Mismo contenido que el `#summaryModal` actual.

```ts
interface RegisterSummaryModalProps {
  open: boolean;
  summary: CloseSummary;
  onClose: () => void;
}
```

- `open` controla visibilidad
- `summary` contiene `totalOrders`, `totalSales`, `paymentBreakdown`
- `onClose` llama `setShowSummary(false)` en el panel padre

## Tipos

```ts
interface RegisterData {
  id: string;
  openedAt: string;
  lastOrderNumber: number;
  user?: { email: string };
  _count?: { orders: number };
}

interface PaymentMethodInfo {
  count: number;
  total: number;
}

interface CloseSummary {
  totalOrders: number;
  totalSales: number;
  paymentBreakdown: Record<string, PaymentMethodInfo>;
}
```

## Lo que NO cambia

- La API (`apiFetch`) se usa igual que en el script actual
- El diseño visual (clases Tailwind) se mantiene idéntico
- `Alert.tsx` no se modifica
- El `DashboardLayout` no cambia
