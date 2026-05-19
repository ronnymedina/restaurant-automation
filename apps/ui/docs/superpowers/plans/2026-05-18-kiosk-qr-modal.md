# Kiosk QR Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Kiosko público" sidebar link in the dashboard with a React island that opens a modal showing the kiosk URL (copy + open in new tab) and a QR code cached in localStorage.

**Architecture:** Extract QR generation + localStorage caching into a testable utility (`kiosk-qr.ts`). Build a self-contained React island (`KioskQrButton.tsx`) that fetches the slug internally, owns the button + modal state, and renders the QR. Wire it into `DashboardLayout.astro` as an Astro island (`client:load`), removing the old vanilla-JS kiosk block. Keep a minimal vanilla-JS call for the support email prefill that was previously bundled in `loadKioskLink`.

**Tech Stack:** Astro, React 19, Tailwind CSS, `qrcode` npm package (browser build), `@tanstack/react-query`, vitest + @testing-library/react for tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `apps/ui/src/lib/kiosk-qr.ts` | `getOrGenerateQR(slug, kioskUrl)` — generate QR data URL + localStorage cache |
| Create | `apps/ui/src/lib/kiosk-qr.test.ts` | Unit tests for cache hit/miss logic |
| Create | `apps/ui/src/components/dash/KioskQrButton.tsx` | React island: button + modal + QR render |
| Create | `apps/ui/src/components/dash/KioskQrButton.test.tsx` | React component tests |
| Modify | `apps/ui/src/layouts/DashboardLayout.astro` | Remove old kiosk vanilla-JS block; add `<KioskQrButton client:load />`; keep email prefill as separate minimal fetch |

---

## Task 1: Install the `qrcode` package

**Files:**
- Modify: `apps/ui/package.json` (via pnpm)

`src/` y `public/` están montados como volumes, pero `package.json` y `pnpm-lock.yaml` NO — viven solo dentro de la imagen. Por eso los paquetes **deben instalarse dentro del contenedor** (para que queden en `node_modules`), y luego hay que copiar el `package.json` y `pnpm-lock.yaml` actualizados al local antes de hacer commit. El lock file local es lo que Railway usa en el build de producción.

- [ ] **Step 1: Install packages inside the running container**

```bash
docker compose exec res-ui pnpm add qrcode
docker compose exec res-ui pnpm add -D @types/qrcode
```

- [ ] **Step 2: Copy the updated `package.json` and lock file from the container to local**

```bash
docker compose cp res-ui:/app/package.json apps/ui/package.json
docker compose cp res-ui:/app/pnpm-lock.yaml apps/ui/pnpm-lock.yaml
```

- [ ] **Step 3: Verify the package appears in the local `package.json`**

```bash
grep '"qrcode"' apps/ui/package.json
```

Expected output contains: `"qrcode": "^x.x.x"`

- [ ] **Step 4: Commit both files**

```bash
git add apps/ui/package.json apps/ui/pnpm-lock.yaml
git commit -m "chore(ui): add qrcode package for kiosk QR generation"
```

---

## Task 2: Create `kiosk-qr.ts` utility with caching

**Files:**
- Create: `apps/ui/src/lib/kiosk-qr.ts`
- Create: `apps/ui/src/lib/kiosk-qr.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/lib/kiosk-qr.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,GENERATED'),
  },
}));

import QRCode from 'qrcode';
import { getOrGenerateQR, QR_CACHE_KEY } from './kiosk-qr';

describe('getOrGenerateQR', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('generates and caches QR when not in localStorage', async () => {
    const result = await getOrGenerateQR('mi-restaurante', 'https://app.com/kiosk?slug=mi-restaurante');

    expect(result).toBe('data:image/png;base64,GENERATED');
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://app.com/kiosk?slug=mi-restaurante',
      { width: 240, margin: 2 },
    );
    expect(localStorage.getItem(QR_CACHE_KEY('mi-restaurante'))).toBe('data:image/png;base64,GENERATED');
  });

  it('returns cached QR from localStorage without regenerating', async () => {
    localStorage.setItem(QR_CACHE_KEY('mi-restaurante'), 'data:image/png;base64,CACHED');

    const result = await getOrGenerateQR('mi-restaurante', 'https://app.com/kiosk?slug=mi-restaurante');

    expect(result).toBe('data:image/png;base64,CACHED');
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
  });

  it('generates separate cache entries for different slugs', async () => {
    vi.mocked(QRCode.toDataURL)
      .mockResolvedValueOnce('data:image/png;base64,QR_A')
      .mockResolvedValueOnce('data:image/png;base64,QR_B');

    await getOrGenerateQR('resto-a', 'https://app.com/kiosk?slug=resto-a');
    await getOrGenerateQR('resto-b', 'https://app.com/kiosk?slug=resto-b');

    expect(localStorage.getItem(QR_CACHE_KEY('resto-a'))).toBe('data:image/png;base64,QR_A');
    expect(localStorage.getItem(QR_CACHE_KEY('resto-b'))).toBe('data:image/png;base64,QR_B');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-ui pnpm test src/lib/kiosk-qr.test.ts
```

Expected: FAIL — `Cannot find module './kiosk-qr'`

- [ ] **Step 3: Create `apps/ui/src/lib/kiosk-qr.ts`**

```typescript
import QRCode from 'qrcode';

export const QR_CACHE_KEY = (slug: string) => `kiosk-qr-${slug}`;

export async function getOrGenerateQR(slug: string, kioskUrl: string): Promise<string> {
  const cached = localStorage.getItem(QR_CACHE_KEY(slug));
  if (cached) return cached;

  const dataUrl = await QRCode.toDataURL(kioskUrl, { width: 240, margin: 2 });
  localStorage.setItem(QR_CACHE_KEY(slug), dataUrl);
  return dataUrl;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
docker compose exec res-ui pnpm test src/lib/kiosk-qr.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/lib/kiosk-qr.ts apps/ui/src/lib/kiosk-qr.test.ts
git commit -m "feat(ui): add kiosk QR generation utility with localStorage cache"
```

---

## Task 3: Create `KioskQrButton` React island

**Files:**
- Create: `apps/ui/src/components/dash/KioskQrButton.tsx`
- Create: `apps/ui/src/components/dash/KioskQrButton.test.tsx`

The component fetches `/v1/auth/me` on mount to get the slug, then derives `kioskUrl`. It renders nothing while loading and nothing if no slug is found. The button opens the modal; opening the modal triggers QR generation (via `getOrGenerateQR`, which reads from cache on subsequent opens).

- [ ] **Step 1: Write the failing tests**

Create `apps/ui/src/components/dash/KioskQrButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KioskQrButton from './KioskQrButton';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../lib/kiosk-qr', () => ({
  getOrGenerateQR: vi.fn().mockResolvedValue('data:image/png;base64,QR'),
}));

vi.mock('../../config', () => ({
  config: { storefrontUrl: 'https://app.example.com' },
}));

import { apiFetch } from '../../lib/api';
import { getOrGenerateQR } from '../../lib/kiosk-qr';

const mockMe = (slug: string) =>
  vi.mocked(apiFetch).mockResolvedValue({
    ok: true,
    json: async () => ({ restaurant: { slug }, email: 'admin@test.com' }),
  } as Response);

describe('KioskQrButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing while loading slug', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<KioskQrButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when slug is missing', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ restaurant: null }),
    } as Response);

    const { container } = render(<KioskQrButton />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows the button after slug loads', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    expect(await screen.findByRole('button', { name: /ver qr y enlace/i })).toBeInTheDocument();
  });

  it('opens modal when button is clicked', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    fireEvent.click(await screen.findByRole('button', { name: /ver qr y enlace/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('https://app.example.com/kiosk?slug=mi-resto')).toBeInTheDocument();
  });

  it('calls getOrGenerateQR when modal opens', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    fireEvent.click(await screen.findByRole('button', { name: /ver qr y enlace/i }));
    await waitFor(() => {
      expect(getOrGenerateQR).toHaveBeenCalledWith(
        'mi-resto',
        'https://app.example.com/kiosk?slug=mi-resto',
      );
    });
  });

  it('closes modal when × is clicked', async () => {
    mockMe('mi-resto');
    render(<KioskQrButton />);
    fireEvent.click(await screen.findByRole('button', { name: /ver qr y enlace/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
docker compose exec res-ui pnpm test src/components/dash/KioskQrButton.test.tsx
```

Expected: FAIL — `Cannot find module './KioskQrButton'`

- [ ] **Step 3: Create `apps/ui/src/components/dash/KioskQrButton.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { getOrGenerateQR } from '../../lib/kiosk-qr';
import { config } from '../../config';

export default function KioskQrButton() {
  const [kioskUrl, setKioskUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch('/v1/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const s = data?.restaurant?.slug;
        if (!s) return;
        const base = config.storefrontUrl || window.location.origin;
        setSlug(s);
        setKioskUrl(`${base}/kiosk?slug=${s}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || !slug || !kioskUrl) return;
    getOrGenerateQR(slug, kioskUrl).then(setQrDataUrl).catch(() => {});
  }, [open, slug, kioskUrl]);

  if (!kioskUrl) return null;

  function handleCopy() {
    navigator.clipboard.writeText(kioskUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer bg-transparent border-none p-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        Ver QR y enlace
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kiosko público"
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={handleBackdrop}
        >
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Kiosko público</h2>
                <p className="text-xs text-slate-400 mt-0.5">Enlace y código QR para tus clientes</p>
              </div>
              <button
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer border-none bg-transparent text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* URL */}
            <div className="px-6 pt-5 pb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Enlace</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <span className="flex-1 text-sm text-slate-700 truncate font-mono">{kioskUrl}</span>
                <button
                  title={copied ? '¡Copiado!' : 'Copiar'}
                  onClick={handleCopy}
                  className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 bg-transparent border-none cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <a
                  href={`/kiosk?slug=${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir en nueva pestaña"
                  className="shrink-0 p-1 text-slate-400 hover:text-indigo-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            </div>

            {/* QR */}
            <div className="px-6 pb-6 flex flex-col items-center gap-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider self-start">Código QR</p>
              <div className="flex items-center justify-center w-[240px] h-[240px] bg-slate-50 rounded-lg border border-slate-200">
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="QR Kiosko" width={240} height={240} className="rounded" />
                  : <span className="text-slate-400 text-sm">Generando...</span>
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
docker compose exec res-ui pnpm test src/components/dash/KioskQrButton.test.tsx
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/dash/KioskQrButton.tsx apps/ui/src/components/dash/KioskQrButton.test.tsx
git commit -m "feat(ui): add KioskQrButton React island with modal and QR"
```

---

## Task 4: Wire `KioskQrButton` into `DashboardLayout.astro`

**Files:**
- Modify: `apps/ui/src/layouts/DashboardLayout.astro`

Two changes:
1. Replace the old sidebar `kioskLinkContainer` div with a static wrapper that contains `<KioskQrButton client:load />`.
2. Remove the `loadKioskLink()` vanilla-JS function and its call. Move the support email prefill into its own small async fetch block.

- [ ] **Step 1: Add the import at the top of the frontmatter**

In the `---` frontmatter block at the top of `DashboardLayout.astro`, add:

```
import KioskQrButton from '../components/dash/KioskQrButton';
```

- [ ] **Step 2: Replace the sidebar kiosk section**

Find this block (lines ~49–57):

```html
<div id="kioskLinkContainer" class="hidden px-4 mt-6 pt-4 border-t border-slate-200">
  <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 mb-2">Kiosko público</p>
  <div class="flex items-center gap-2 px-4">
    <a id="kioskLink" href="#" target="_blank" class="text-sm text-indigo-600 hover:text-indigo-800 truncate"></a>
    <button id="copyKioskUrl" title="Copiar URL" class="shrink-0 p-1 text-slate-400 hover:text-indigo-600 bg-transparent border-none cursor-pointer">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2v1"></path></svg>
    </button>
  </div>
</div>
```

Replace with:

```html
<div class="px-4 mt-6 pt-4 border-t border-slate-200">
  <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 mb-2">Kiosko público</p>
  <div class="px-4">
    <KioskQrButton client:load />
  </div>
</div>
```

- [ ] **Step 3: Remove `loadKioskLink` and replace with email-only prefill**

Find the entire `// ── Kiosk link ──` block in the `<script>` section:

```typescript
// ── Kiosk link ──────────────────────────────────────────────────
async function loadKioskLink() {
  try {
    ...
  } catch {
    // silently ignore — kiosk link is non-critical
  }
}

loadKioskLink();
```

Replace it with a minimal email-prefill call:

```typescript
// ── Support email prefill ──────────────────────────────────────
apiFetch('/v1/auth/me')
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    const emailInput = document.getElementById('supportEmail') as HTMLInputElement;
    if (emailInput && data?.email) emailInput.value = data.email;
  })
  .catch(() => {});
```

- [ ] **Step 4: Verify the build compiles**

```bash
docker compose exec res-ui pnpm build
```

Expected: Build completes with no TypeScript errors.

- [ ] **Step 5: Run all UI tests**

```bash
docker compose exec res-ui pnpm test
```

Expected: All tests PASS.

- [ ] **Step 6: Smoke test in browser**

```bash
docker compose up res-ui res-api-core res-db
```

Open `http://localhost:4321/dash/orders`, log in, confirm:
- Sidebar shows "Kiosko público" section with "Ver QR y enlace" button.
- Clicking the button opens the modal.
- The modal shows the full URL with working copy button and open-in-tab link.
- A QR code renders below the URL.
- Closing (×) and clicking the backdrop both dismiss the modal.
- Reopen the modal — QR loads instantly (no "Generando…" flash), confirming localStorage cache hit.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/layouts/DashboardLayout.astro
git commit -m "feat(ui): wire KioskQrButton island into dashboard sidebar"
```
