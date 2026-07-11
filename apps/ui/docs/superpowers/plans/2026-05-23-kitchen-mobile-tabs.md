# Kitchen Mobile Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar vista mobile a la kitchen page con tabs al fondo (Nuevos / En Proceso) y modal de confirmación para el botón "✓ LISTO".

**Architecture:** Modal.tsx recibe dos props opcionales nuevas (`dark`, `hideCloseButton`). Un nuevo React island `KitchenConfirmModal` escucha un `CustomEvent('kitchen:confirm')` despachado por el JS vanilla de la kitchen page y maneja el PATCH a la API. La kitchen page agrega CSS media queries para mobile y una barra de tabs fija al fondo visible solo en mobile.

**Tech Stack:** Astro (static output), React islands (`client:only="react"`), Tailwind CSS, Vitest + @testing-library/react (tests corren dentro de Docker).

---

## File Map

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `apps/ui/src/components/commons/Modal.tsx` | Modificar | Agregar props `dark?` y `hideCloseButton?` |
| `apps/ui/src/components/commons/Modal.test.tsx` | Crear | Tests para los nuevos props + comportamiento existente |
| `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx` | Crear | React island: escucha `kitchen:confirm`, llama API, despacha `kitchen:order-updated` |
| `apps/ui/src/components/kitchen/KitchenConfirmModal.test.tsx` | Crear | Tests del island: apertura, confirmación, error, cancelación |
| `apps/ui/src/pages/kitchen/index.astro` | Modificar | CSS mobile + tab bar HTML + import island + JS tab switching + CustomEvent bridge |

---

## Task 1: Extend Modal.tsx with `dark` and `hideCloseButton` props

**Files:**
- Create: `apps/ui/src/components/commons/Modal.test.tsx`
- Modify: `apps/ui/src/components/commons/Modal.tsx`

- [ ] **Step 1: Write failing tests**

Crear `apps/ui/src/components/commons/Modal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

test('renders title and children when open', () => {
  render(<Modal open title="Test" onClose={() => {}}><p>Content</p></Modal>);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Test')).toBeInTheDocument();
  expect(screen.getByText('Content')).toBeInTheDocument();
});

test('renders nothing when closed', () => {
  render(<Modal open={false} title="Test" onClose={() => {}}><p>X</p></Modal>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('shows Cerrar button by default', () => {
  render(<Modal open title="T" onClose={() => {}}><p>X</p></Modal>);
  expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument();
});

test('hides Cerrar button when hideCloseButton=true', () => {
  render(<Modal open title="T" onClose={() => {}} hideCloseButton><p>X</p></Modal>);
  expect(screen.queryByRole('button', { name: /cerrar/i })).not.toBeInTheDocument();
});

test('applies bg-white by default', () => {
  render(<Modal open title="T" onClose={() => {}}><p>X</p></Modal>);
  const panel = screen.getByRole('dialog').firstElementChild as HTMLElement;
  expect(panel).toHaveClass('bg-white');
});

test('applies dark bg when dark=true', () => {
  render(<Modal open title="T" onClose={() => {}} dark><p>X</p></Modal>);
  const panel = screen.getByRole('dialog').firstElementChild as HTMLElement;
  expect(panel).toHaveClass('bg-[#1e293b]');
  expect(panel).not.toHaveClass('bg-white');
});

test('calls onClose when Cerrar clicked', () => {
  const onClose = vi.fn();
  render(<Modal open title="T" onClose={onClose}><p>X</p></Modal>);
  fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec res-ui pnpm test src/components/commons/Modal.test.tsx
```

Esperado: FAIL — `hideCloseButton` y `dark` no existen en la interfaz todavía.

- [ ] **Step 3: Implement changes in Modal.tsx**

Reemplazar todo el contenido de `apps/ui/src/components/commons/Modal.tsx`:

```tsx
import { createPortal } from 'react-dom';

const SIZE_CLASSES = {
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
} as const;

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZE_CLASSES;
  dark?: boolean;
  hideCloseButton?: boolean;
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  size = 'lg',
  dark = false,
  hideCloseButton = false,
}: Props) {
  if (!open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div
        className={`${dark ? 'bg-[#1e293b] border border-slate-700' : 'bg-white'} rounded-xl w-full ${SIZE_CLASSES[size]} max-h-[85vh] overflow-y-auto p-6 space-y-4`}
      >
        <h3
          id="modal-title"
          className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-slate-800'}`}
        >
          {title}
        </h3>
        {children}
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium cursor-pointer border-none hover:bg-indigo-700"
          >
            Cerrar
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec res-ui pnpm test src/components/commons/Modal.test.tsx
```

Esperado: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/commons/Modal.tsx apps/ui/src/components/commons/Modal.test.tsx
git commit -m "feat(ui): add dark and hideCloseButton props to Modal"
```

---

## Task 2: Create KitchenConfirmModal React island

**Files:**
- Create: `apps/ui/src/components/kitchen/KitchenConfirmModal.test.tsx`
- Create: `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx`

**Context:** El island lee `slug` y `token` del search param `?slug=&token=` (con fallback a `sessionStorage`), que es el mismo mecanismo que usa el JS vanilla de la kitchen page. Se monta con `client:only="react"` en el Astro template para que no haga SSR.

- [ ] **Step 1: Write failing tests**

Crear `apps/ui/src/components/kitchen/KitchenConfirmModal.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KitchenConfirmModal from './KitchenConfirmModal';

vi.mock('../../config', () => ({
  config: { apiUrl: 'http://test-api' },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  window.history.pushState({}, '', '?slug=rest-slug&token=abc123');
  sessionStorage.clear();
});

function dispatchConfirm(detail = {}) {
  window.dispatchEvent(
    new CustomEvent('kitchen:confirm', {
      detail: {
        orderId: 'order-1',
        orderNumber: 42,
        items: [{ quantity: 2, productName: 'Tacos', notes: undefined }],
        ...detail,
      },
    }),
  );
}

test('does not show dialog initially', () => {
  render(<KitchenConfirmModal />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('opens dialog on kitchen:confirm event', () => {
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Pedido #42')).toBeInTheDocument();
  expect(screen.getByText(/2×/)).toBeInTheDocument();
  expect(screen.getByText(/Tacos/)).toBeInTheDocument();
});

test('shows notes when present', () => {
  render(<KitchenConfirmModal />);
  dispatchConfirm({ items: [{ quantity: 1, productName: 'Burrito', notes: 'sin cebolla' }] });
  expect(screen.getByText('sin cebolla')).toBeInTheDocument();
});

test('closes dialog on Cancelar click', () => {
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('calls PATCH API and dispatches kitchen:order-updated on confirm', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true });
  const listener = vi.fn();
  window.addEventListener('kitchen:order-updated', listener);

  render(<KitchenConfirmModal />);
  dispatchConfirm({ orderId: 'order-abc' });
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api/v1/kitchen/rest-slug/orders/order-abc/status?token=abc123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'SERVED' }),
      }),
    );
    expect(listener).toHaveBeenCalled();
  });

  window.removeEventListener('kitchen:order-updated', listener);
});

test('closes dialog after successful confirm', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true });
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('shows error message on known API error code', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ code: 'ORDER_NOT_FOUND' }),
  });
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.getByText('Pedido no encontrado')).toBeInTheDocument());
});

test('shows generic error on unknown API error', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({}),
  });
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.getByText('Error del servidor, intente nuevamente')).toBeInTheDocument());
});

test('shows error on network failure', async () => {
  mockFetch.mockRejectedValueOnce(new Error('network'));
  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));
  await waitFor(() => expect(screen.getByText('Error de conexión, intente nuevamente')).toBeInTheDocument());
});

test('uses sessionStorage token when not in URL', async () => {
  window.history.pushState({}, '', '?slug=rest-slug');
  sessionStorage.setItem('kitchen_token_rest-slug', 'session-token');
  mockFetch.mockResolvedValueOnce({ ok: true });

  render(<KitchenConfirmModal />);
  dispatchConfirm();
  fireEvent.click(screen.getByRole('button', { name: /confirmar listo/i }));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('token=session-token'),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec res-ui pnpm test src/components/kitchen/KitchenConfirmModal.test.tsx
```

Esperado: FAIL — el archivo no existe todavía.

- [ ] **Step 3: Create KitchenConfirmModal.tsx**

Crear `apps/ui/src/components/kitchen/KitchenConfirmModal.tsx`:

```tsx
import { useState, useEffect } from 'react';
import Modal from '../commons/Modal';
import { config } from '../../config';

interface OrderItem {
  quantity: number;
  productName: string;
  notes?: string;
}

interface OrderData {
  orderId: string;
  orderNumber: number;
  items: OrderItem[];
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STATUS_TRANSITION: 'Transición no permitida para este pedido',
  ORDER_ALREADY_CANCELLED: 'El pedido ya fue cancelado',
  ORDER_NOT_FOUND: 'Pedido no encontrado',
};

export default function KitchenConfirmModal() {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleConfirm(e: Event) {
      const detail = (e as CustomEvent<OrderData>).detail;
      setOrder(detail);
      setOpen(true);
      setError(null);
    }
    window.addEventListener('kitchen:confirm', handleConfirm);
    return () => window.removeEventListener('kitchen:confirm', handleConfirm);
  }, []);

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setOrder(null);
    setError(null);
  }

  async function handleConfirm() {
    if (!order) return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug') ?? '';
    const token =
      params.get('token') ?? sessionStorage.getItem(`kitchen_token_${slug}`) ?? '';

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/v1/kitchen/${slug}/orders/${order.orderId}/status?token=${token}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SERVED' }),
        },
      );
      if (res.ok) {
        setOpen(false);
        setOrder(null);
        window.dispatchEvent(new CustomEvent('kitchen:order-updated'));
      } else {
        let msg = 'Error del servidor, intente nuevamente';
        try {
          const body = await res.json();
          if (body?.code && ERROR_MESSAGES[body.code]) msg = ERROR_MESSAGES[body.code];
        } catch { /* ignore parse errors */ }
        setError(msg);
      }
    } catch {
      setError('Error de conexión, intente nuevamente');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Confirmar pedido listo"
      onClose={handleClose}
      dark
      hideCloseButton
    >
      {order && (
        <div>
          <p className="text-slate-300 text-sm font-bold mb-3">Pedido #{order.orderNumber}</p>
          <div className="flex flex-col gap-1 mb-4 pb-4 border-b border-slate-700">
            {order.items.map((item, i) => (
              <div key={i}>
                <span className="text-white text-base">
                  <strong>{item.quantity}×</strong> {item.productName}
                </span>
                {item.notes && (
                  <p className="text-yellow-400 text-sm italic ml-4 mt-0.5">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 py-3 bg-slate-700 text-slate-200 rounded-lg font-bold text-base cursor-pointer border-none hover:bg-slate-600 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-3 bg-orange-600 text-white rounded-lg font-bold text-base cursor-pointer border-none hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? 'Confirmando...' : '✓ Confirmar listo'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec res-ui pnpm test src/components/kitchen/KitchenConfirmModal.test.tsx
```

Esperado: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/kitchen/KitchenConfirmModal.tsx apps/ui/src/components/kitchen/KitchenConfirmModal.test.tsx
git commit -m "feat(ui): add KitchenConfirmModal React island"
```

---

## Task 3: Update kitchen/index.astro — mobile layout + tab bar + JS bridge

**Files:**
- Modify: `apps/ui/src/pages/kitchen/index.astro`

**Context:** No hay tests unitarios para la lógica vanilla JS de esta page (es DOM directo). La verificación es visual en el browser. Tres cambios en un solo archivo: (1) CSS media queries, (2) HTML del tab bar + import del island, (3) JS tab switching + CustomEvent bridge.

- [ ] **Step 1: Replace kitchen/index.astro with the updated version**

Reemplazar todo el contenido de `apps/ui/src/pages/kitchen/index.astro`:

```astro
---
import KitchenConfirmModal from '../../components/kitchen/KitchenConfirmModal';
---

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cocina</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; color: #f9fafb; font-family: system-ui, sans-serif; min-height: 100vh; }

    #mobileTabBar { display: none; }

    @media (max-width: 640px) {
      #kitchenMain {
        grid-template-columns: 1fr !important;
        padding-bottom: 64px;
      }
      #colWrapCreated,
      #colWrapProcessing {
        display: none;
        border-right: none !important;
      }
      #colWrapCreated.tab-visible,
      #colWrapProcessing.tab-visible {
        display: flex;
      }
      #mobileTabBar {
        display: flex;
      }
    }
  </style>
</head>
<body>

  <!-- Connection status banner -->
  <div id="connBanner" style="display:none;position:fixed;top:0;left:0;right:0;z-index:50;text-align:center;padding:8px;font-size:14px;font-weight:600;"></div>

  <!-- Action error toast -->
  <div id="errorToast" style="display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:60;background:#dc2626;color:white;padding:14px 24px;border-radius:12px;font-size:16px;font-weight:600;box-shadow:0 4px 24px rgba(0,0,0,0.5);max-width:480px;text-align:center;"></div>

  <!-- Offline overlay -->
  <div id="offlineOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:50;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;">
    <div style="font-size:64px;">📡</div>
    <h2 style="font-size:28px;font-weight:700;color:white;">Sin conexión</h2>
    <p style="color:#9ca3af;text-align:center;max-width:400px;">La pantalla de cocina está desconectada.<br/>El equipo del restaurante fue notificado.</p>
    <p style="color:#4b5563;font-size:14px;">Reconectando automáticamente...</p>
  </div>

  <!-- Header -->
  <header style="background:#1f2937;border-bottom:1px solid #374151;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;">
    <h1 style="font-size:20px;font-weight:700;letter-spacing:0.05em;">🍳 COCINA</h1>
    <div id="connDot" style="width:12px;height:12px;border-radius:50%;background:#4ade80;"></div>
  </header>

  <!-- Kanban: NUEVOS | EN PROCESO -->
  <main id="kitchenMain" style="display:grid;grid-template-columns:1fr 1fr;min-height:calc(100vh - 64px);">

    <!-- NUEVOS (CONFIRMED) -->
    <div id="colWrapCreated" style="border-right:1px solid #374151;display:flex;flex-direction:column;">
      <div style="background:rgba(139,92,246,0.15);border-bottom:1px solid rgba(139,92,246,0.3);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:18px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.1em;">Confirmados</h2>
        <span id="countCreated" style="background:rgba(167,139,250,0.25);color:#c4b5fd;font-size:14px;font-weight:700;padding:4px 12px;border-radius:9999px;">0</span>
      </div>
      <div id="colCreated" style="flex:1;padding:16px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;">
        <p style="color:#4b5563;text-align:center;padding:32px 0;">Cargando...</p>
      </div>
    </div>

    <!-- EN PROCESO (PROCESSING) -->
    <div id="colWrapProcessing" style="display:flex;flex-direction:column;">
      <div style="background:rgba(59,130,246,0.15);border-bottom:1px solid rgba(59,130,246,0.3);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:18px;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:0.1em;">En Proceso</h2>
        <span id="countProcessing" style="background:rgba(59,130,246,0.25);color:#93c5fd;font-size:14px;font-weight:700;padding:4px 12px;border-radius:9999px;">0</span>
      </div>
      <div id="colProcessing" style="flex:1;padding:16px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;">
        <p style="color:#4b5563;text-align:center;padding:32px 0;">Cargando...</p>
      </div>
    </div>
  </main>

  <!-- Mobile tab bar (hidden on desktop via CSS) -->
  <nav id="mobileTabBar" style="position:fixed;bottom:0;left:0;right:0;background:#111827;border-top:1px solid #374151;z-index:40;">
    <button
      id="tabCreated"
      type="button"
      style="flex:1;padding:10px 6px;text-align:center;background:none;border:none;cursor:pointer;border-top:3px solid transparent;"
      onclick="switchTab('created')"
    >
      <div style="font-size:20px;">📋</div>
      <div id="tabCreatedLabel" style="font-size:10px;font-weight:700;margin-top:2px;">Nuevos</div>
      <div id="tabCreatedBadge" style="border-radius:9999px;padding:1px 8px;font-size:10px;font-weight:700;display:inline-block;margin-top:3px;">0</div>
    </button>
    <button
      id="tabProcessing"
      type="button"
      style="flex:1;padding:10px 6px;text-align:center;background:none;border:none;cursor:pointer;border-top:3px solid transparent;"
      onclick="switchTab('processing')"
    >
      <div style="font-size:20px;">🔥</div>
      <div id="tabProcessingLabel" style="font-size:10px;font-weight:700;margin-top:2px;">En Proceso</div>
      <div id="tabProcessingBadge" style="border-radius:9999px;padding:1px 8px;font-size:10px;font-weight:700;display:inline-block;margin-top:3px;">0</div>
    </button>
  </nav>

  <!-- Confirmation modal (React island, client-only) -->
  <KitchenConfirmModal client:only="react" />

</body>
</html>

<script>
  import { ORDER_EVENTS } from '../../lib/sse-events';
  import { config } from '../../config';

  const API_URL = config.apiUrl;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') ?? '';
  const urlToken = params.get('token') ?? '';
  const token = urlToken || sessionStorage.getItem(`kitchen_token_${slug}`) || '';

  if (!token) {
    document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:#ef4444;font-size:1.5rem">Token de cocina requerido</div>';
    throw new Error('No kitchen token');
  }

  if (urlToken) sessionStorage.setItem(`kitchen_token_${slug}`, urlToken);

  const colCreated = document.getElementById('colCreated')!;
  const colProcessing = document.getElementById('colProcessing')!;
  const countCreated = document.getElementById('countCreated')!;
  const countProcessing = document.getElementById('countProcessing')!;
  const connBanner = document.getElementById('connBanner')!;
  const connDot = document.getElementById('connDot')!;
  const offlineOverlay = document.getElementById('offlineOverlay')!;
  const errorToast = document.getElementById('errorToast')!;
  const tabCreatedBadge = document.getElementById('tabCreatedBadge')!;
  const tabProcessingBadge = document.getElementById('tabProcessingBadge')!;

  let notifiedOffline = false;
  const ordersMap = new Map<string, any>();

  // ── Tab switching ─────────────────────────────────────────────────

  function switchTab(tab: 'created' | 'processing') {
    const wrapCreated = document.getElementById('colWrapCreated')!;
    const wrapProcessing = document.getElementById('colWrapProcessing')!;
    const tabCreated = document.getElementById('tabCreated')!;
    const tabProcessing = document.getElementById('tabProcessing')!;
    const tabCreatedLabel = document.getElementById('tabCreatedLabel')!;
    const tabProcessingLabel = document.getElementById('tabProcessingLabel')!;

    if (tab === 'created') {
      wrapCreated.classList.add('tab-visible');
      wrapProcessing.classList.remove('tab-visible');
      tabCreated.style.borderTopColor = '#a78bfa';
      tabCreated.style.background = 'rgba(139,92,246,0.12)';
      tabCreatedLabel.style.color = '#a78bfa';
      tabCreatedBadge.style.background = '#a78bfa';
      tabCreatedBadge.style.color = '#0f172a';
      tabProcessing.style.borderTopColor = 'transparent';
      tabProcessing.style.background = 'none';
      tabProcessingLabel.style.color = '#4b5563';
      tabProcessingBadge.style.background = '#374151';
      tabProcessingBadge.style.color = '#6b7280';
    } else {
      wrapProcessing.classList.add('tab-visible');
      wrapCreated.classList.remove('tab-visible');
      tabProcessing.style.borderTopColor = '#60a5fa';
      tabProcessing.style.background = 'rgba(59,130,246,0.12)';
      tabProcessingLabel.style.color = '#60a5fa';
      tabProcessingBadge.style.background = '#60a5fa';
      tabProcessingBadge.style.color = '#0f172a';
      tabCreated.style.borderTopColor = 'transparent';
      tabCreated.style.background = 'none';
      tabCreatedLabel.style.color = '#4b5563';
      tabCreatedBadge.style.background = '#374151';
      tabCreatedBadge.style.color = '#6b7280';
    }
  }

  // Initialize mobile tab state (Nuevos active by default)
  switchTab('created');

  // Expose switchTab globally for inline onclick handlers
  (window as any).switchTab = switchTab;

  // ── API helper ────────────────────────────────────────────────────

  async function kitchenFetch(path: string, options: RequestInit = {}) {
    const sep = path.includes('?') ? '&' : '?';
    return fetch(`${API_URL}${path}${sep}token=${token}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  }

  // ── Connection UI ─────────────────────────────────────────────────

  function showBanner(msg: string, bg: string, color: string) {
    Object.assign(connBanner.style, { display: 'block', background: bg, color });
    connBanner.textContent = msg;
  }

  function hideBanner() { connBanner.style.display = 'none'; }

  function setConnected() {
    connDot.style.background = '#4ade80';
    hideBanner();
    offlineOverlay.style.display = 'none';
    notifiedOffline = false;
  }

  function setOffline() {
    connDot.style.background = '#f87171';
    offlineOverlay.style.display = 'flex';
    if (!notifiedOffline) {
      notifiedOffline = true;
      kitchenFetch(`/v1/kitchen/${slug}/notify-offline`, { method: 'POST' }).catch(() => {});
    }
  }

  let errorToastTimer: ReturnType<typeof setTimeout> | null = null;
  function showErrorToast(msg: string) {
    errorToast.textContent = msg;
    errorToast.style.display = 'block';
    if (errorToastTimer) clearTimeout(errorToastTimer);
    errorToastTimer = setTimeout(() => { errorToast.style.display = 'none'; }, 4000);
  }

  // ── Render cards ──────────────────────────────────────────────────

  function renderCard(order: any): string {
    const time = order.displayTime;
    const items = (order.items || []).map((i: any) => {
      const note = i.notes ? `<p style="color:#fbbf24;font-size:16px;font-style:italic;margin-left:16px;margin-top:4px;">${i.notes}</p>` : '';
      return `<p style="color:white;font-size:22px;font-weight:500;"><span style="font-size:26px;font-weight:900;">${i.quantity}×</span> ${i.product?.name || i.productName || '?'}</p>${note}`;
    }).join('');

    const actionBtn = order.status === 'CONFIRMED'
      ? `<button data-advance="${order.id}" data-next="PROCESSING"
           style="width:100%;padding:20px;font-size:20px;font-weight:900;background:#2563eb;color:white;border:none;border-radius:12px;cursor:pointer;margin-top:8px;">
           EN PROCESO →
         </button>`
      : `<button data-advance="${order.id}" data-next="SERVED"
           style="width:100%;padding:20px;font-size:20px;font-weight:900;background:#ea580c;color:white;border:none;border-radius:12px;cursor:pointer;margin-top:8px;">
           ✓ LISTO
         </button>`;

    return `
      <div style="background:#1f2937;border:1px solid #374151;border-radius:16px;padding:20px;" data-order-id="${order.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:32px;font-weight:900;color:white;">#${order.orderNumber}</span>
          <span style="color:#6b7280;font-size:16px;">${time}</span>
        </div>
        <div style="border-top:1px solid #374151;padding-top:12px;display:flex;flex-direction:column;gap:4px;">${items}</div>
        ${actionBtn}
      </div>
    `;
  }

  function bindCardEvents(container: HTMLElement) {
    container.querySelectorAll('[data-advance]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const el = btn as HTMLElement;
        const orderId = el.dataset.advance!;
        const next = el.dataset.next!;

        // "✓ LISTO" button: delegate to confirmation modal
        if (next === 'SERVED') {
          const order = ordersMap.get(orderId);
          window.dispatchEvent(new CustomEvent('kitchen:confirm', {
            detail: {
              orderId,
              orderNumber: order?.orderNumber,
              items: (order?.items || []).map((i: any) => ({
                quantity: i.quantity,
                productName: i.product?.name || i.productName || '?',
                notes: i.notes,
              })),
            },
          }));
          return;
        }

        // "EN PROCESO →" button: advance directly, no confirmation
        (btn as HTMLButtonElement).disabled = true;
        const res = await kitchenFetch(`/v1/kitchen/${slug}/orders/${orderId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: next }),
        });
        (btn as HTMLButtonElement).disabled = false;
        if (res.ok) {
          loadOrders();
        } else {
          const ERROR_MESSAGES: Record<string, string> = {
            INVALID_STATUS_TRANSITION: 'Transición no permitida para este pedido',
            ORDER_ALREADY_CANCELLED: 'El pedido ya fue cancelado',
            ORDER_NOT_FOUND: 'Pedido no encontrado',
          };
          let msg = 'Error del servidor, intente nuevamente';
          try {
            const body = await res.json();
            if (body?.code && ERROR_MESSAGES[body.code]) msg = ERROR_MESSAGES[body.code];
          } catch { /* ignore parse errors */ }
          showErrorToast(msg);
        }
      });
    });
  }

  // ── Load orders ───────────────────────────────────────────────────

  async function loadOrders() {
    const res = await kitchenFetch(`/v1/kitchen/${slug}/orders`).catch(() => null);
    if (!res || !res.ok) return;

    const orders: any[] = await res.json();

    // Keep ordersMap in sync for the confirm modal
    ordersMap.clear();
    orders.forEach((o) => ordersMap.set(o.id, o));

    const created = orders.filter((o) => o.status === 'CONFIRMED');
    const processing = orders.filter((o) => o.status === 'PROCESSING');

    countCreated.textContent = String(created.length);
    countProcessing.textContent = String(processing.length);
    tabCreatedBadge.textContent = String(created.length);
    tabProcessingBadge.textContent = String(processing.length);

    const empty = '<p style="color:#4b5563;text-align:center;padding:48px 0;font-size:18px;">Sin pedidos</p>';
    colCreated.innerHTML = created.length ? created.map(renderCard).join('') : empty;
    colProcessing.innerHTML = processing.length ? processing.map(renderCard).join('') : empty;

    bindCardEvents(colCreated);
    bindCardEvents(colProcessing);
  }

  // ── SSE ───────────────────────────────────────────────────────────

  const es = new EventSource(`${API_URL}/v1/events/kitchen?slug=${slug}&token=${token}`);

  es.onopen = () => { setConnected(); loadOrders(); };
  es.onerror = () => { setOffline(); };
  es.addEventListener(ORDER_EVENTS.NEW, () => loadOrders());
  es.addEventListener(ORDER_EVENTS.UPDATED, () => loadOrders());

  // Reload after confirmation modal confirms a SERVED transition
  window.addEventListener('kitchen:order-updated', () => loadOrders());

  window.addEventListener('beforeunload', () => es.close());
  loadOrders();
</script>
```

- [ ] **Step 2: Run all UI tests to confirm nothing broke**

```bash
docker compose exec res-ui pnpm test
```

Esperado: todos los tests existentes + los nuevos pasan.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/pages/kitchen/index.astro
git commit -m "feat(ui): add mobile tabs and confirm modal to kitchen page"
```

---

## Task 4: Manual verification in browser

**Context:** La lógica de tab switching es vanilla DOM + CSS. La verificación es visual.

- [ ] **Step 1: Abrir la kitchen page en desktop**

```
http://localhost:4321/kitchen?slug=<slug>&token=<token>
```

Verificar:
- El grid 2 columnas se muestra normalmente
- El tab bar NO es visible
- Los botones "EN PROCESO →" siguen funcionando sin modal
- El botón "✓ LISTO" abre el modal de confirmación

- [ ] **Step 2: Abrir en mobile (DevTools → responsive, ancho ≤640px)**

Verificar:
- Solo se ve 1 columna a la vez
- Tab bar visible en la parte inferior
- Tab "Nuevos" activo por defecto (color purple, badge con count)
- Click en "En Proceso" cambia la columna visible (color blue)
- Los badges se actualizan cuando llegan nuevos pedidos via SSE

- [ ] **Step 3: Probar el modal de confirmación en mobile**

- Ir a tab "En Proceso"
- Tocar "✓ LISTO" en un pedido
- Verificar que el modal aparece con el número de pedido y los ítems
- Click "Cancelar" — modal cierra, pedido no cambia
- Tocar "✓ LISTO" de nuevo → Click "✓ Confirmar listo" — pedido desaparece, lista se actualiza

- [ ] **Step 4: Probar en dispositivo físico (opcional pero recomendado)**

La kitchen page se usa en mobile real. Si tenés un celular en la misma red, abrir `http://<ip-local>:4321/kitchen?slug=<slug>&token=<token>` y probar los gestos touch.
