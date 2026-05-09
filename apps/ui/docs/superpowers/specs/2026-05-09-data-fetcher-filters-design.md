# DataFetcher con Filtros — Diseño

**Fecha:** 2026-05-09  
**Rama:** refacto-ui-componentes

## Problema

`TableWithFetch` acopla la lógica de fetch con la presentación en tabla. Cuando los filtros cambian desde el padre, el estado interno de `page` no se resetea a 1 — los consumidores compensan esto con el hack `key={debouncedSearch}` que fuerza un remount completo. Además, no hay forma de reutilizar la lógica de fetch con otras presentaciones (ej. cards de productos).

## Objetivo

1. Separar la lógica de fetch/filtros/paginación de la presentación mediante un componente genérico `DataFetcher<T>`.
2. Cuando `filters` cambia, la página se resetea a 1 automáticamente — eliminando el hack `key`.
3. `TableWithFetch` se convierte en un wrapper especializado de `DataFetcher`.
4. Cualquier nuevo componente (cards, listas, etc.) puede usar `DataFetcher` directamente con su propia presentación vía `renderItem`.

---

## Arquitectura

### Hook `useFetchWithFilters<T>` (nuevo — núcleo compartido)

Hook interno que encapsula toda la lógica de fetch. Es el núcleo reutilizable que usan tanto `DataFetcher` como `TableWithFetch`.

```tsx
function useFetchWithFilters<T>(url: string, filters?: Record<string, string>) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [filters]);

  const { data, isLoading, isError } = useQuery<ApiResponse<T>>({
    queryKey: [url, filters, page],
    queryFn: async () => { ... },
  });

  return { data: data?.data ?? [], meta: data?.meta, isLoading, isError, page, setPage };
}
```

### Componente `DataFetcher<T>` (nuevo — para cards y listas)

Usa `useFetchWithFilters` y renderiza ítems con `renderItem` en un contenedor `<div>`. Ideal para cards, grids, listas personalizadas.

**Props:**

```tsx
interface DataFetcherProps<T> {
  url: string;
  filters?: Record<string, string>;
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
}
```

**Renderizado:**

```tsx
<div>
  {isLoading ? <Cargando /> : isError ? <Error /> : data.length === 0 ? <Vacío /> : (
    data.map(item => <Fragment key={keyExtractor(item)}>{renderItem(item)}</Fragment>)
  )}
  {pagination && <Paginación />}
</div>
```

### Componente `TableWithFetch<T>` (refactorizado — para tablas)

Usa `useFetchWithFilters` directamente (no `DataFetcher`) para poder controlar la estructura HTML de tabla (`<table><thead><tbody>`). API externa sin cambio excepto el rename `params` → `filters`.

**Props:**

```tsx
interface TableWithFetchProps<T> {
  url: string;
  columns: ColumnDef<T>[];
  filters?: Record<string, string>;  // antes: params
  emptyMessage?: string;
}
```

**Implementación interna:**

- Llama a `useFetchWithFilters<T>(url, filters)`
- Pasa `data`, `isLoading`, `page`, `setPage`, `meta` al componente `<Table>` existente
- No cambia el look visual actual

### Ejemplo de uso — Cards de productos

```tsx
<DataFetcher<Product>
  url="/v1/products"
  filters={{ search: debouncedSearch, limit: '20' }}
  keyExtractor={(p) => p.id}
  renderItem={(product) => <ProductCard product={product} />}
  emptyMessage="No hay productos"
/>
```

### Ejemplo de uso — Tabla (sin cambio visible para el consumidor)

```tsx
<TableWithFetch<Category>
  url="/v1/categories"
  filters={{ limit: '20' }}
  columns={columns}
  emptyMessage="No hay categorías"
/>
```

---

## Comportamiento de filtros

| Situación | Resultado |
|---|---|
| `filters` cambia (ej. nuevo search) | `page` se resetea a 1, nueva petición |
| `filters` no cambia, re-render del padre | `page` no cambia |
| Cambio de página (paginación) | Nueva petición con `page=N`, `filters` sin tocar |
| `filters` es `undefined` | Se comporta como `{}` — solo `page` en la URL |

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `apps/ui/src/hooks/useFetchWithFilters.ts` | **NUEVO** — hook compartido con lógica de fetch + filtros + paginación |
| `apps/ui/src/components/commons/DataFetcher.tsx` | **NUEVO** — componente genérico con `renderItem` para cards/listas |
| `apps/ui/src/components/commons/DataFetcher.test.tsx` | **NUEVO** — tests del componente genérico |
| `apps/ui/src/components/commons/TableWithFetch.tsx` | Refactorizar para usar `useFetchWithFilters`; `params` → `filters` |
| `apps/ui/src/components/commons/TableWithFetch.test.tsx` | Adaptar 5 tests existentes + 3 tests nuevos de filtros |
| `apps/ui/src/components/dash/products/ProductsIsland.tsx` | `params` → `filters`, eliminar `key={debouncedSearch}` |
| `apps/ui/src/components/dash/CategoriesTable.tsx` | `params` → `filters` |
| `apps/ui/src/components/dash/menus/MenusIsland.tsx` | `params` → `filters` |
| `apps/ui/src/components/dash/users/UsersIsland.tsx` | `params` → `filters` |

---

## Tests

### `DataFetcher.test.tsx` (nuevo — 6 tests)

1. `muestra estado de carga inicialmente`
2. `renderiza ítems con renderItem`
3. `usa keyExtractor para las keys`
4. `muestra error en respuesta no-ok`
5. `muestra error en fallo de red`
6. `muestra emptyMessage cuando no hay datos`
7. `incluye filters en la URL de la petición`
8. `resetea la página a 1 cuando filters cambia`
9. `no resetea la página si filters no cambia`

### `TableWithFetch.test.tsx` (actualizado)

- 5 tests existentes: adaptar `params` → `filters`
- 3 tests nuevos: mismos que DataFetcher para filtros (verificar que el wrapper los propaga correctamente)

---

## Restricciones

- No se agrega UI de filtros dentro del componente — los filtros siempre vienen del padre.
- No hay compatibilidad hacia atrás con `params` — todos los consumidores se migran en el mismo PR.
- `DataFetcher` no asume estructura de contenedor — usa `React.Fragment` por ítem para que `renderItem` controle el DOM completo.
