# Landing Redesign — Clara & Moderna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el hero actual (fondo gradiente morado) con un diseño SaaS profesional: fondo crema claro, tipografía bold negra, acento naranja, hero dividido con cards de preview del producto.

**Architecture:** Reemplazo completo del contenido de `index.astro` — todo HTML inline sin componentes nuevos (página simple, no justifica abstracción). El Layout existente se mantiene sin cambios.

**Tech Stack:** Astro, Tailwind CSS

---

## File Map

| Acción | Archivo |
|--------|---------|
| Modify | `apps/ui/src/pages/index.astro` |

---

### Task 1: Reemplazar el hero completo en `index.astro`

**Files:**
- Modify: `apps/ui/src/pages/index.astro` (full rewrite del contenido)

Esta es la única tarea — la página es suficientemente simple para implementarse en un solo paso.

- [ ] **Step 1: Verificar el servidor de desarrollo está disponible**

```bash
# Desde la raíz del proyecto
docker compose up res-ui
```

O sin Docker (desde `apps/ui/`):
```bash
pnpm dev
```

El servidor debe estar corriendo en `http://localhost:4321` antes de continuar.

- [ ] **Step 2: Reemplazar el contenido de `apps/ui/src/pages/index.astro`**

Reemplazar el archivo completo con el siguiente contenido:

```astro
---
export const prerender = true;
import Layout from '../layouts/Layout.astro';
---

<Layout>
  <!-- Franja de acento superior -->
  <div class="w-full h-1 bg-[#f97316]"></div>

  <!-- Wrapper principal: ocupa el resto de la pantalla -->
  <main
    class="relative overflow-hidden flex flex-col"
    style="min-height: calc(100vh - 4px);"
  >
    <!-- Blob decorativo top-right -->
    <div
      class="absolute top-0 right-0 w-80 h-80 rounded-full bg-[#f97316] opacity-5 pointer-events-none"
      style="transform: translate(30%, -30%);"
    ></div>

    <!-- Blob decorativo bottom-left -->
    <div
      class="absolute bottom-0 left-0 w-52 h-52 rounded-full bg-[#f97316] pointer-events-none"
      style="opacity: 0.06; transform: translate(-30%, 30%);"
    ></div>

    <!-- Hero: ocupa el espacio disponible entre franja y footer -->
    <section
      class="flex-1 flex items-center justify-center px-8 py-12"
      style="background: #fafaf8;"
    >
      <div class="flex flex-row items-center gap-16 w-full max-w-5xl">

        <!-- Columna izquierda: texto + CTAs -->
        <div class="flex flex-col gap-5 flex-1">
          <!-- Eyebrow -->
          <span
            class="text-xs font-bold uppercase tracking-[5px] text-[#f97316]"
          >Software para restaurantes</span>

          <!-- Headline -->
          <h1
            class="font-black text-[#111] leading-[0.92]"
            style="font-size: 58px; letter-spacing: -3px;"
          >Daikulab</h1>

          <!-- Tagline -->
          <p
            class="text-[15px] text-[#555] leading-relaxed"
            style="max-width: 300px;"
          >
            La plataforma que moderniza la gestión de tu restaurante — pedidos, cocina y métricas en un solo lugar.
          </p>

          <!-- CTAs -->
          <div class="flex flex-row gap-3 items-center">
            <a
              href="/login"
              class="px-7 py-3 bg-[#f97316] text-white font-bold rounded-lg hover:bg-[#ea6c0a] transition-colors"
            >Iniciar sesión</a>
            <a
              href="/onboarding"
              class="px-7 py-3 border-2 border-[#111] text-[#111] font-semibold rounded-lg hover:bg-[#f5f5f5] transition-colors"
            >Registrarse →</a>
          </div>

          <!-- Trust line -->
          <p class="text-xs text-[#aaa]">Sin tarjeta de crédito · Configuración en minutos</p>
        </div>

        <!-- Columna derecha: product preview cards -->
        <div class="flex flex-col gap-3" style="width: 240px; flex-shrink: 0;">

          <!-- Card 1: Estadísticas del día -->
          <div class="bg-white rounded-xl shadow-md p-4">
            <p class="text-xs font-bold uppercase tracking-widest text-[#888] mb-2">Pedidos hoy</p>
            <p class="text-[28px] font-bold text-[#111] leading-none mb-1">142</p>
            <p class="text-xs text-[#059669] mb-3">↑ +12% esta semana</p>

            <!-- Barras de progreso -->
            <div class="flex flex-col gap-2">
              <!-- Mesa -->
              <div>
                <div class="flex justify-between text-xs text-[#888] mb-1">
                  <span>Mesa</span>
                  <span>68%</span>
                </div>
                <div class="w-full h-1.5 bg-[#f3f3f3] rounded-full overflow-hidden">
                  <div class="h-full bg-[#f97316] rounded-full" style="width: 68%;"></div>
                </div>
              </div>
              <!-- Kiosk -->
              <div>
                <div class="flex justify-between text-xs text-[#888] mb-1">
                  <span>Kiosk</span>
                  <span>22%</span>
                </div>
                <div class="w-full h-1.5 bg-[#f3f3f3] rounded-full overflow-hidden">
                  <div class="h-full bg-[#111] rounded-full" style="width: 22%;"></div>
                </div>
              </div>
              <!-- Online -->
              <div>
                <div class="flex justify-between text-xs text-[#888] mb-1">
                  <span>Online</span>
                  <span>10%</span>
                </div>
                <div class="w-full h-1.5 bg-[#f3f3f3] rounded-full overflow-hidden">
                  <div class="h-full bg-[#ccc] rounded-full" style="width: 10%;"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Card 2: Últimos pedidos -->
          <div class="bg-white rounded-xl shadow-md p-4">
            <p class="text-xs font-bold uppercase tracking-widest text-[#888] mb-3">Últimos pedidos</p>
            <div class="flex flex-col gap-2">
              <!-- Pedido 1 -->
              <div class="flex items-center justify-between">
                <span class="text-sm text-[#111]">Tacos al pastor</span>
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style="background: #ffedd5; color: #f97316;"
                >En cocina</span>
              </div>
              <!-- Pedido 2 -->
              <div class="flex items-center justify-between">
                <span class="text-sm text-[#111]">Enchiladas verdes</span>
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style="background: #d1fae5; color: #059669;"
                >Listo</span>
              </div>
              <!-- Pedido 3 -->
              <div class="flex items-center justify-between">
                <span class="text-sm text-[#111]">Agua de Jamaica</span>
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style="background: #ffedd5; color: #f97316;"
                >En cocina</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- Footer mínimo -->
    <footer
      class="flex flex-row items-center justify-between border-t border-[#ebebeb] px-16 py-3"
      style="background: #fafaf8;"
    >
      <span class="text-xs font-bold text-[#bbb] tracking-widest">DAIKULAB</span>
      <div class="flex gap-4">
        <a href="#" class="text-xs text-[#bbb] hover:text-[#888] transition-colors">Política de privacidad</a>
        <a href="#" class="text-xs text-[#bbb] hover:text-[#888] transition-colors">Términos</a>
        <a href="#" class="text-xs text-[#bbb] hover:text-[#888] transition-colors">Contacto</a>
      </div>
    </footer>
  </main>
</Layout>
```

- [ ] **Step 3: Verificar visualmente en el navegador**

Abrir `http://localhost:4321` y comprobar:

- [ ] Franja naranja de 4px visible en la parte superior
- [ ] Fondo crema `#fafaf8` (no morado/gradiente)
- [ ] Eyebrow "SOFTWARE PARA RESTAURANTES" en naranja con tracking amplio
- [ ] Headline "Daikulab" en negro, ~58px, muy compacto (leading 0.92)
- [ ] Tagline en gris `#555`, máx 300px
- [ ] Botón "Iniciar sesión" naranja sólido, bordes redondeados (no pill)
- [ ] Botón "Registrarse →" con borde negro, sin fondo
- [ ] Trust line gris claro debajo de los botones
- [ ] Card 1 a la derecha: número "142", tendencia verde, 3 barras de progreso (naranja/negro/gris)
- [ ] Card 2 a la derecha: 3 pedidos con badges de estado (naranja/verde)
- [ ] Blobs naranjas apenas visibles (decorativos, no intrusivos)
- [ ] Footer con "DAIKULAB" a la izquierda y links a la derecha, separado por borde gris
- [ ] No hay scroll necesario (todo cabe en una pantalla)

- [ ] **Step 4: Verificar links de navegación**

- Clic en "Iniciar sesión" → debe navegar a `/login`
- Clic en "Registrarse →" → debe navegar a `/onboarding`

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/pages/index.astro
git commit -m "feat(ui): rediseño landing — Clara & Moderna con preview del producto"
```

---

## Self-Review contra el spec

| Requisito del spec | Cubierto en plan |
|---|---|
| Franja acento 4px naranja | ✅ Step 2 — `<div class="w-full h-1 bg-[#f97316]">` |
| Fondo `#fafaf8` | ✅ Step 2 — `style="background: #fafaf8;"` en `<section>` y footer |
| Blobs decorativos (top-right 320px / bottom-left 200px) | ✅ Step 2 — dos divs absolutos con opacity-5 / 0.06 |
| Eyebrow: xs, bold, tracking-[5px], uppercase, naranja | ✅ Step 2 — `text-xs font-bold uppercase tracking-[5px] text-[#f97316]` |
| Headline: 58px, font-black, #111, tracking-[-3px], leading-[0.92] | ✅ Step 2 — inline style + clases |
| Tagline: 15px, #555, leading-relaxed, max-w-[300px] | ✅ Step 2 |
| CTA "Iniciar sesión": naranja, white, bold, rounded-lg, px-7 py-3 | ✅ Step 2 |
| CTA "Registrarse →": border-2 border-[#111], #111, semibold, rounded-lg | ✅ Step 2 |
| Trust line: xs, #aaa | ✅ Step 2 |
| Card 1: "Pedidos hoy", "142", trend verde, 3 barras (naranja/negro/gris) | ✅ Step 2 |
| Card 2: "Últimos pedidos", 3 filas, badges En cocina/Listo | ✅ Step 2 |
| Cards: bg-white, rounded-xl, shadow-md, p-4 | ✅ Step 2 |
| Footer: justify-between, border-t #ebebeb, px-16 py-3 | ✅ Step 2 |
| Footer izq: "DAIKULAB" xs bold #bbb tracking-widest | ✅ Step 2 |
| Footer der: 3 links xs #bbb | ✅ Step 2 |
| Sin componentes separados | ✅ Todo inline en index.astro |
| Layout.astro sin modificar | ✅ No está en el File Map |
| Datos ficticios hardcodeados (sin API calls) | ✅ Todos los números/nombres son estáticos |
