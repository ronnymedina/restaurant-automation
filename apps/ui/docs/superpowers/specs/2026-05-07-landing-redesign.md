---
title: Landing page rediseño — Clara & Moderna con preview del producto
date: 2026-05-07
status: approved
---

## Objetivo

Reemplazar el hero actual de la landing (`/`) — fondo gradiente morado, ícono de favicon — con un diseño profesional de SaaS: fondo claro, tipografía bold negra, acento naranja, y un hero dividido que muestra un preview del producto.

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Dirección | Clara & Moderna (fondo crema) |
| Color de acento | Naranja `#f97316` |
| Estructura del hero | Split: texto izquierda + cards del producto derecha |
| Ícono | Eliminado |
| Fondo | `#fafaf8` con blobs naranja decorativos (`opacity: 0.05–0.06`) |

## Layout general

Una sola pantalla (`min-h-screen`), sin scroll. Estructura vertical:

1. **Franja de acento** — 4px, `background: #f97316`, ancho completo
2. **Hero** — flex row, centrado vertical y horizontalmente, padding generoso
3. **Footer mínimo** — links de privacidad/términos/contacto

## Hero — columna izquierda

De arriba hacia abajo:

1. **Eyebrow label**: "Software para restaurantes" — `text-xs`, `font-bold`, `tracking-[5px]`, `uppercase`, color `#f97316`
2. **Headline**: "Daikulab" — `text-[58px]`, `font-black`, `text-[#111]`, `tracking-[-3px]`, `leading-[0.92]`
3. **Tagline**: "La plataforma que moderniza la gestión de tu restaurante — pedidos, cocina y métricas en un solo lugar." — `text-[15px]`, `text-[#555]`, `leading-relaxed`, `max-w-[300px]`
4. **CTAs** (flex row, gap):
   - "Iniciar sesión" → `/login` — `bg-[#f97316]`, `text-white`, `font-bold`, `rounded-lg`, `px-7 py-3`
   - "Registrarse →" → `/onboarding` — `border-2 border-[#111]`, `text-[#111]`, `font-semibold`, `rounded-lg`, `px-7 py-3`
5. **Trust line**: "Sin tarjeta de crédito · Configuración en minutos" — `text-xs`, `text-[#aaa]`

## Hero — columna derecha (product preview)

Dos cards flotantes apiladas verticalmente (`flex-col`, `gap-3`), ancho fijo ~240px:

### Card 1 — Estadísticas del día
- Label: "Pedidos hoy" (xs uppercase tracking)
- Número grande: "142" (bold, 28px)
- Trend: "↑ +12% esta semana" (verde `#059669`, xs)
- 3 barras de progreso (Mesa / Kiosk / Online) con colores: naranja / negro / gris

### Card 2 — Últimos pedidos
- Label: "Últimos pedidos"
- 3 filas con nombre del pedido + badge de estado (En cocina: fondo `#ffedd5` texto naranja / Listo: fondo `#d1fae5` texto verde)

Ambas cards: `bg-white`, `rounded-xl`, `shadow-md`, `p-4`

## Decoración de fondo

Dos blobs circulares, posición `absolute`, fuera del flujo:
- Blob 1: top-right, 320px, `bg-[#f97316]`, `opacity-5`
- Blob 2: bottom-left, 200px, `bg-[#f97316]`, `opacity-[0.06]`

## Footer

Flex row, justify-between, `border-t border-[#ebebeb]`, `px-16 py-3`:
- Izquierda: "DAIKULAB" — `text-xs`, `font-bold`, `text-[#bbb]`, `tracking-widest`
- Derecha: links "Política de privacidad · Términos · Contacto" — `text-xs`, `text-[#bbb]`

## Archivos modificados

| Archivo | Acción |
|---|---|
| `apps/ui/src/pages/index.astro` | Reemplazar hero actual con nuevo diseño |

## Archivos NO modificados

- `Layout.astro` — no requiere cambios (favicons y título ya están correctos del spec anterior)
- Cards del hero son HTML inline — no se crean componentes separados (página simple, no justifica abstracción)

## Datos en las cards

Los datos (142 pedidos, barras, nombres de pedidos) son **ficticios hardcodeados** — el propósito es mostrar el tipo de información que maneja la plataforma, no datos reales. No hay llamadas a API.
