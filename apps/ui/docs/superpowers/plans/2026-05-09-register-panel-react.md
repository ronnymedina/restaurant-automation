# Register Panel React Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `register.astro` a React reemplazando los diálogos nativos del browser con el componente `Alert` controlado ya existente.

**Architecture:** `register.astro` queda como shell mínima con `<RegisterPanel client:load />`. Toda la lógica se mueve a `RegisterPanel.tsx` que orquesta `RegisterSummaryModal.tsx` y reutiliza `Alert.tsx` de commons. Los tres diálogos nativos (`confirm`/`alert`) se reemplazan con estado React.

**Tech Stack:** React 19, Vitest 4, @testing-library/react, TypeScript, Tailwind CSS

---

## File Map

| Acción | Archivo |
|--------|---------|
| Crear | `src/components/dash/register/types.ts` |
| Crear | `src/components/dash/register/RegisterSummaryModal.tsx` |
| Crear | `src/components/dash/register/RegisterSummaryModal.test.tsx` |
| Crear | `src/components/dash/register/RegisterPanel.tsx` |
| Crear | `src/components/dash/register/RegisterPanel.test.tsx` |
| Modificar | `src/pages/dash/register.astro` |

---

### Task 1: Tipos compartidos

**Files:**
- Create: `src/components/dash/register/types.ts`

- [ ] **Step 1: Crear el archivo de tipos**

```typescript
// src/components/dash/register/types.ts
export interface RegisterData {
  id: string;
  openedAt: string;
  lastOrderNumber: number;
  user?: { email: string };
  _count?: { orders: number };
}

export interface PaymentMethodInfo {
  count: number;
  total: number;
}

export interface CloseSummary {
  totalOrders: number;
  totalSales: number;
  paymentBreakdown: Record<string, PaymentMethodInfo>;
}

export interface AlertConfig {
  type: 'error' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dash/register/types.ts
git commit -m "feat(ui): add RegisterPanel shared types"
```

---

### Task 2: RegisterSummaryModal (TDD)

**Files:**
- Create: `src/components/dash/register/RegisterSummaryModal.tsx`
- Test: `src/components/dash/register/RegisterSummaryModal.test.tsx`

- [ ] **Step 1: Escribir los tests**

```tsx
// src/components/dash/register/RegisterSummaryModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import RegisterSummaryModal from './RegisterSummaryModal';
import type { CloseSummary } from './types';

const emptySummary: CloseSummary = { totalOrders: 0, totalSales: 0, paymentBreakdown: {} };

test('renders nothing when closed', () => {
  const { container } = render(
    <RegisterSummaryModal open={false} summary={emptySummary} onClose={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('renders summary title when open', () => {
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Resumen de Caja')).toBeInTheDocument();
});

test('renders totalOrders and totalSales', () => {
  const summary: CloseSummary = { totalOrders: 12, totalSales: 480.5, paymentBreakdown: {} };
  render(<RegisterSummaryModal open={true} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('$480.50')).toBeInTheDocument();
});

test('shows Sin pedidos when paymentBreakdown is empty', () => {
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={vi.fn()} />);
  expect(screen.getByText('Sin pedidos')).toBeInTheDocument();
});

test('renders payment breakdown entries', () => {
  const summary: CloseSummary = {
    totalOrders: 2,
    totalSales: 100,
    paymentBreakdown: {
      CASH: { count: 1, total: 50 },
      CARD: { count: 1, total: 50 },
    },
  };
  render(<RegisterSummaryModal open={true} summary={summary} onClose={vi.fn()} />);
  expect(screen.getByText('CASH')).toBeInTheDocument();
  expect(screen.getByText('CARD')).toBeInTheDocument();
});

test('calls onClose when Cerrar is clicked', () => {
  const onClose = vi.fn();
  render(<RegisterSummaryModal open={true} summary={emptySummary} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
docker compose exec res-ui pnpm test RegisterSummaryModal
```

Resultado esperado: FAIL — `Cannot find module './RegisterSummaryModal'`

- [ ] **Step 3: Implementar RegisterSummaryModal**

```tsx
// src/components/dash/register/RegisterSummaryModal.tsx
import type { CloseSummary } from './types';

interface Props {
  open: boolean;
  summary: CloseSummary;
  onClose: () => void;
}

export default function RegisterSummaryModal({ open, summary, onClose }: Props) {
  if (!open) return null;

  const breakdownEntries = Object.entries(summary.paymentBreakdown);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-slate-800">Resumen de Caja</h3>
        <div className="space-y-4">
          <div className="bg-emerald-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-lg">
              <span className="font-medium">Total Pedidos</span>
              <span className="font-bold">{summary.totalOrders}</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="font-medium">Total Ventas</span>
              <span className="font-bold text-emerald-700">${summary.totalSales.toFixed(2)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-700">Desglose por Método de Pago</h4>
            {breakdownEntries.length === 0 ? (
              <p className="text-slate-400">Sin pedidos</p>
            ) : (
              breakdownEntries.map(([method, info]) => (
                <div key={method} className="flex justify-between">
                  <span>{method}</span>
                  <span>
                    {info.count} pedidos - ${info.total.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium cursor-pointer border-none hover:bg-indigo-700"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr tests — verificar que pasan**

```bash
docker compose exec res-ui pnpm test RegisterSummaryModal
```

Resultado esperado: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dash/register/RegisterSummaryModal.tsx \
        src/components/dash/register/RegisterSummaryModal.test.tsx
git commit -m "feat(ui): add RegisterSummaryModal component"
```

---

### Task 3: RegisterPanel — fundación y loadStatus (TDD)

**Files:**
- Create: `src/components/dash/register/RegisterPanel.tsx`
- Test: `src/components/dash/register/RegisterPanel.test.tsx`

- [ ] **Step 1: Escribir los tests de loadStatus**

```tsx
// src/components/dash/register/RegisterPanel.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import RegisterPanel from './RegisterPanel';

vi.mock('../../../lib/api', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '../../../lib/api';
const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

test('shows loading state initially', () => {
  mockApiFetch.mockReturnValue(new Promise(() => {}));
  render(<RegisterPanel />);
  expect(screen.getByText('Cargando...')).toBeInTheDocument();
});

test('shows closed state when API returns no active session', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => null } as Response);
  render(<RegisterPanel />);
  await waitFor(() => expect(screen.getByText('Caja Cerrada')).toBeInTheDocument());
});

test('shows closed state when API returns empty object', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  render(<RegisterPanel />);
  await waitFor(() => expect(screen.getByText('Caja Cerrada')).toBeInTheDocument());
});

test('shows open state with register data', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 'abc-123',
      openedAt: '2026-01-01T10:00:00.000Z',
      lastOrderNumber: 7,
      user: { email: 'staff@test.com' },
      _count: { orders: 4 },
    }),
  } as Response);
  render(<RegisterPanel />);
  await waitFor(() => expect(screen.getByText('Caja Abierta')).toBeInTheDocument());
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
});

test('shows permission error on 403', async () => {
  mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);
  render(<RegisterPanel />);
  await waitFor(() =>
    expect(
      screen.getByText('No tienes permisos para acceder a esta sección'),
    ).toBeInTheDocument(),
  );
});

test('shows generic error on non-403 API failure', async () => {
  mockApiFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
  render(<RegisterPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar el estado de la caja')).toBeInTheDocument(),
  );
});

test('shows error on network failure', async () => {
  mockApiFetch.mockRejectedValue(new Error('Network error'));
  render(<RegisterPanel />);
  await waitFor(() =>
    expect(screen.getByText('Error al cargar el estado de la caja')).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: FAIL — `Cannot find module './RegisterPanel'`

- [ ] **Step 3: Implementar RegisterPanel (solo fundación — sin openRegister/closeRegister aún)**

```tsx
// src/components/dash/register/RegisterPanel.tsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../../../lib/api';
import Alert from '../../commons/Alert';
import RegisterSummaryModal from './RegisterSummaryModal';
import type { RegisterData, CloseSummary, AlertConfig } from './types';

const EyeOffIcon = () => (
  <svg
    className="w-4 h-4 inline"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const EyeIcon = () => (
  <svg
    className="w-4 h-4 inline"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function RegisterPanel() {
  const [status, setStatus] = useState<'loading' | 'open' | 'closed' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [registerData, setRegisterData] = useState<RegisterData | null>(null);
  const [alert, setAlert] = useState<AlertConfig | null>(null);
  const [summaryData, setSummaryData] = useState<CloseSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showId, setShowId] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setStatus('loading');
    try {
      const res = await apiFetch('/v1/cash-register/current');
      if (!res.ok) {
        const msg =
          res.status === 403
            ? 'No tienes permisos para acceder a esta sección'
            : 'Error al cargar el estado de la caja';
        setErrorMessage(msg);
        setStatus('error');
        return;
      }
      const data = await res.json();
      if (!data || !data.id) {
        setRegisterData(null);
        setStatus('closed');
      } else {
        setRegisterData(data);
        setShowId(false);
        setShowEmail(false);
        setStatus('open');
      }
    } catch {
      setErrorMessage('Error al cargar el estado de la caja');
      setStatus('error');
    }
  }

  async function openRegister() {}

  function handleCloseRegisterClick() {}

  function renderContent() {
    if (status === 'loading') {
      return <p className="text-slate-400 text-center">Cargando...</p>;
    }
    if (status === 'error') {
      return <p className="text-red-400 text-center">{errorMessage}</p>;
    }
    if (status === 'closed') {
      return (
        <div className="text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h3 className="text-xl font-semibold text-slate-700">Caja Cerrada</h3>
          <p className="text-slate-500">No hay una sesión de caja abierta.</p>
          <button
            type="button"
            onClick={openRegister}
            className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer border-none"
          >
            Abrir Caja
          </button>
        </div>
      );
    }
    const d = registerData!;
    const openedAt = new Date(d.openedAt).toLocaleString();
    const orderCount = d._count?.orders ?? 0;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
          <h3 className="text-xl font-semibold text-emerald-700">Caja Abierta</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">ID de sesión</p>
            <p className="text-sm font-mono text-slate-700 break-all flex items-center gap-1">
              <span className="font-mono text-sm">{showId ? d.id : '••••••••'}</span>
              <button
                type="button"
                onClick={() => setShowId((v) => !v)}
                className="ml-1.5 text-slate-400 hover:text-slate-600 cursor-pointer align-middle p-0.5"
                title="Mostrar/ocultar"
              >
                {showId ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Abierta por</p>
            <p className="text-lg font-semibold flex items-center gap-1">
              <span className="text-base font-semibold">
                {showEmail ? (d.user?.email ?? '-') : '••••••••'}
              </span>
              <button
                type="button"
                onClick={() => setShowEmail((v) => !v)}
                className="ml-1.5 text-slate-400 hover:text-slate-600 cursor-pointer align-middle p-0.5"
                title="Mostrar/ocultar"
              >
                {showEmail ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Abierta desde</p>
            <p className="text-lg font-semibold">{openedAt}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Pedidos</p>
            <p className="text-lg font-semibold">{orderCount}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500">Último # de orden</p>
            <p className="text-lg font-semibold">{d.lastOrderNumber}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCloseRegisterClick}
          className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer border-none"
        >
          Cerrar Caja
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Caja Registradora</h2>
      <div className="bg-white rounded-xl border border-slate-200 p-6">{renderContent()}</div>
      {alert && (
        <Alert
          open={true}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onConfirm={alert.onConfirm}
          onCancel={alert.onCancel}
        />
      )}
      {showSummary && summaryData && (
        <RegisterSummaryModal
          open={showSummary}
          summary={summaryData}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr tests — verificar que pasan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dash/register/RegisterPanel.tsx \
        src/components/dash/register/RegisterPanel.test.tsx
git commit -m "feat(ui): add RegisterPanel with loadStatus states"
```

---

### Task 4: RegisterPanel — openRegister (TDD)

**Files:**
- Modify: `src/components/dash/register/RegisterPanel.tsx`
- Modify: `src/components/dash/register/RegisterPanel.test.tsx`

- [ ] **Step 1: Agregar tests de openRegister al test file**

Agregar al final de `RegisterPanel.test.tsx`:

```tsx
// --- openRegister ---

test('clicking Abrir Caja calls open API endpoint', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response) // loadStatus → closed
    .mockResolvedValueOnce({ ok: true } as Response) // openRegister
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response); // loadStatus after open

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Abrir Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Caja' }));

  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/v1/cash-register/open', { method: 'POST' }),
  );
});

test('shows error Alert when openRegister API fails', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Ya hay una caja abierta' }),
    } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Abrir Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Caja' }));

  await waitFor(() =>
    expect(screen.getByText('Ya hay una caja abierta')).toBeInTheDocument(),
  );
});

test('shows fallback error message when openRegister fails without message', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response)
    .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Abrir Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Caja' }));

  await waitFor(() =>
    expect(screen.getByText('Error al abrir caja')).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Correr tests — verificar que los nuevos fallan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: 3 nuevos tests FAIL (openRegister vacío no llama API ni muestra alert)

- [ ] **Step 3: Implementar openRegister en RegisterPanel.tsx**

Reemplazar la función `openRegister` vacía:

```tsx
async function openRegister() {
  const res = await apiFetch('/v1/cash-register/open', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    setAlert({
      type: 'error',
      title: 'Error',
      message: err?.message || 'Error al abrir caja',
      onConfirm: () => setAlert(null),
    });
    return;
  }
  loadStatus();
}
```

- [ ] **Step 4: Correr todos los tests — verificar que pasan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dash/register/RegisterPanel.tsx \
        src/components/dash/register/RegisterPanel.test.tsx
git commit -m "feat(ui): implement openRegister with error Alert"
```

---

### Task 5: RegisterPanel — closeRegister (TDD)

**Files:**
- Modify: `src/components/dash/register/RegisterPanel.tsx`
- Modify: `src/components/dash/register/RegisterPanel.test.tsx`

El componente `Alert` para `type: 'warning'` muestra un botón con label `'Confirmar'` (defaultConfirm del config) y uno con label `'Cancelar'` (cancelLabel por defecto).

- [ ] **Step 1: Agregar tests de closeRegister al test file**

Agregar al final de `RegisterPanel.test.tsx`:

```tsx
// --- closeRegister ---

const openData = {
  id: 'shift-abc',
  openedAt: '2026-01-01T10:00:00.000Z',
  lastOrderNumber: 3,
  user: { email: 'admin@test.com' },
  _count: { orders: 2 },
};

test('clicking Cerrar Caja shows warning Alert', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  expect(screen.getByText('¿Estás seguro de cerrar la caja?')).toBeInTheDocument();
});

test('canceling close Alert hides it', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByText('¿Estás seguro de cerrar la caja?')).not.toBeInTheDocument();
});

test('confirming close calls close API endpoint', async () => {
  const summary = { totalOrders: 2, totalSales: 100, paymentBreakdown: {} };
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ summary }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() =>
    expect(mockApiFetch).toHaveBeenCalledWith('/v1/cash-register/close', { method: 'POST' }),
  );
});

test('shows RegisterSummaryModal on successful close', async () => {
  const summary = { totalOrders: 5, totalSales: 250, paymentBreakdown: {} };
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ summary }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => null } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() => expect(screen.getByText('Resumen de Caja')).toBeInTheDocument());
  expect(screen.getByText('$250.00')).toBeInTheDocument();
});

test('shows error Alert on PENDING_ORDERS_ON_SHIFT', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        code: 'PENDING_ORDERS_ON_SHIFT',
        details: { pendingCount: 3 },
      }),
    } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() =>
    expect(
      screen.getByText(/Hay 3 pedido\(s\) pendiente\(s\)/),
    ).toBeInTheDocument(),
  );
});

test('shows error Alert on generic close failure', async () => {
  mockApiFetch
    .mockResolvedValueOnce({ ok: true, json: async () => openData } as Response)
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Error interno' }),
    } as Response);

  render(<RegisterPanel />);
  await waitFor(() => screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

  await waitFor(() =>
    expect(screen.getByText('Error interno')).toBeInTheDocument(),
  );
});
```

- [ ] **Step 2: Correr tests — verificar que los nuevos fallan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: 6 nuevos tests FAIL (`handleCloseRegisterClick` vacío)

- [ ] **Step 3: Implementar handleCloseRegisterClick y performClose en RegisterPanel.tsx**

Reemplazar las funciones vacías:

```tsx
function handleCloseRegisterClick() {
  setAlert({
    type: 'warning',
    title: 'Cerrar caja',
    message: '¿Estás seguro de cerrar la caja?',
    onConfirm: performClose,
    onCancel: () => setAlert(null),
  });
}

async function performClose() {
  setAlert(null);
  const res = await apiFetch('/v1/cash-register/close', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (err?.code === 'PENDING_ORDERS_ON_SHIFT') {
      const count = err.details?.pendingCount ?? 'algunos';
      setAlert({
        type: 'error',
        title: 'No se puede cerrar',
        message: `Hay ${count} pedido(s) pendiente(s). Completa o cancela los pedidos antes de cerrar.`,
        onConfirm: () => setAlert(null),
      });
    } else {
      setAlert({
        type: 'error',
        title: 'Error',
        message: err?.message || 'Error al cerrar caja',
        onConfirm: () => setAlert(null),
      });
    }
    return;
  }
  const data = await res.json();
  setSummaryData(data.summary);
  setShowSummary(true);
  loadStatus();
}
```

- [ ] **Step 4: Correr todos los tests — verificar que pasan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: 16 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dash/register/RegisterPanel.tsx \
        src/components/dash/register/RegisterPanel.test.tsx
git commit -m "feat(ui): implement closeRegister with Alert confirmation"
```

---

### Task 6: Campos ofuscados + actualizar register.astro

**Files:**
- Modify: `src/components/dash/register/RegisterPanel.test.tsx`
- Modify: `src/pages/dash/register.astro`

Los campos `id` y `email` arrancan ofuscados (`••••••••`) y se revelan con el botón de ojo.

- [ ] **Step 1: Agregar tests de toggle de campos ofuscados**

Agregar al final de `RegisterPanel.test.tsx`:

```tsx
// --- obfuscated fields ---

test('id field is obfuscated by default and toggles on click', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByText('Caja Abierta'));

  expect(screen.queryByText('shift-abc')).not.toBeInTheDocument();

  const toggleButtons = screen.getAllByTitle('Mostrar/ocultar');
  fireEvent.click(toggleButtons[0]); // primer toggle = id

  expect(screen.getByText('shift-abc')).toBeInTheDocument();
});

test('email field is obfuscated by default and toggles on click', async () => {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => openData } as Response);
  render(<RegisterPanel />);
  await waitFor(() => screen.getByText('Caja Abierta'));

  expect(screen.queryByText('admin@test.com')).not.toBeInTheDocument();

  const toggleButtons = screen.getAllByTitle('Mostrar/ocultar');
  fireEvent.click(toggleButtons[1]); // segundo toggle = email

  expect(screen.getByText('admin@test.com')).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr tests — verificar que pasan**

```bash
docker compose exec res-ui pnpm test RegisterPanel
```

Resultado esperado: 18 tests PASS (los toggle ya están implementados en Task 3)

- [ ] **Step 3: Actualizar register.astro**

Reemplazar todo el contenido de `src/pages/dash/register.astro`:

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

- [ ] **Step 4: Correr todos los tests del proyecto**

```bash
docker compose exec res-ui pnpm test
```

Resultado esperado: todos los tests PASS

- [ ] **Step 5: Commit final**

```bash
git add src/components/dash/register/RegisterPanel.test.tsx \
        src/pages/dash/register.astro
git commit -m "feat(ui): migrate register page to RegisterPanel React component"
```
