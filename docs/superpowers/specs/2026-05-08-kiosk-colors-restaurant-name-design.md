# Kiosk: Colores de marca + nombre de restaurante

**Fecha:** 2026-05-08
**Branch:** feature/profile-restaurante

## Contexto

El kiosk usa un tema con `primary: '#111827'` (gris oscuro) que no corresponde a la identidad visual de la plataforma (naranja `#f97316`, blanco, negro). Además, cuando un cliente accede al kiosk no ve el nombre del restaurante en ningún lugar — solo el nombre del menú activo en el header.

## Objetivos

1. Alinear la paleta de colores del kiosk al brand de la plataforma.
2. Mostrar el nombre del restaurante en el header del kiosk activo.
3. Mostrar el nombre del restaurante en la pantalla de caja cerrada y mejorar su diseño.

## Decisiones de diseño

| Elemento | Valor |
|---|---|
| Color primario (header, tabs, FAB, botón Pagar) | `#f97316` |
| Color primario oscuro (hover) | `#ea6c0a` |
| Fondo de página | `#fafaf8` |
| Texto principal | `#111` |
| Texto muted | `#555` |
| Badge de estado "Abierto" | Fondo blanco, punto verde `#22c55e`, texto `#111` |
| Header layout | Nombre restaurante (pequeño, uppercase, semi-transparente) encima del nombre del menú activo (grande, bold) |
| Pantalla cerrada | Contenido centrado con nombre del restaurante dentro del texto + franja naranja al pie con el nombre en uppercase |

## Cambios por capa

### Backend — `apps/api-core/src/kiosk/`

**`kiosk.service.ts`** — `getStatus(slug)`:
- Actualmente retorna `{ registerOpen: boolean }`.
- Cambio: retornar también `restaurantName: string` (disponible en el objeto `restaurant` ya obtenido).

```ts
// Antes
return { registerOpen: !!session };

// Después
return { registerOpen: !!session, restaurantName: restaurant.name };
```

**`dto/kiosk-response.dto.ts`** — `KioskStatusDto`:
- Agregar campo `restaurantName: string` con su decorador `@ApiProperty`.

---

### Frontend — Store

**`types/kiosk.types.ts`** — `KioskStore`:
- Agregar `restaurantName: string`.

**`store/kiosk.store.ts`** — `initialState`:
- Inicializar `restaurantName: ''`.

**`store/kiosk.store.ts`** — `init(slug)`:
- Al parsear la respuesta del status, guardar `restaurantName` en el estado.

```ts
// En la respuesta del status:
const data = await res.json()
sessionOpen = data.registerOpen
set({ restaurantName: data.restaurantName ?? '' })
```

---

### Frontend — Componentes

#### `KioskApp.tsx`

Actualizar `defaultTheme`:
```ts
const defaultTheme: KioskTheme = {
  primary: '#f97316',
  primaryDark: '#ea6c0a',
  accent: '#f97316',
  background: '#fafaf8',
  surface: '#ffffff',
  text: '#111',
  textMuted: '#555',
}
```

Leer `restaurantName` del store y pasarlo a `KioskHeader` y `SessionClosedScreen`.

#### `KioskHeader.tsx`

Agregar prop `restaurantName: string`. Nuevo layout del header:

```
┌─────────────────────────────────────────────┐
│ LA PARRILLA DEL CHEF          ● Abierto     │  ← fondo #f97316
│ Carnes y Parrillas                          │
└─────────────────────────────────────────────┘
```

- Primera línea: `restaurantName` en uppercase, `font-size: 11px`, `color: rgba(255,255,255,0.65)`, `letter-spacing: 1.5px`. Si `restaurantName` está vacío, no se renderiza esta línea.
- Segunda línea: nombre del menú activo, `font-size: 20px`, `font-weight: 700`, `color: #fff`
- Badge "Abierto": `background: #fff`, `color: #111`, punto verde `#22c55e` de `7px`, `border-radius: 20px`

#### `SessionClosedScreen.tsx`

Agregar prop `restaurantName: string`. Rediseño completo:

```
┌─────────────────────────────────────────────┐
│                                             │
│              🔒                             │
│        Pedidos cerrados                     │
│  La caja de [Restaurante] no está          │
│  disponible en este momento.               │
│  Por favor consulta al personal.           │
│                                             │
├─────────────────────────────────────────────┤
│     LA PARRILLA DEL CHEF                   │  ← franja #f97316
└─────────────────────────────────────────────┘
```

- Fondo: `#fafaf8`
- Emoji: `text-6xl` centrado
- Título: "Pedidos cerrados", `font-bold`, `text-2xl`, `#111`
- Texto: nombre del restaurante en negrita dentro del párrafo
- Franja pie: `background: #f97316`, nombre en uppercase, `color: rgba(255,255,255,0.85)`, `letter-spacing: 2px`

## Archivos a modificar

| Archivo | Tipo de cambio |
|---|---|
| `apps/api-core/src/kiosk/kiosk.service.ts` | Extender `getStatus()` |
| `apps/api-core/src/kiosk/dto/kiosk-response.dto.ts` | Agregar `restaurantName` al DTO |
| `apps/ui/src/components/kiosk/types/kiosk.types.ts` | Agregar `restaurantName` al store type |
| `apps/ui/src/components/kiosk/store/kiosk.store.ts` | Inicializar y poblar `restaurantName` |
| `apps/ui/src/components/kiosk/KioskApp.tsx` | Actualizar `defaultTheme`, pasar `restaurantName` |
| `apps/ui/src/components/kiosk/KioskHeader.tsx` | Nuevo layout con `restaurantName` y badge rediseñado |
| `apps/ui/src/components/kiosk/SessionClosedScreen.tsx` | Rediseño completo con `restaurantName` |

## Archivos NO modificados

- `kiosk.controller.ts` — no requiere cambios, el endpoint ya llama a `getStatus()`
- `KioskLayout.astro` — sin cambios
- `MenuTabs.tsx`, `CartFab.tsx`, `CartPanel.tsx` — se benefician automáticamente del nuevo `theme.primary` sin cambios de código
- `LoadingScreen.tsx` — no tiene el nombre disponible en ese momento; se deja como está

## Tests a actualizar

- `apps/api-core/src/kiosk/kiosk.service.spec.ts` — actualizar el test de `getStatus()` para incluir `restaurantName` en el valor esperado
