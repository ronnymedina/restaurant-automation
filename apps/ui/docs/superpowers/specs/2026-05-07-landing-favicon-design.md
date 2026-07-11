---
title: Landing page y favicon — Daikulab Restaurant
date: 2026-05-07
status: approved
---

## Objetivo

Reemplazar la página raíz `/` (actualmente el template por defecto de Astro) y agregar un favicon real usando el ícono ya existente en el desktop app.

## Favicon

- Copiar `apps/desktop/resources/icon.ico` → `apps/ui/public/favicon.ico`
- Copiar `apps/desktop/tray-32.png` → `apps/ui/public/favicon-32.png`
- Actualizar `apps/ui/src/layouts/Layout.astro`:
  - Quitar la referencia a `/favicon.svg` (el archivo no existe)
  - Agregar `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />`
  - Mantener `<link rel="icon" href="/favicon.ico" />`
  - Cambiar `<title>` a `Daikulab Restaurant`

## Landing page

Reemplazar el contenido de `apps/ui/src/pages/index.astro` con un hero inline (sin usar `Welcome.astro`). La página `Welcome.astro` queda sin uso y puede eliminarse junto con `src/assets/astro.svg` y `src/assets/background.svg`.

### Layout visual

Una sola pantalla (100vh), sin scroll. Fondo: gradiente `from-[#667eea] to-[#764ba2]` (idéntico al login). Contenido centrado horizontal y verticalmente.

### Componentes del hero (de arriba hacia abajo)

1. **Ícono**: `<img src="/favicon-32.png">` con tamaño 40×40px, sin filtro
2. **Nombre principal**: "Daikulab" — blanco, font-extrabold, ~3.5rem
3. **Subtítulo de marca**: "Restaurant" — uppercase, tracking-widest, blanco/60%, text-sm
4. **Tagline**: "Gestión inteligente para tu restaurante" — blanco/70%, text-lg, margen superior
5. **Botones** (flex, gap, centrados):
   - "Iniciar sesión" → `/login` — fondo blanco, texto índigo, rounded-full
   - "Registrarse" → `/onboarding` — outline blanco, texto blanco, rounded-full

### Archivos modificados

| Archivo | Acción |
|---|---|
| `apps/ui/public/favicon.ico` | Nuevo (copiado) |
| `apps/ui/public/favicon-32.png` | Nuevo (copiado) |
| `apps/ui/src/layouts/Layout.astro` | Actualizar favicon refs y title |
| `apps/ui/src/pages/index.astro` | Reemplazar Welcome con hero inline |
| `apps/ui/src/components/Welcome.astro` | Eliminar |
| `apps/ui/src/assets/astro.svg` | Eliminar |
| `apps/ui/src/assets/background.svg` | Eliminar |
