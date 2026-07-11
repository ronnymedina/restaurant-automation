# Landing Page Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current minimal `index.astro` with a full marketing landing page migrated from daikulab, using the project's light/orange theme.

**Architecture:** 10 new components under `src/components/landing/`, all with hardcoded Spanish strings. `index.astro` is replaced to import and compose them. Layout.astro gets `title`/`description` props. No i18n system.

**Tech Stack:** Astro 5, Tailwind CSS (via existing config), plain `<script>` for FAQ accordion.

---

### Task 1: Update Layout.astro to accept title and description props

**Files:**
- Modify: `apps/ui/src/layouts/Layout.astro`

- [ ] **Replace the contents of `apps/ui/src/layouts/Layout.astro`:**

```astro
---
interface Props {
  title?: string;
  description?: string;
}
const {
  title = "Daikulab Restaurant",
  description = "Manejá tu restaurante desde una sola pantalla.",
} = Astro.props;
---
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <meta name="generator" content={Astro.generator} />
    <meta name="description" content={description} />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>

<style>
  html,
  body {
    margin: 0;
    width: 100%;
    height: 100%;
  }
</style>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/layouts/Layout.astro
git commit -m "feat(ui): add title and description props to Layout"
```

---

### Task 2: Create LandingNavbar.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingNavbar.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingNavbar.astro`:**

```astro
---
// no props — strings hardcoded in Spanish
---
<nav id="landing-navbar" class="fixed top-0 w-full z-50 px-6 py-5">
  <div class="max-w-6xl mx-auto flex justify-between items-center">
    <a href="/" class="group">
      <span class="text-xl font-extrabold tracking-tight" style="color: #111;">
        Daiku<span style="color: #f97316;">Lab</span>
      </span>
      <span class="block text-[10px] font-normal tracking-[0.2em] uppercase mt-0.5" style="color: #888;">
        para restaurantes
      </span>
    </a>

    <div class="hidden md:flex items-center gap-8 text-sm font-medium" style="color: #555;">
      <a href="#modulos" class="hover:text-orange-500 transition-colors">Módulos</a>
      <a href="#precios" class="hover:text-orange-500 transition-colors">Precios</a>
      <a href="#contacto" class="hover:text-orange-500 transition-colors">Contacto</a>
      <a
        href="/onboarding"
        class="px-5 py-2 rounded-full text-sm font-semibold text-white transition-all hover:-translate-y-px"
        style="background: #f97316; box-shadow: 0 4px 16px rgba(249,115,22,0.35);"
      >
        Comenzar ahora
      </a>
    </div>

    <a
      href="/onboarding"
      class="md:hidden px-4 py-2 rounded-full text-sm font-semibold text-white"
      style="background: #f97316; box-shadow: 0 4px 16px rgba(249,115,22,0.35);"
    >
      Comenzar ahora
    </a>
  </div>
</nav>

<script>
  const navbar = document.getElementById("landing-navbar");
  if (navbar) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 20) {
        navbar.classList.add("scrolled");
      } else {
        navbar.classList.remove("scrolled");
      }
    }, { passive: true });
  }
</script>

<style>
  #landing-navbar {
    transition: background 0.3s, backdrop-filter 0.3s, padding 0.3s, border-color 0.3s;
  }
  #landing-navbar.scrolled {
    background: rgba(250, 250, 248, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid #ebebeb;
    padding-top: 0.75rem;
    padding-bottom: 0.75rem;
  }
</style>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingNavbar.astro
git commit -m "feat(ui): add LandingNavbar component"
```

---

### Task 3: Create LandingHero.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingHero.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingHero.astro`:**

```astro
---
// no props
---
<section
  class="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden px-4"
  style="background: #fafaf8;"
>
  <div
    class="absolute inset-0 -z-10"
    style="background: radial-gradient(ellipse at 70% 20%, rgba(249,115,22,0.07) 0%, transparent 55%), radial-gradient(ellipse at 20% 70%, rgba(249,115,22,0.04) 0%, transparent 50%);"
  ></div>

  <div class="max-w-3xl mx-auto space-y-6">
    <div
      class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border"
      style="background: rgba(249,115,22,0.08); border-color: rgba(249,115,22,0.25); color: #f97316;"
    >
      🎉 Gratis para siempre · o $59 una sola vez con licencia local
    </div>

    <h1
      class="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight"
      style="color: #111;"
    >
      Manejá tu restaurante<br />
      <span style="color: #f97316;">sin pagar una fortuna.</span>
    </h1>

    <p class="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed" style="color: #555;">
      Pedidos, cocina, inventario y caja — todo en un solo sistema.<br />
      Empezá gratis hoy. Sin tarjeta de crédito. Sin límite de tiempo.
    </p>

    <div class="flex flex-col sm:flex-row gap-4 justify-center pt-2">
      <a
        href="/onboarding"
        class="px-8 py-4 rounded-full text-white font-bold text-base transition-all hover:-translate-y-1"
        style="background: #f97316; box-shadow: 0 6px 24px rgba(249,115,22,0.4);"
      >
        Empezar gratis
      </a>
      <a
        href="#precios"
        class="px-8 py-4 rounded-full font-bold text-base border transition-all hover:-translate-y-1"
        style="color: #f97316; border-color: rgba(249,115,22,0.35); background: transparent;"
      >
        Ver planes y precios
      </a>
    </div>

    <p class="text-xs" style="color: #888;">
      Sin tarjeta de crédito · Sin tiempo límite · Tus datos se conservan
    </p>
  </div>

  <div class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40 animate-bounce">
    <div class="w-px h-8" style="background: #888;"></div>
    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1L6 6L11 1" stroke="#888" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingHero.astro
git commit -m "feat(ui): add LandingHero component"
```

---

### Task 4: Create LandingDolor.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingDolor.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingDolor.astro`:**

```astro
---
const items = [
  {
    icon: "📋",
    title: "Operación en papel",
    desc: "Pedidos que se pierden, comandas ilegibles, cocina sin información en tiempo real.",
  },
  {
    icon: "🌐",
    title: "Si se cae internet, tu negocio se detiene",
    desc: "Dependencia total de la conexión. Un corte y todo para.",
  },
  {
    icon: "🐢",
    title: "Filas y esperas que ahuyentan clientes",
    desc: "Sin un sistema de autoservicio, cada pedido depende de un mozo disponible. Los clientes esperan, la cocina se desordena.",
  },
];
---
<section class="py-20 px-4" style="background: #fafaf8;">
  <div class="max-w-5xl mx-auto">
    <p
      class="text-center text-sm font-bold uppercase tracking-widest mb-10"
      style="color: #f97316;"
    >
      ¿Te suena familiar?
    </p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => (
        <div
          class="rounded-2xl p-6 border flex flex-col gap-3"
          style="background: #ffffff; border-color: #ebebeb;"
        >
          <span class="text-3xl">{item.icon}</span>
          <h3 class="font-bold text-base leading-snug" style="color: #111;">{item.title}</h3>
          <p class="text-sm leading-relaxed" style="color: #555;">{item.desc}</p>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingDolor.astro
git commit -m "feat(ui): add LandingDolor component"
```

---

### Task 5: Create LandingModulos.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingModulos.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingModulos.astro`:**

```astro
---
const items = [
  { icon: "👥", name: "Gestión de Usuarios", desc: "Tres roles: ADMIN (control total), MANAGER (operaciones), BASIC (toma de pedidos)." },
  { icon: "🛒", name: "Productos, Categorías y Stock", desc: "Cargá productos con imágenes y categorías. El stock se descuenta automáticamente con cada pedido." },
  { icon: "📋", name: "Gestión de Menús", desc: "Creá y configurá los menús de tu negocio. Activá o desactivá según el momento del día." },
  { icon: "🍳", name: "Pantalla de Cocina & Dashboard", desc: "La cocina ve los pedidos en tiempo real. El dashboard te da una vista completa del estado de cada orden." },
  { icon: "💰", name: "Apertura y Cierre de Caja", desc: "Control de caja completo: apertura, movimientos y cierre del día." },
  { icon: "🖥️", name: "Kiosko / Totem", desc: "Colocá una pantalla en tu local como totem de autoservicio o compartí la URL para recibir pedidos desde la web. Soporta mobile." },
  { icon: "📦", name: "Historial de Pedidos", desc: "Consultá todos los pedidos anteriores con detalle de productos, montos y estado." },
  { icon: "🗂️", name: "Historial de Caja", desc: "Revisá los cierres de caja anteriores con el resumen de cada jornada." },
];
---
<section id="modulos" class="py-20 px-4" style="background: #fafaf8;">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-12">
      <p class="text-sm font-bold uppercase tracking-widest mb-3" style="color: #f97316;">Módulos</p>
      <h2 class="text-3xl md:text-4xl font-extrabold" style="color: #111;">
        Todo lo que necesitás para operar<br />desde el día 1
      </h2>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map((m) => (
        <div
          class="rounded-2xl p-5 border flex gap-4 items-start transition-all hover:-translate-y-1"
          style="background: #ffffff; border-color: #ebebeb;"
        >
          <span class="text-2xl flex-shrink-0 mt-0.5">{m.icon}</span>
          <div>
            <h3 class="font-bold text-sm mb-1" style="color: #111;">{m.name}</h3>
            <p class="text-xs leading-relaxed" style="color: #555;">{m.desc}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingModulos.astro
git commit -m "feat(ui): add LandingModulos component"
```

---

### Task 6: Create LandingPrecios.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingPrecios.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingPrecios.astro`:**

```astro
---
const freeFeatures = [
  "Hasta 20 productos",
  "1 menú activo",
  "500 órdenes por mes",
  "Acceso desde cualquier dispositivo con navegador",
  "Actualizaciones automáticas incluidas",
  "Soporte por formulario de contacto",
];

const localFeatures = [
  "Todos los módulos incluidos, sin restricciones",
  "Productos, menús y órdenes ilimitados",
  "Funciona en red local (sin internet requerido)",
  "Conectá tablets y monitores por WiFi interno",
  "Kioscos de autoservicio",
  "1 año de actualizaciones incluido",
  "Tus datos en tu hardware — nadie más tiene acceso",
];
---
<section id="precios" class="py-20 px-4" style="background: #fafaf8;">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-12">
      <p class="text-sm font-bold uppercase tracking-widest mb-3" style="color: #f97316;">Precios</p>
      <h2 class="text-3xl md:text-4xl font-extrabold" style="color: #111;">
        Empezá gratis, sin límites en lo que importa
      </h2>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Free tier -->
      <div
        class="rounded-2xl border p-8 flex flex-col gap-4"
        style="background: #ffffff; border-color: #f97316;"
      >
        <div>
          <p class="text-sm font-semibold mb-1" style="color: #555;">☁️ Gratis para siempre</p>
          <div class="flex items-end gap-2">
            <span class="text-5xl font-extrabold" style="color: #111;">$0</span>
          </div>
          <p class="text-sm mt-2" style="color: #555;">
            Ideal para restaurantes pequeños que quieren digitalizar su operación sin riesgo.
          </p>
        </div>
        <ul class="flex flex-col gap-2 flex-1">
          {freeFeatures.map((f) => (
            <li class="flex gap-2 text-sm" style="color: #444;">
              <span style="color: #f97316;">✅</span> {f}
            </li>
          ))}
        </ul>
        <a
          href="/onboarding"
          class="block text-center py-3 rounded-full font-bold text-white transition-all hover:-translate-y-0.5"
          style="background: #f97316; box-shadow: 0 4px 16px rgba(249,115,22,0.35);"
        >
          Empezar gratis
        </a>
        <p class="text-xs text-center" style="color: #888;">Sin tarjeta de crédito</p>
      </div>

      <!-- Local License (coming soon) -->
      <div
        class="rounded-2xl border p-8 flex flex-col gap-4 relative"
        style="background: #ffffff; border-color: #ebebeb; opacity: 0.75;"
      >
        <div
          class="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white"
          style="background: #888;"
        >
          Próximamente
        </div>
        <div>
          <p class="text-sm font-semibold mb-1" style="color: #555;">🖥️ Licencia Local</p>
          <div class="flex items-end gap-2">
            <del class="text-xl font-normal mb-1" style="color: #bbb;">$100</del>
            <span class="text-5xl font-extrabold" style="color: #f97316;">$59</span>
            <span class="text-base mb-1" style="color: #888;">pago único</span>
          </div>
          <p class="text-sm mt-2" style="color: #555;">
            Todo lo del plan gratuito, sin ningún límite. Instalado en tu propio hardware, sin internet requerido.
          </p>
        </div>
        <ul class="flex flex-col gap-2 flex-1">
          {localFeatures.map((f) => (
            <li class="flex gap-2 text-sm" style="color: #444;">
              <span style="color: #f97316;">✅</span> {f}
            </li>
          ))}
        </ul>
        <button
          disabled
          class="w-full text-center py-3 rounded-full font-bold cursor-not-allowed border"
          style="color: #888; border-color: #e5e7eb; background: transparent;"
        >
          Próximamente
        </button>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingPrecios.astro
git commit -m "feat(ui): add LandingPrecios component"
```

---

### Task 7: Create LandingPrueba.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingPrueba.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingPrueba.astro`:**

```astro
---
const limits = [
  { icon: "🛒", label: "Productos", value: "20 productos máximo" },
  { icon: "📋", label: "Menú", value: "1 menú activo" },
  { icon: "📦", label: "Órdenes", value: "500 órdenes por mes" },
];

const warningItems = [
  "Al 80% de cualquier límite recibís un aviso dentro de la app",
  "Al 100% la acción se bloquea — esperá al mes siguiente o adquirí la licencia local",
];
---
<section class="py-20 px-4" style="background: #fafaf8;">
  <div class="max-w-4xl mx-auto">
    <div
      class="rounded-3xl p-8 md:p-12 border text-center"
      style="background: #ffffff; border-color: rgba(249,115,22,0.25);"
    >
      <p class="text-sm font-bold uppercase tracking-widest mb-4" style="color: #f97316;">Plan gratuito</p>
      <h2 class="text-3xl md:text-4xl font-extrabold mb-4" style="color: #111;">
        ¿Qué pasa cuando llegás al límite?
      </h2>
      <p class="text-base mb-10" style="color: #555;">
        El plan gratuito está diseñado para restaurantes pequeños. Cuando tu operación crece, tenés una opción clara.
      </p>

      <div class="grid md:grid-cols-2 gap-8 text-left mb-10">
        <div>
          <h3 class="font-bold mb-4 text-sm uppercase tracking-wider" style="color: #f97316;">
            Límites del plan gratis:
          </h3>
          <ul class="flex flex-col gap-3">
            {limits.map((limit) => (
              <li class="flex gap-3 text-sm" style="color: #555;">
                <span>{limit.icon}</span>
                <span>
                  <strong style="color: #111;">{limit.label}</strong> — {limit.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 class="font-bold mb-4 text-sm uppercase tracking-wider" style="color: #f97316;">
            Cómo funcionan los avisos:
          </h3>
          <ul class="flex flex-col gap-3">
            {warningItems.map((item) => (
              <li class="flex gap-2 text-sm" style="color: #555;">
                <span style="color: #f97316; flex-shrink: 0;">⚠️</span> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <a
        href="/onboarding"
        class="inline-block px-10 py-4 rounded-full font-bold text-white text-base transition-all hover:-translate-y-1"
        style="background: #f97316; box-shadow: 0 6px 24px rgba(249,115,22,0.4);"
      >
        Empezar gratis
      </a>
    </div>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingPrueba.astro
git commit -m "feat(ui): add LandingPrueba component"
```

---

### Task 8: Create LandingRoadmap.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingRoadmap.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingRoadmap.astro`:**

```astro
---
const items = [
  {
    estado: "✅",
    label: "Disponible",
    features: [
      "Productos y stock",
      "Menús digitales",
      "Pedidos web",
      "KDS cocina",
      "Kanban de pedidos",
      "Apertura y cierre de caja",
      "Gestión de usuarios",
    ],
  },
  {
    estado: "🔜",
    label: "Próximo release",
    features: [
      "Integración de pago online (billetera virtual)",
      "Demo con impresora de tickets de comanda",
    ],
  },
  {
    estado: "📅",
    label: "Futuro",
    features: [
      "Facturación electrónica",
      "Versión cloud multi-sucursal",
      "Integración con Rappi y PedidosYa",
    ],
  },
];
---
<section class="py-20 px-4" style="background: #f5f5f3;">
  <div class="max-w-4xl mx-auto">
    <div class="text-center mb-12">
      <p class="text-sm font-bold uppercase tracking-widest mb-3" style="color: #f97316;">Roadmap</p>
      <h2 class="text-3xl font-extrabold" style="color: #111;">Lo que viene</h2>
    </div>
    <div class="flex flex-col gap-4">
      {items.map((item) => (
        <div
          class="rounded-2xl border p-6"
          style="background: #ffffff; border-color: #ebebeb;"
        >
          <div class="flex items-center gap-3 mb-4">
            <span class="text-xl">{item.estado}</span>
            <span class="text-sm font-bold uppercase tracking-wider" style="color: #f97316;">{item.label}</span>
          </div>
          <ul class="grid sm:grid-cols-2 gap-2">
            {item.features.map((f) => (
              <li class="text-sm" style="color: #555;">{f}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingRoadmap.astro
git commit -m "feat(ui): add LandingRoadmap component"
```

---

### Task 9: Create LandingFAQ.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingFAQ.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingFAQ.astro`:**

```astro
---
const items = [
  {
    q: "¿Necesito tarjeta de crédito para el plan gratuito?",
    a: "No. El plan gratuito no requiere tarjeta de crédito ni límite de tiempo — usalo el tiempo que quieras.",
  },
  {
    q: "¿Qué límites tiene el plan gratuito?",
    a: "Hasta 20 productos, 1 menú activo y 500 órdenes por mes. Si tu operación crece, podés pasarte al plan Cloud o adquirir la Licencia Única cuando lo necesites.",
  },
  {
    q: "¿Qué necesito para instalar la licencia única?",
    a: "Una PC o mini PC dentro del restaurante con Windows o Mac. El software corre como servidor web en tu red local. Las tablets y monitores se conectan por WiFi interno, sin necesitar internet.",
  },
  {
    q: "¿Puedo cambiar del plan Cloud a la Licencia Única después?",
    a: "Sí. Si ya pagaste meses del plan Cloud y querés pasarte a la licencia, lo descontamos proporcionalmente.",
  },
];
---
<section class="py-20 px-4" style="background: #fafaf8;">
  <div class="max-w-3xl mx-auto">
    <div class="text-center mb-12">
      <p class="text-sm font-bold uppercase tracking-widest mb-3" style="color: #f97316;">FAQ</p>
      <h2 class="text-3xl font-extrabold" style="color: #111;">Preguntas frecuentes</h2>
    </div>
    <div class="flex flex-col gap-2" id="faq-list">
      {items.map((faq, i) => (
        <div class="rounded-xl border overflow-hidden" style="border-color: #ebebeb;">
          <button
            class="w-full flex justify-between items-center p-5 text-left font-semibold text-sm transition-colors hover:text-orange-500"
            style="background: #ffffff; color: #111;"
            data-faq={i}
            aria-expanded="false"
          >
            {faq.q}
            <span class="faq-icon text-lg flex-shrink-0 ml-4 transition-transform" style="color: #f97316;">+</span>
          </button>
          <div
            class="faq-answer hidden px-5 pb-5 text-sm leading-relaxed"
            style="background: #fafaf8; color: #555;"
          >
            {faq.a}
          </div>
        </div>
      ))}
    </div>
  </div>
</section>

<script>
  document.querySelectorAll('[data-faq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling as HTMLElement;
      const icon = btn.querySelector('.faq-icon') as HTMLElement;
      const isOpen = !answer.classList.contains('hidden');
      answer.classList.toggle('hidden', isOpen);
      icon.textContent = isOpen ? '+' : '−';
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
</script>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingFAQ.astro
git commit -m "feat(ui): add LandingFAQ component"
```

---

### Task 10: Create LandingContacto.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingContacto.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingContacto.astro`:**

```astro
---
const GOOGLE_FORM_URL = "https://forms.gle/JbSAxyJx6kaXTbeA7";
---
<section id="contacto" class="py-20 px-4" style="background: #fafaf8;">
  <div class="max-w-xl mx-auto text-center">
    <p class="text-sm font-bold uppercase tracking-widest mb-3" style="color: #f97316;">Contacto</p>
    <h2 class="text-3xl font-extrabold mb-3" style="color: #111;">¿Hablamos?</h2>
    <p class="text-base mb-10" style="color: #555;">
      Completá el formulario y te respondemos en menos de 24hs por WhatsApp.
    </p>
    <a
      href={GOOGLE_FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-block px-10 py-4 rounded-full font-bold text-white text-base transition-all hover:-translate-y-1"
      style="background: #f97316; box-shadow: 0 6px 24px rgba(249,115,22,0.4);"
    >
      Completar formulario →
    </a>
    <p class="text-xs mt-4" style="color: #888;">Abre en una nueva pestaña · Tarda menos de 1 minuto</p>
  </div>
</section>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingContacto.astro
git commit -m "feat(ui): add LandingContacto component"
```

---

### Task 11: Create LandingFooter.astro

**Files:**
- Create: `apps/ui/src/components/landing/LandingFooter.astro`

- [ ] **Create `apps/ui/src/components/landing/LandingFooter.astro`:**

```astro
---
const year = new Date().getFullYear();
---
<footer class="py-10 px-4 border-t text-center" style="border-color: #ebebeb;">
  <p class="text-sm" style="color: #888;">
    Daikulab © {year} ·
    <a
      href="https://daikulab.com"
      class="hover:text-orange-500 transition-colors"
      style="color: #bbb;"
    >
      daikulab.com
    </a>
  </p>
</footer>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/components/landing/LandingFooter.astro
git commit -m "feat(ui): add LandingFooter component"
```

---

### Task 12: Replace index.astro

**Files:**
- Modify: `apps/ui/src/pages/index.astro`

- [ ] **Replace the full contents of `apps/ui/src/pages/index.astro`:**

```astro
---
export const prerender = true;
import Layout from '../layouts/Layout.astro';
import LandingNavbar from '../components/landing/LandingNavbar.astro';
import LandingHero from '../components/landing/LandingHero.astro';
import LandingDolor from '../components/landing/LandingDolor.astro';
import LandingModulos from '../components/landing/LandingModulos.astro';
import LandingPrecios from '../components/landing/LandingPrecios.astro';
import LandingPrueba from '../components/landing/LandingPrueba.astro';
import LandingRoadmap from '../components/landing/LandingRoadmap.astro';
import LandingFAQ from '../components/landing/LandingFAQ.astro';
import LandingContacto from '../components/landing/LandingContacto.astro';
import LandingFooter from '../components/landing/LandingFooter.astro';
---

<Layout
  title="Daikulab para Restaurantes — Gratis para siempre o $59 una sola vez"
  description="Manejá tu restaurante desde una sola pantalla. Pedidos, cocina, inventario y caja. Empezá gratis, sin tarjeta de crédito."
>
  <LandingNavbar />
  <main>
    <LandingHero />
    <LandingDolor />
    <LandingModulos />
    <LandingPrecios />
    <LandingPrueba />
    <LandingRoadmap />
    <LandingFAQ />
    <LandingContacto />
  </main>
  <LandingFooter />
</Layout>
```

- [ ] **Commit:**

```bash
git add apps/ui/src/pages/index.astro
git commit -m "feat(ui): replace index with full landing page"
```

---

### Task 13: Verify in browser

- [ ] **Start the dev server** (from `apps/ui/` or via Docker):

```bash
# Docker (preferred per CLAUDE.md)
docker compose up res-ui

# Or locally
cd apps/ui && pnpm dev
```

- [ ] **Open `http://localhost:4321`** and verify:
  - Navbar is fixed, links scroll to sections, CTA → `/onboarding`
  - Hero full-height, badge, headline, two CTAs, scroll indicator animates
  - Dolor: 3 cards on white bg
  - Módulos: 8-item grid with hover lift
  - Precios: orange-bordered free card + dimmed local card
  - Prueba: white card with orange border, limits + warnings
  - Roadmap: 3 rows on `#f5f5f3` background
  - FAQ: accordion opens/closes with `+`/`−`
  - Contacto: CTA opens Google Form in new tab
  - Footer: year + daikulab.com link
  - Navbar blur on scroll works

- [ ] **Commit any fixes discovered during visual review.**
