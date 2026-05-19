# Kiosk Category Dividers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el separador de categorías del kiosk con un divisor de líneas horizontales grises que mejore la visibilidad entre secciones.

**Architecture:** Cambio puntual en `ProductGrid.tsx` — el `h3` actual se reemplaza por un `div` flex con dos líneas `h-px bg-slate-200` flanqueando el nombre de la categoría. Sin nuevas dependencias ni cambios de API.

**Tech Stack:** React, Tailwind CSS

---

### Task 1: Reemplazar el separador de categoría en ProductGrid

**Files:**
- Modify: `apps/ui/src/components/kiosk/ProductGrid.tsx:26`

- [ ] **Step 1: Abrir el archivo y localizar el `h3`**

El nodo a reemplazar está en línea 26:

```tsx
<h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-6 mb-3 first:mt-0">
  {sectionName}
</h3>
```

- [ ] **Step 2: Reemplazar el `h3` por el divisor con líneas**

Sustituir el bloque anterior por:

```tsx
<div className="flex items-center gap-3 mt-8 mb-4 first:mt-0">
  <div className="flex-1 h-px bg-slate-200" />
  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
    {sectionName}
  </span>
  <div className="flex-1 h-px bg-slate-200" />
</div>
```

El archivo completo debe quedar así:

```tsx
import type { AddToCartPayload, KioskTheme, MenuItem } from './types/kiosk.types'
import { ProductCard } from './ProductCard'

type ProductGridProps = {
  sections: Record<string, MenuItem[]>
  theme: KioskTheme
  onAddItem: (item: AddToCartPayload) => void
}

export function ProductGrid({ sections, theme, onAddItem }: ProductGridProps) {
  const sectionEntries = Object.entries(sections)
  const hasItems = sectionEntries.some(([, items]) => items.length > 0)

  if (sectionEntries.length === 0 || !hasItems) {
    return (
      <div className="text-center text-slate-400 py-12">
        No hay productos en este menú
      </div>
    )
  }

  return (
    <div>
      {sectionEntries.map(([sectionName, items]) => (
        <div key={sectionName}>
          <div className="flex items-center gap-3 mt-8 mb-4 first:mt-0">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
              {sectionName}
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {items.map((item) => (
              <ProductCard
                key={item.menuItemId ?? item.id}
                title={item.name}
                description={item.description}
                price={item.price}
                imageUrl={item.imageUrl}
                stockStatus={item.stockStatus}
                theme={theme}
                onAdd={() =>
                  onAddItem({
                    productId: item.id,
                    menuItemId: item.menuItemId,
                    name: item.name,
                    price: item.price,
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que el servidor de desarrollo compila sin errores**

```bash
docker compose logs res-ui --tail=20
```

Esperado: sin errores de TypeScript ni Tailwind.

- [ ] **Step 4: Revisar visualmente en el kiosk**

Abrir `http://localhost:4321/kiosk?slug=<slug-de-prueba>` y verificar:
- Las categorías muestran líneas horizontales a cada lado del nombre
- El nombre aparece en gris medio (`slate-500`), más oscuro que antes
- Hay más espacio entre la última tarjeta de una sección y el divisor de la siguiente
- La primera categoría no tiene margen extra en la parte superior

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/kiosk/ProductGrid.tsx
git commit -m "feat(ui): improve kiosk category dividers visibility"
```
