# Landing Page Migration — Design Spec

**Date:** 2026-05-08
**Scope:** Migrate content from daikulab `restaurante` landing page into `apps/ui/src/pages/index.astro`, adapting the dark theme to the project's light/orange theme. Spanish only.

---

## Goal

Replace the current minimal `index.astro` hero with a full marketing landing page containing all sections from the daikulab restaurante page: Navbar, Hero, Dolor, Módulos, Precios, Prueba, Roadmap, FAQ, Contacto, Footer.

---

## File Structure

```
apps/ui/src/
├── pages/
│   └── index.astro                  ← replaced (imports all components)
└── components/
    └── landing/                     ← new folder
        ├── LandingNavbar.astro
        ├── LandingHero.astro
        ├── LandingDolor.astro
        ├── LandingModulos.astro
        ├── LandingPrecios.astro
        ├── LandingPrueba.astro
        ├── LandingRoadmap.astro
        ├── LandingFAQ.astro
        ├── LandingContacto.astro
        └── LandingFooter.astro
```

`index.astro` imports and composes all components using the existing `Layout.astro`. The current hero content is fully replaced.

---

## Color Adaptation (dark → light)

| Role | Daikulab (dark) | This project (light) |
|---|---|---|
| Page background | `#0a0510`, `#06020e` | `#fafaf8` |
| Card background | `#12091e` | `#ffffff` + `shadow-sm` or `shadow-md` |
| Card borders | `#1f1530` | `#ebebeb` |
| Headings | `#fafafa` | `#111` |
| Body text | `#9ca3af` | `#555` |
| Muted text | `#4b5563` | `#888` |
| Orange accent | `#f97316` / `#fb923c` | unchanged |
| Navbar scrolled | dark blur (`rgba(10,5,16,0.9)`) | light blur (`rgba(250,250,248,0.92)`) |

---

## Sections

### LandingNavbar
- Fixed top, z-50
- Left: brand "Daiku**Lab**" + subtitle "para restaurantes"
- Center/right links (desktop): Módulos, Precios, Contacto
- CTA button → `/onboarding`
- Scroll behavior: add backdrop-blur + light background + border-bottom on scroll
- No language picker (Spanish-only for now)

### LandingHero
- Full-height section, centered
- Badge: "🎉 Gratis para siempre · o $59 una sola vez con licencia local"
- Headline: "Manejá tu restaurante / sin pagar una fortuna."
- Subtitle: "Pedidos, cocina, inventario y caja — todo en un solo sistema. / Empezá gratis hoy. Sin tarjeta de crédito. Sin límite de tiempo."
- CTAs: "Empezar gratis" → `/onboarding` (primary orange), "Ver planes y precios" → `#precios` (outline)
- Trust line: "Sin tarjeta de crédito · Sin tiempo límite · Tus datos se conservan"
- Subtle radial gradient background (orange/warm tones, light version)
- Scroll indicator arrow at bottom

### LandingDolor
- Section label: "¿Te suena familiar?"
- 3 cards (grid responsive): Operación en papel, Si se cae internet, Filas y esperas

### LandingModulos
- `id="modulos"` for anchor link
- Section label: "Módulos"
- Headline: "Todo lo que necesitás para operar / desde el día 1"
- 8-item grid (sm:2, lg:3): icons + name + description
- Cards: white bg, border `#ebebeb`, hover lift

### LandingPrecios
- `id="precios"` for anchor link
- Section label: "Precios"
- Headline: "Empezá gratis, sin límites en lo que importa"
- 2-column grid (md):
  - **Gratis para siempre**: highlighted with orange border, $0, feature list, CTA → `/onboarding`
  - **Licencia Local**: dimmed, "Próximamente" badge, $59 one-time, feature list, disabled button

### LandingPrueba
- Section label: "Plan gratuito"
- Headline: "¿Qué pasa cuando llegás al límite?"
- Rounded card with subtle orange border
- Left column: limits (Products 20, Menu 1, Órdenes 500/mes)
- Right column: warning behavior (80% → aviso, 100% → bloqueo)
- CTA: "Empezar gratis" → `/onboarding`

### LandingRoadmap
- Section label: "Roadmap"
- Headline: "Lo que viene"
- 3 rows: ✅ Disponible, 🔜 Próximo release, 📅 Futuro
- Cards: white bg, border `#ebebeb`

### LandingFAQ
- `id` not required (no nav link)
- Section label: "FAQ"
- Headline: "Preguntas frecuentes"
- 4 accordion items — JS toggle (same as daikulab)
- Cards: white bg, border `#ebebeb`, expand/collapse with `+`/`−`

### LandingContacto
- `id="contacto"` for anchor link
- Section label: "Contacto"
- Headline: "¿Hablamos?"
- Subtitle + CTA → `https://forms.gle/JbSAxyJx6kaXTbeA7` (opens `_blank`)
- Trust text: "Abre en una nueva pestaña · Tarda menos de 1 minuto"

### LandingFooter
- Replaces current minimal footer in index.astro
- "Daikulab © {year} · daikulab.com"
- Border top `#ebebeb`

---

## Content

All text is hardcoded in Spanish directly in each component. No i18n file or copy object. When multi-language support is added later, strings will be extracted into the i18n system at that time.

---

## Out of scope

- Multi-language support
- Animations beyond existing hover transitions
- Analytics or tracking scripts
- Changes to any other page (login, onboarding, kiosk, dash, etc.)
