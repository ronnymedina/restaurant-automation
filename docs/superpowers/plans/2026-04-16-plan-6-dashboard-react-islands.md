# Dashboard React Islands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar todas las páginas CRUD del dashboard de vanilla JS + DOM manipulation a React islands. Cada página `.astro` queda reducida a 5 líneas que montan un componente `.tsx` con `client:load`. Eliminar todo el `innerHTML`, `document.getElementById`, y `bindEvents()` manual.

**Architecture:** El patrón es idéntico al establecido en Plan 4 Task 5 con `ProductsDashboard.tsx`. Cada página CRUD sigue la misma estructura: `useState` para los datos, `useEffect` para fetch inicial, JSX para render. Si el mismo patrón de fetch + paginación se repite 3+ veces, extraer `usePaginatedFetch<T>` hook compartido.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `apiFetch` (lib/api existente), `client:load`

**Prerequisito:** Plan 4 completado — `ProductsDashboard.tsx` existe y funciona como referencia.

---

## File Map

**Creados:**
- `apps/ui/src/hooks/usePaginatedFetch.ts` — hook compartido (si aplica tras revisar el patrón)
- `apps/ui/src/components/dash/CategoriesDashboard.tsx`
- `apps/ui/src/components/dash/MenusDashboard.tsx`
- `apps/ui/src/components/dash/MenuEditor.tsx`
- `apps/ui/src/components/dash/UsersDashboard.tsx`
- `apps/ui/src/components/dash/RegisterDashboard.tsx`

**Modificados:**
- `apps/ui/src/pages/dash/categories.astro`
- `apps/ui/src/pages/dash/menus.astro`
- `apps/ui/src/pages/dash/menus/[id].astro` (si existe como página separada)
- `apps/ui/src/pages/dash/users.astro`
- `apps/ui/src/pages/dash/register.astro`

---

## Task 1: Evaluar y extraer hook compartido

Antes de crear componentes, revisar el código de `ProductsDashboard.tsx` (ya creado en Plan 4) y los `<script>` de las otras páginas para identificar el patrón repetido.

- [ ] **Step 1.1 — Leer los scripts de las páginas pendientes**

```bash
cat apps/ui/src/pages/dash/categories.astro
cat apps/ui/src/pages/dash/menus.astro
cat apps/ui/src/pages/dash/users.astro
cat apps/ui/src/pages/dash/register.astro
```

- [ ] **Step 1.2 — Decidir si crear `usePaginatedFetch`**

Si 3+ páginas tienen el mismo patrón de `fetch → setLoading → setData → renderPagination`, crear el hook:

```typescript
// apps/ui/src/hooks/usePaginatedFetch.ts
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

interface PaginatedMeta {
  totalPages: number;
  total: number;
}

export function usePaginatedFetch<T>(endpoint: string, limit = 50) {
  const [data, setData] = useState<T[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta>({ totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const res = await apiFetch(`${endpoint}?page=${p}&limit=${limit}`);
    if (!res.ok) {
      setError(res.status === 403 ? 'Sin permisos' : 'Error al cargar');
      setLoading(false);
      return;
    }
    const json = await res.json();
    // Soporta tanto { data, meta } como array directo
    if (Array.isArray(json)) {
      setData(json);
    } else {
      setData(json.data ?? []);
      setMeta(json.meta ?? { totalPages: 1, total: json.data?.length ?? 0 });
    }
    setError(null);
    setLoading(false);
  }, [endpoint, limit, page]);

  useEffect(() => { load(page); }, [page]);

  return { data, meta, page, setPage, loading, error, reload: () => load(page) };
}
```

Si el patrón NO se repite de forma consistente, omitir el hook y duplicar el fetch en cada componente.

- [ ] **Step 1.3 — Commit si se creó el hook**

```bash
git add apps/ui/src/hooks/usePaginatedFetch.ts
git commit -m "feat(hooks): add usePaginatedFetch shared hook for dashboard CRUD pages"
```

---

## Task 2: CategoriesDashboard

**Referencia:** `apps/ui/src/pages/dash/categories.astro` — leer el `<script>` actual antes de escribir el componente.

- [ ] **Step 2.1 — Leer el script actual de categories.astro**

Identificar: qué campos tiene el formulario, qué endpoints usa (`/v1/categories`), si tiene paginación.

- [ ] **Step 2.2 — Crear `apps/ui/src/components/dash/CategoriesDashboard.tsx`**

Misma estructura que `ProductsDashboard.tsx`:
- Tabla con nombre de categoría + botones Editar / Eliminar
- Formulario inline (nombre, activo)
- Paginación si la API la devuelve

- [ ] **Step 2.3 — Actualizar `apps/ui/src/pages/dash/categories.astro`**

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import CategoriesDashboard from '../../components/dash/CategoriesDashboard';
---

<DashboardLayout>
  <CategoriesDashboard client:load />
</DashboardLayout>
```

- [ ] **Step 2.4 — Verificar build**

```bash
pnpm --filter @restaurants/ui build
```

- [ ] **Step 2.5 — Commit**

```bash
git add apps/ui/src/components/dash/CategoriesDashboard.tsx apps/ui/src/pages/dash/categories.astro
git commit -m "feat(categories): migrate to React island"
```

---

## Task 3: MenusDashboard y MenuEditor

Las páginas de menús pueden tener más complejidad (editor de secciones, items dentro del menú). Dividir en dos componentes si hay dos páginas separadas (`menus.astro` lista + `menus/[id].astro` editor).

- [ ] **Step 3.1 — Leer las páginas de menú**

```bash
cat apps/ui/src/pages/dash/menus.astro
# Si existe:
cat apps/ui/src/pages/dash/menus/\[id\].astro
```

- [ ] **Step 3.2 — Crear `apps/ui/src/components/dash/MenusDashboard.tsx`**

Lista de menús con crear/editar/eliminar. Si el editor de secciones/items es en una página separada, referenciarlo. Si está todo en una sola página, incluirlo todo en este componente.

- [ ] **Step 3.3 — Crear `apps/ui/src/components/dash/MenuEditor.tsx`** (si hay página `/menus/[id]`)

Componente que:
- Lee el `menuId` de la URL (`window.location.pathname.split('/').at(-1)`)
- Carga el menú con sus secciones e items
- Permite agregar/quitar secciones y productos del menú

- [ ] **Step 3.4 — Actualizar las páginas .astro de menús**

Misma reducción a 5 líneas montando el island correspondiente.

- [ ] **Step 3.5 — Verificar build**

```bash
pnpm --filter @restaurants/ui build
```

- [ ] **Step 3.6 — Commit**

```bash
git add apps/ui/src/components/dash/Menus*.tsx apps/ui/src/components/dash/MenuEditor.tsx apps/ui/src/pages/dash/menus*
git commit -m "feat(menus): migrate to React islands"
```

---

## Task 4: UsersDashboard

- [ ] **Step 4.1 — Leer `apps/ui/src/pages/dash/users.astro`**

Identificar: campos del formulario de usuario, endpoints usados.

- [ ] **Step 4.2 — Crear `apps/ui/src/components/dash/UsersDashboard.tsx`**

Tabla de usuarios + formulario. Probable que solo tenga nombre, email, rol.

- [ ] **Step 4.3 — Actualizar `apps/ui/src/pages/dash/users.astro`**

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import UsersDashboard from '../../components/dash/UsersDashboard';
---

<DashboardLayout>
  <UsersDashboard client:load />
</DashboardLayout>
```

- [ ] **Step 4.4 — Verificar build y commit**

```bash
pnpm --filter @restaurants/ui build
git add apps/ui/src/components/dash/UsersDashboard.tsx apps/ui/src/pages/dash/users.astro
git commit -m "feat(users): migrate to React island"
```

---

## Task 5: RegisterDashboard

La página de register (caja) puede tener estado más complejo (sesión abierta/cerrada, totales del día). Leer antes de asumir estructura.

- [ ] **Step 5.1 — Leer `apps/ui/src/pages/dash/register.astro`**

- [ ] **Step 5.2 — Crear `apps/ui/src/components/dash/RegisterDashboard.tsx`**

Gestionar el estado de la caja: abrir sesión, cerrar sesión, ver totales.

- [ ] **Step 5.3 — Actualizar `apps/ui/src/pages/dash/register.astro`**

- [ ] **Step 5.4 — Verificar build y commit**

```bash
pnpm --filter @restaurants/ui build
git add apps/ui/src/components/dash/RegisterDashboard.tsx apps/ui/src/pages/dash/register.astro
git commit -m "feat(register): migrate to React island"
```

---

## Task 6: Smoke test completo del dashboard

- [ ] **Step 6.1 — Rebuild y copiar estáticos**

```bash
pnpm --filter @restaurants/ui build && pnpm copy-static
pnpm --filter api-core dev
```

- [ ] **Step 6.2 — Verificar flujo completo**

1. Login → `/dash/products`: tabla carga, formulario funciona, paginación funciona
2. `/dash/categories`: CRUD funciona
3. `/dash/menus`: lista y editor funcionan
4. `/dash/users`: tabla carga
5. `/dash/register`: estado de caja correcto
6. `/dash/orders`: tabla en tiempo real con SSE (Plan 3)

- [ ] **Step 6.3 — Verificar que no hay scripts vanilla residuales**

```bash
grep -r "document.getElementById\|innerHTML\|querySelector" apps/ui/src/pages/dash/ --include="*.astro"
```

Esperado: 0 resultados (todo el DOM manipulation está ahora en componentes React).
