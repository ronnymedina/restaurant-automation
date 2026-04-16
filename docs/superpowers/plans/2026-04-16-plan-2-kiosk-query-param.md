# Kiosk Query Param Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar la URL del kiosk de `/kiosk/:slug` a `/kiosk?r=:slug`. Renombrar la página Astro para que genere un único `kiosk/index.html`, sin necesidad de wildcards ni handlers especiales en NestJS.

**Architecture:** `ServeStaticModule` sirve `kiosk/index.html` en `/kiosk` de forma natural. El slug del restaurante viaja como query param `r`. El script del kiosk lo lee con `URLSearchParams`. Las referencias internas (links, APIs) se actualizan al nuevo formato.

**Tech Stack:** Astro 5 (static), vanilla JS en el script del kiosk (hasta Plan 4 que migra a React)

**Prerequisito:** Plan 1 completado — `apps/ui` existe, Astro en modo static, NestJS con ServeStaticModule.

**Spec:** `docs/superpowers/specs/2026-04-16-unify-platform-design.md` — sección "Routing del kiosk"

---

## File Map

**Renombrado:**
- `apps/ui/src/pages/kiosk/[slug].astro` → `apps/ui/src/pages/kiosk/index.astro`

**Modificados:**
- `apps/ui/src/pages/kiosk/index.astro` — script actualizado para leer `?r=` en vez de path param
- `apps/ui/src/pages/dash/index.astro` — si tiene links al kiosk, actualizar formato URL
- `apps/ui/src/pages/dash/` — cualquier página que genere links al kiosk

---

## Task 1: Renombrar la página del kiosk

- [ ] **Step 1.1 — Renombrar con git mv**

```bash
git mv apps/ui/src/pages/kiosk/\[slug\].astro apps/ui/src/pages/kiosk/index.astro
```

- [ ] **Step 1.2 — Verificar rename**

```bash
git status
```

Esperado: `renamed: apps/ui/src/pages/kiosk/[slug].astro -> apps/ui/src/pages/kiosk/index.astro`

- [ ] **Step 1.3 — Commit**

```bash
git add -A
git commit -m "refactor(kiosk): rename [slug].astro to index.astro"
```

---

## Task 2: Actualizar el script del kiosk para leer el query param

**Archivo:** `apps/ui/src/pages/kiosk/index.astro`

El frontmatter actual tiene:
```
const { slug } = Astro.params;
```
y el template tiene:
```html
<div id="kioskApp" ... data-slug={slug}>
```

El script JavaScript lee:
```ts
const slug = document.getElementById('kioskApp')!.dataset.slug!;
```

En modo estático, `Astro.params` no existe en runtime — el slug debe leerse del query param en el browser.

- [ ] **Step 2.1 — Actualizar el frontmatter**

Reemplazar el frontmatter completo (entre los `---`):

```astro
---
import KioskLayout from '../../layouts/KioskLayout.astro';
---
```

- [ ] **Step 2.2 — Actualizar el div raíz del template**

Encontrar:
```html
<div id="kioskApp" class="h-screen flex flex-col bg-amber-50 text-slate-800" data-slug={slug}>
```

Reemplazar por:
```html
<div id="kioskApp" class="h-screen flex flex-col bg-amber-50 text-slate-800">
```

- [ ] **Step 2.3 — Actualizar la lectura del slug en el script**

En el bloque `<script>`, encontrar:
```ts
const slug = document.getElementById('kioskApp')!.dataset.slug!;
```

Reemplazar por:
```ts
const slug = new URLSearchParams(window.location.search).get('r') ?? '';
if (!slug) {
  document.getElementById('kioskApp')!.innerHTML =
    '<div class="flex items-center justify-center h-screen text-slate-400">Restaurante no especificado. Usa /kiosk?r=tu-restaurante</div>';
  throw new Error('Missing restaurant slug in query param ?r=');
}
```

- [ ] **Step 2.4 — Verificar que el build compila sin errores**

```bash
cd apps/ui && pnpm build
```

Esperado: build exitoso, `dist/kiosk/index.html` generado.

- [ ] **Step 2.5 — Commit**

```bash
git add apps/ui/src/pages/kiosk/index.astro
git commit -m "feat(kiosk): read restaurant slug from ?r= query param"
```

---

## Task 3: Buscar y actualizar links internos al kiosk

Links internos que generaban URLs tipo `/kiosk/${slug}` deben cambiar a `/kiosk?r=${slug}`.

- [ ] **Step 3.1 — Buscar referencias al formato antiguo**

```bash
grep -r "kiosk/" apps/ui/src --include="*.astro" --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 3.2 — Revisar cada archivo encontrado**

Para cada archivo, buscar patrones como:
- `` `/kiosk/${slug}` ``
- `'/kiosk/' + slug`
- `href="/kiosk/`

Actualizar a:
- `` `/kiosk?r=${slug}` ``

> Si no hay resultados en Step 3.1, este task no tiene cambios — commitearlo igual para documentar la verificación.

- [ ] **Step 3.3 — Commit**

```bash
git add apps/ui/src/
git commit -m "fix(kiosk): update internal links to use ?r= query param format"
```

---

## Task 4: Smoke test

- [ ] **Step 4.1 — Rebuild y copiar estáticos**

```bash
pnpm --filter @restaurants/ui build && pnpm copy-static
```

- [ ] **Step 4.2 — Levantar NestJS**

```bash
pnpm --filter api-core dev
```

- [ ] **Step 4.3 — Verificar que el kiosk carga con query param**

Abrir en el browser: `http://localhost:3000/kiosk?r=test-slug`

Esperado: la página del kiosk carga. El log en la consola del browser debe mostrar que intentó cargar `/v1/kiosk/test-slug/menus` y falló con 404 (el slug no existe en la DB) — eso es correcto. Lo importante es que la página cargó sin 404 del servidor.

- [ ] **Step 4.4 — Verificar error cuando no hay slug**

Abrir: `http://localhost:3000/kiosk`

Esperado: muestra el mensaje "Restaurante no especificado. Usa /kiosk?r=tu-restaurante".
