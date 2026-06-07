# Restaurant Settings Form — React Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vanilla-JS settings page with a React component that splits fields into an editable form (name, timezone, decimal separator) and a read-only info section (slug, country, currency).

**Architecture:** New `RestaurantSettingsForm` component following the `ProductsIsland` pattern — outer component wraps in `QueryClientProvider`, inner component calls hooks. Settings are loaded via the existing `useRestaurantSettings()` hook. Currency is read-only and derived from the country already stored in the API response; no new dependencies needed.

**Tech Stack:** React 19, react-hook-form, zod, @tanstack/react-query, countries-and-timezones, apiFetch, Astro `client:load`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/dash/RestaurantSettingsForm.tsx` | **Create** | Full component — editable form + read-only info section |
| `src/components/dash/RestaurantSettingsForm.test.tsx` | **Create** | Unit tests for the component |
| `src/pages/dash/settings.astro` | **Modify** | Replace inline script with `<RestaurantSettingsForm client:load />` |

---

## Task 1: Write failing tests

**Files:**
- Create: `src/components/dash/RestaurantSettingsForm.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
// src/components/dash/RestaurantSettingsForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RestaurantSettingsForm from './RestaurantSettingsForm';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

import { apiFetch } from '../../lib/api';
const mockApiFetch = vi.mocked(apiFetch);

const SETTINGS = {
  name: 'Mi Restaurante',
  slug: 'mi-restaurante',
  timezone: 'America/Santiago',
  country: 'CL',
  currency: 'CLP',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => SETTINGS,
  } as Response);
});

describe('RestaurantSettingsForm', () => {
  it('renders editable fields after settings load', async () => {
    render(<RestaurantSettingsForm />);
    expect(await screen.findByDisplayValue('Mi Restaurante')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /zona horaria/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /punto/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /coma/i })).toBeInTheDocument();
  });

  it('renders read-only info section with slug, country, currency', async () => {
    render(<RestaurantSettingsForm />);
    await screen.findByDisplayValue('Mi Restaurante');
    expect(screen.getByText('mi-restaurante')).toBeInTheDocument();
    expect(screen.getByText('CL')).toBeInTheDocument();
    expect(screen.getByText('CLP')).toBeInTheDocument();
  });

  it('PATCH contains only changed fields — not currency, slug, or country', async () => {
    render(<RestaurantSettingsForm />);
    const nameInput = await screen.findByDisplayValue('Mi Restaurante');
    fireEvent.change(nameInput, { target: { value: 'Nuevo Nombre' } });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...SETTINGS, name: 'Nuevo Nombre' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body).toEqual({ name: 'Nuevo Nombre' });
      expect(body).not.toHaveProperty('currency');
      expect(body).not.toHaveProperty('slug');
      expect(body).not.toHaveProperty('country');
    });
  });

  it('shows success message after successful save', async () => {
    render(<RestaurantSettingsForm />);
    const nameInput = await screen.findByDisplayValue('Mi Restaurante');
    fireEvent.change(nameInput, { target: { value: 'Nuevo Nombre' } });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...SETTINGS, name: 'Nuevo Nombre' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/configuración guardada/i)).toBeInTheDocument();
  });

  it('shows error message when API returns error', async () => {
    render(<RestaurantSettingsForm />);
    const nameInput = await screen.findByDisplayValue('Mi Restaurante');
    fireEvent.change(nameInput, { target: { value: 'Otro Nombre' } });

    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Error del servidor' }),
    } as Response);

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText('Error del servidor')).toBeInTheDocument();
  });

  it('timezone select contains options from the country', async () => {
    render(<RestaurantSettingsForm />);
    await screen.findByDisplayValue('Mi Restaurante');
    expect(screen.getByRole('option', { name: 'America/Santiago' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail with "Cannot find module"**

```bash
docker compose exec res-ui pnpm test RestaurantSettingsForm
```

Expected: FAIL — `Cannot find module './RestaurantSettingsForm'`

- [ ] **Step 3: Commit the test file**

```bash
git add apps/ui/src/components/dash/RestaurantSettingsForm.test.tsx
git commit -m "test(ui): add failing tests for RestaurantSettingsForm"
```

---

## Task 2: Implement RestaurantSettingsForm component

**Files:**
- Create: `src/components/dash/RestaurantSettingsForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dash/RestaurantSettingsForm.tsx
import { useEffect, useRef, useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import ct from 'countries-and-timezones';
import { apiFetch } from '../../lib/api';
import { queryClient } from '../commons/Providers';
import { useRestaurantSettings } from '../../lib/restaurant-settings';
import type { RestaurantSettings } from '../../lib/restaurant-settings';

const schema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(255),
  timezone: z.string().min(1),
  decimalSeparator: z.enum(['.', ',']),
});
type FormValues = z.infer<typeof schema>;

function SettingsFormContent() {
  const { data: settings } = useRestaurantSettings();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', timezone: '', decimalSeparator: ',' },
  });

  const initialRef = useRef<RestaurantSettings | null>(null);

  useEffect(() => {
    reset({
      name: settings.name,
      timezone: settings.timezone,
      decimalSeparator: settings.decimalSeparator as '.' | ',',
    });
    initialRef.current = settings;
  }, [settings, reset]);

  const timezoneOptions = useMemo(
    () => ct.getCountry(settings.country)?.timezones ?? [settings.timezone],
    [settings.country, settings.timezone],
  );

  const onSubmit = async (values: FormValues) => {
    const initial = initialRef.current;
    const patch: Record<string, string> = {};
    if (values.name !== initial?.name) patch.name = values.name;
    if (values.timezone !== initial?.timezone) patch.timezone = values.timezone;
    if (values.decimalSeparator !== initial?.decimalSeparator)
      patch.decimalSeparator = values.decimalSeparator;
    if (Object.keys(patch).length === 0) return;

    setStatus('saving');
    try {
      const res = await apiFetch('/v1/restaurants/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const code = data?.code as string | undefined;
        setErrorMsg(
          code === 'TIMEZONE_NOT_AVAILABLE_FOR_COUNTRY'
            ? 'La zona horaria no está disponible para tu país.'
            : code === 'DUPLICATE_RESTAURANT'
              ? 'Ya existe un restaurante con un nombre similar.'
              : data?.message || 'Error al guardar la configuración',
        );
        setStatus('error');
        return;
      }
      const updated = await res.json();
      initialRef.current = { ...settings, ...updated };
      queryClient.setQueryData(['restaurant-settings'], { ...settings, ...updated });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 4000);
    } catch {
      setErrorMsg('Error de red al guardar la configuración');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Configuración</h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
      >
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre del restaurante
          </label>
          <input
            id="name"
            type="text"
            maxLength={255}
            {...register('name')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-1">
            Zona horaria
          </label>
          <select
            id="timezone"
            {...register('timezone')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-1">
            Formato decimal
          </legend>
          <label className="inline-flex items-center mr-4">
            <input type="radio" value="." {...register('decimalSeparator')} />
            <span className="ml-2 text-sm">Punto (1,234.56)</span>
          </label>
          <label className="inline-flex items-center">
            <input type="radio" value="," {...register('decimalSeparator')} />
            <span className="ml-2 text-sm">Coma (1.234,56)</span>
          </label>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer border-none disabled:opacity-50"
          >
            {status === 'saving' ? 'Guardando...' : 'Guardar'}
          </button>
          {status === 'saved' && (
            <p className="text-sm text-green-600">Configuración guardada</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Información del restaurante
        </h3>
        <dl className="space-y-3">
          <div className="flex items-center gap-4">
            <dt className="text-sm font-medium text-slate-500 w-24">Slug</dt>
            <dd className="text-sm text-slate-700 font-mono">{settings.slug}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm font-medium text-slate-500 w-24">País</dt>
            <dd className="text-sm text-slate-700">{settings.country}</dd>
          </div>
          <div className="flex items-center gap-4">
            <dt className="text-sm font-medium text-slate-500 w-24">Moneda</dt>
            <dd className="text-sm text-slate-700">{settings.currency}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function RestaurantSettingsForm() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsFormContent />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Run tests — expect them to pass**

```bash
docker compose exec res-ui pnpm test RestaurantSettingsForm
```

Expected: All 6 tests PASS.

- [ ] **Step 4: Commit the component**

```bash
git add apps/ui/src/components/dash/RestaurantSettingsForm.tsx
git commit -m "feat(ui): add RestaurantSettingsForm React component"
```

---

## Task 3: Update settings.astro

**Files:**
- Modify: `src/pages/dash/settings.astro`

- [ ] **Step 1: Replace the page content**

Replace the entire contents of `src/pages/dash/settings.astro` with:

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import RestaurantSettingsForm from '../../components/dash/RestaurantSettingsForm';
---

<DashboardLayout>
  <RestaurantSettingsForm client:load />
</DashboardLayout>
```

- [ ] **Step 2: Run the full test suite**

```bash
docker compose exec res-ui pnpm test
```

Expected: All tests PASS (no regressions).

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/pages/dash/settings.astro
git commit -m "feat(ui): migrate settings page to React component"
```

---

## Self-review checklist

- [x] Spec requirement "currency read-only" → info section shows `settings.currency`, no input, not in PATCH ✓
- [x] Spec requirement "currency derived from country" → displayed alongside country in info section ✓
- [x] Spec requirement "React component" → `RestaurantSettingsForm.tsx` ✓
- [x] Spec requirement "editable fields in form" → name, timezone, decimalSeparator ✓
- [x] Spec requirement "read-only below form" → separate `<dl>` section for slug/country/currency ✓
- [x] Spec requirement "only changed fields in PATCH" → diff against `initialRef.current` ✓
- [x] `useReducerState` placeholder → clarified in Task 2 Step 2 to use `useState` ✓
- [x] No references to undefined types or functions ✓
