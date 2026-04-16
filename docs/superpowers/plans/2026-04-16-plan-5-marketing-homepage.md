# Marketing Homepage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la landing page de marketing en `/` — la página que ven los dueños de restaurantes cuando descubren el producto. Incluye hero, features, CTA hacia `/onboarding`, y SEO básico. Astro puro, sin React.

**Architecture:** Una sola página Astro estática en `src/pages/index.astro`. Usa el layout base `Layout.astro` existente o crea uno específico para marketing. Sin llamadas a la API, sin auth. El build genera `dist/index.html` que NestJS sirve en `/`.

**Tech Stack:** Astro 5 (static), Tailwind CSS, Astro puro (sin islands React)

**Prerequisito:** Plan 1 completado — `apps/ui` existe con `output: 'static'` y NestJS sirve `public/`.

**Spec:** `docs/superpowers/specs/2026-04-16-unify-platform-design.md` — sección "Estructura de rutas"

---

## File Map

**Creados:**
- `apps/ui/src/pages/index.astro` — landing page principal

**Modificados (posible):**
- `apps/ui/src/layouts/Layout.astro` — verificar que no redirige a `/login` automáticamente

---

## Task 1: Verificar que Layout.astro no bloquea la homepage

Antes de crear el contenido, verificar que el layout base no tiene redirección automática a `/login` que afecte a páginas públicas.

- [ ] **Step 1.1 — Leer el layout base**

```bash
cat apps/ui/src/layouts/Layout.astro
```

Si el layout tiene un `<script>` que verifica auth y redirige, ese comportamiento no debe aplicarse a `/`. Si es así, crear un `MarketingLayout.astro` sin auth check. Si el layout es neutral (solo HTML/CSS base), usarlo directamente.

- [ ] **Step 1.2 — Si es necesario, crear MarketingLayout.astro**

Solo si el `Layout.astro` tiene redirección de auth. Crear `apps/ui/src/layouts/MarketingLayout.astro`:

```astro
---
interface Props {
  title?: string;
  description?: string;
}
const { title = 'Restaurantes POS', description = 'Sistema de punto de venta para restaurantes' } = Astro.props;
---
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 1.3 — Commit si se creó MarketingLayout**

```bash
git add apps/ui/src/layouts/MarketingLayout.astro
git commit -m "feat(ui): add MarketingLayout without auth check"
```

---

## Task 2: Crear la landing page

**Archivo:** `apps/ui/src/pages/index.astro`

- [ ] **Step 2.1 — Crear el archivo**

Usar el layout apropiado (Layout.astro o MarketingLayout.astro según Task 1). Reemplazar `LAYOUT` con el nombre correcto.

```astro
---
import LAYOUT from '../layouts/LAYOUT.astro';
---

<LAYOUT title="Restaurantes POS — Sistema de punto de venta" description="Gestiona tu restaurante desde cualquier lugar. Dashboard, kiosk de pedidos y reportes en un solo sistema.">
  <!-- NAV -->
  <nav class="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
    <span class="text-xl font-bold text-emerald-700">Restaurantes POS</span>
    <div class="flex gap-3">
      <a href="/login" class="text-slate-600 hover:text-slate-900 text-sm font-medium px-4 py-2">Iniciar sesión</a>
      <a href="/onboarding" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Comenzar gratis</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="max-w-4xl mx-auto px-6 py-20 text-center">
    <h1 class="text-5xl font-black text-slate-900 leading-tight mb-6">
      El sistema POS para tu restaurante,<br />
      <span class="text-emerald-600">sin complicaciones</span>
    </h1>
    <p class="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
      Dashboard de gestión, kiosk de pedidos para tus clientes y notificaciones en tiempo real.
      Funciona en la nube o instalado directamente en tu local.
    </p>
    <div class="flex gap-4 justify-center flex-wrap">
      <a href="/onboarding" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors">
        Crear mi restaurante
      </a>
      <a href="/login" class="border-2 border-slate-200 hover:border-slate-300 text-slate-700 font-bold px-8 py-4 rounded-xl text-lg transition-colors">
        Ya tengo cuenta
      </a>
    </div>
  </section>

  <!-- FEATURES -->
  <section class="max-w-5xl mx-auto px-6 py-16">
    <h2 class="text-3xl font-bold text-slate-800 text-center mb-12">Todo lo que necesitás</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="text-4xl mb-4">📊</div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Dashboard en tiempo real</h3>
        <p class="text-slate-600 text-sm">Mirá los pedidos del día a medida que llegan. Actualizaciones instantáneas sin recargar la página.</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="text-4xl mb-4">🛒</div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Kiosk de autoservicio</h3>
        <p class="text-slate-600 text-sm">Tus clientes hacen su pedido solos desde una tablet o pantalla en el local. Sin esperas.</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="text-4xl mb-4">🖥️</div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Funciona sin internet</h3>
        <p class="text-slate-600 text-sm">Instalá el sistema directamente en tu computadora. Sin depender de la conexión para operar.</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="text-4xl mb-4">🍽️</div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Gestión de menús</h3>
        <p class="text-slate-600 text-sm">Creá menús por horario, día de la semana o temporada. Control de stock por producto.</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="text-4xl mb-4">🖨️</div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Impresión de recibos</h3>
        <p class="text-slate-600 text-sm">Compatible con impresoras térmicas. Recibos automáticos por email para tus clientes.</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="text-4xl mb-4">☁️</div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Cloud o local</h3>
        <p class="text-slate-600 text-sm">Accedé desde cualquier dispositivo en la nube, o instalalo en tu local para máxima privacidad.</p>
      </div>
    </div>
  </section>

  <!-- CTA FINAL -->
  <section class="bg-emerald-600 text-white py-20 px-6 mt-8">
    <div class="max-w-2xl mx-auto text-center">
      <h2 class="text-3xl font-bold mb-4">Empezá hoy, gratis</h2>
      <p class="text-emerald-100 mb-8 text-lg">Creá tu restaurante en menos de 2 minutos. Sin tarjeta de crédito.</p>
      <a href="/onboarding" class="bg-white text-emerald-700 font-bold px-10 py-4 rounded-xl text-lg hover:bg-emerald-50 transition-colors inline-block">
        Crear mi restaurante
      </a>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="text-center py-8 text-slate-400 text-sm">
    <p>© {new Date().getFullYear()} Restaurantes POS</p>
  </footer>
</LAYOUT>
```

- [ ] **Step 2.2 — Verificar build**

```bash
pnpm --filter @restaurants/ui build
```

Esperado: build exitoso, `dist/index.html` generado.

- [ ] **Step 2.3 — Commit**

```bash
git add apps/ui/src/pages/index.astro
git commit -m "feat(marketing): add landing page with hero, features, and CTA"
```

---

## Task 3: Smoke test

- [ ] **Step 3.1 — Rebuild y verificar que NestJS sirve la homepage**

```bash
pnpm --filter @restaurants/ui build && pnpm copy-static
pnpm --filter api-core dev
```

Abrir `http://localhost:3000` — esperado: landing page con hero "El sistema POS para tu restaurante".

- [ ] **Step 3.2 — Verificar links de la homepage**

- Clic en "Comenzar gratis" → `/onboarding` carga correctamente
- Clic en "Ya tengo cuenta" → `/login` carga correctamente

- [ ] **Step 3.3 — Verificar SEO básico**

En DevTools → Elements → `<head>`:
- `<title>` tiene el texto correcto
- `<meta name="description">` existe y tiene contenido

- [ ] **Step 3.4 — Verificar responsive**

Usar DevTools → Toggle device toolbar → verificar que la página se ve bien en mobile (375px).
