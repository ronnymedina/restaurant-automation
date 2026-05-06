# Kiosk Mobile Scroll & Layout Bug Spec

**Date:** 2026-04-29
**Status:** Pendiente — scroll aún no resuelto

---

## Descripción del problema

El kiosk en vista móvil (portrait mode, ancho < 1024px) presenta dos fallas visuales críticas:

1. **No hace scroll vertical** — el ProductGrid no se puede scrollear aunque tenga más contenido del que cabe en pantalla.
2. **El CartFab no se ve** — el botón flotante del carrito no aparece aunque haya ítems en el carrito.

Secundariamente:
3. **El menú "Principal" no muestra productos** — podría ser problema de datos o el mismo bug de scroll haciendo que el contenido quede fuera de vista.

---

## Síntoma observado (screenshot)

- Vista móvil (~390px de ancho)
- Tab "Bebidas" activo, muestra secciones "Batidos" y "Shots"
- La columna derecha del grid aparece parcialmente cortada fuera de pantalla (overflow horizontal visible)
- No se puede deslizar hacia abajo para ver más productos
- El CartFab (botón flotante del carrito) no se ve en pantalla

---

## Causas identificadas y parches aplicados (ninguno resolvió el problema aún)

### Causa 1: `min-h-0` faltante en `<main>` (flex overflow clásico)

En un flex column, los hijos tienen `min-height: auto` por defecto, lo que les permite crecer hasta el tamaño de su contenido ignorando el constraint del padre. Con `flex-1 overflow-y-auto` sin `min-h-0`, el `<main>` nunca activa el scroll porque desde su perspectiva nunca "desborda".

**Parche aplicado:** `min-h-0` agregado a `<main>` en ambos layouts (portrait y sidebar) en `KioskApp.tsx`, y al contenedor izquierdo en sidebar mode.

**Resultado:** No resolvió el scroll en móvil.

---

### Causa 2: Overflow horizontal rompiendo el scroll táctil

Cuando `overflow-y: auto` coexiste con overflow horizontal en el mismo elemento, en navegadores móviles los gestos táctiles quedan ambiguos entre scroll vertical y horizontal. El navegador no activa ninguno correctamente.

La fuente probable del overflow horizontal: imágenes de productos que escapen del contenedor `aspect-[4/3]` (le faltaba `overflow-hidden`).

**Parches aplicados:**
- `overflow-x-hidden` agregado a `<main>` en ambos layouts.
- `overflow-hidden` agregado al div `aspect-[4/3]` en `ProductCard.tsx`.

**Resultado:** No resolvió el scroll en móvil.

---

### Causa 3: `h-screen` (100vh) en navegadores móviles reales

En iOS Safari y Chrome mobile, `100vh` incluye el área del chrome del navegador (barra de direcciones, barra de navegación). Esto hace que:
- El contenido al fondo quede oculto detrás de la UI del browser.
- El CartFab con `fixed bottom-6` quede posicionado detrás de la barra inferior del navegador.

**Parche aplicado:**
- `h-screen` → `h-dvh` (dynamic viewport height) en `KioskApp.tsx`.
- `height: 100dvh` en `html, body` de `KioskLayout.astro`.

**Resultado:** No resolvió el scroll en móvil.

---

### Causa 4: `overflow: hidden` en elemento `<html>` clippeando CartFab

En algunos navegadores, cuando `<html>` tiene `overflow: hidden`, los elementos con `position: fixed` pueden quedar clipeados por el bounding box del elemento raíz, haciéndolos invisibles.

**Parche aplicado:** `overflow: hidden` removido del elemento `<html>` en `KioskLayout.astro` (mantenido solo en `<body>`).

**Resultado:** No resolvió la visibilidad del CartFab.

---

### Causa 5: `min-h-0` en CartPanel

El CartPanel (overlay y sidebar) tenía el mismo bug de flex overflow en su área de contenido (`flex-1 overflow-y-auto` sin `min-h-0`). Los ítems del carrito no scrolleaban.

**Parche aplicado:** `min-h-0` agregado a las áreas de contenido en `CartPanel.tsx`.

---

## Estado actual de archivos modificados

| Archivo | Cambios |
|---|---|
| `apps/ui/src/components/kiosk/KioskApp.tsx` | `h-dvh`, `min-h-0`, `overflow-x-hidden overflow-y-auto` en `<main>`, `pb-28` cuando CartFab visible |
| `apps/ui/src/components/kiosk/CartPanel.tsx` | `min-h-0` en contenedores de contenido |
| `apps/ui/src/components/kiosk/ProductCard.tsx` | `overflow-hidden` en contenedor de imagen |
| `apps/ui/src/layouts/KioskLayout.astro` | `height: 100dvh`, `overflow: hidden` solo en `<body>` |

---

## Lo que aún no funciona

- **Scroll vertical en móvil sigue sin funcionar** a pesar de todos los parches.
- **CartFab sigue sin verse** después de agregar ítems al carrito en móvil.

---

## Hipótesis pendientes de investigar

1. **El elemento `astro-island`** que envuelve el componente React podría tener `display: inline` o alguna propiedad que rompe el modelo de layout del flex container. Verificar en DevTools qué display tiene `astro-island` en el DOM real.

2. **El nodo raíz de React** (`#root` o similar) que Astro crea para montar el componente podría no tener `height: 100%` o `height: 100dvh`, haciendo que el `h-dvh` del KioskApp root div no tenga efecto real porque su padre no tiene altura definida.

3. **iOS Safari específico**: en versiones antiguas de Safari, `overflow-y: auto` en un flex child no activa scroll táctil sin `-webkit-overflow-scrolling: touch` (deprecado pero funcional). Verificar en qué browser/versión ocurre.

4. **El componente root necesita un wrapper con altura explícita**: podría ser necesario agregar un div wrapper en `index.astro` o en `KioskLayout.astro` con `height: 100dvh; display: flex; flex-direction: column;` que envuelva el slot, asegurando que el contenedor padre del React island tenga altura definida.

---

## Próximo paso sugerido

Abrir DevTools en el navegador móvil o en la emulación móvil e inspeccionar:

1. El computed height del elemento `<main>` — ¿tiene una altura finita o es igual al tamaño de su contenido?
2. El display y height del elemento `astro-island`.
3. El overflow computed de `<main>` — ¿es `auto` o `visible`?

Si `<main>` tiene el mismo height que su contenido (ej. 1500px cuando el viewport es 800px), el `min-h-0` no está teniendo efecto, lo que apunta a la hipótesis 1 o 2.
