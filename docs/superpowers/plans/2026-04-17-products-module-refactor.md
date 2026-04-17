# Products Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the products dashboard page from vanilla JS to a React island using reusable commons (Button, TableWithFetch), a shared ProductForm component (create + edit), Zod validation, and API calls isolated in a dedicated module.

**Architecture:** A `ProductsIsland` root component wraps everything in `QueryClientProvider` (reusing the shared `queryClient` singleton). An inner `ProductsContent` component uses `useQuery`/`useQueryClient` to fetch categories and drive state. `ProductForm` is a standalone component that receives `initialData` for edit mode and calls `onSuccess`/`onCancel` callbacks. API functions live in `src/lib/products-api.ts`.

**Tech Stack:** React 19, TanStack Query v5, TanStack Table v8, Zod (already installed), `apiFetch` from `src/lib/api.ts`, shared `queryClient` from `src/components/commons/Providers.tsx`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/products-api.ts` | Types, API functions, query keys |
| Create | `src/components/dash/products/ProductForm.tsx` | Reusable create/edit form with Zod validation and image upload |
| Create | `src/components/dash/products/ProductsIsland.tsx` | Root island: QueryClientProvider wrapper + ProductsContent |
| Create | `src/components/dash/products/ProductForm.test.tsx` | Unit tests for ProductForm |
| Create | `src/components/dash/products/ProductsIsland.test.tsx` | Unit tests for ProductsIsland |
| Modify | `src/pages/dash/products.astro` | Replace vanilla JS with `<ProductsIsland client:load />` |

---

## Task 0: Review `apps/api-core/src/products/` and validate alignment

**Files to read (no changes):**
- `apps/api-core/src/products/products.controller.ts`
- `apps/api-core/src/products/categories.controller.ts`
- `apps/api-core/src/products/dto/create-product.dto.ts`
- `apps/api-core/src/products/dto/update-product.dto.ts`
- `apps/api-core/src/products/serializers/product-list.serializer.ts`
- `apps/api-core/src/products/serializers/product.serializer.ts`

**Purpose:** Before writing any frontend code, read these files to confirm the contract the frontend must follow. If new fields, routes, or validation rules have been added since the plan was written, update Task 1 (`products-api.ts`) types and function signatures accordingly before proceeding.

- [ ] **Step 1: Read the files and check the checklist below**

Run in `apps/api-core/`:
```bash
cat src/products/products.controller.ts
cat src/products/categories.controller.ts
cat src/products/dto/create-product.dto.ts
cat src/products/dto/update-product.dto.ts
cat src/products/serializers/product-list.serializer.ts
cat src/products/serializers/product.serializer.ts
```

- [ ] **Step 2: Validate the following known constraints — if any have changed, update Task 1 before continuing**

**Endpoints (as of plan date 2026-04-17):**

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| `GET` | `/v1/products` | ADMIN, MANAGER, BASIC | Paginated, returns `ProductListSerializer` |
| `GET` | `/v1/products/:id` | ADMIN, MANAGER, BASIC | Returns `ProductSerializer` (no `category` nested object) |
| `POST` | `/v1/products` | ADMIN, MANAGER only | Body: `CreateProductDto`. Returns `ProductSerializer` |
| `PATCH` | `/v1/products/:id` | ADMIN, MANAGER only | Body: `UpdateProductDto` (all fields optional + `imageUrl: string\|null`). Returns `ProductSerializer` |
| `DELETE` | `/v1/products/:id` | ADMIN, MANAGER only | **Returns 204 No Content** — do not parse response body |
| `GET` | `/v1/categories` | All roles | Paginated |
| `DELETE` | `/v1/categories/:id` | ADMIN, MANAGER | Body: `{ reassignTo?: string }` — required when category has products |

**Shape differences between serializers (critical for types):**

- `ProductListSerializer` (from `GET /v1/products`) includes `category: { name: string }` — used for the table
- `ProductSerializer` (from `POST`/`PATCH`/`GET :id`) does **NOT** include `category` — only `categoryId`
- Both convert `price` from cents (bigint) → decimal via `fromCents`. Frontend sends decimal (e.g. `10.5`), API converts to cents internally.

**`UpdateProductDto` special rule:**

- `imageUrl` is handled separately from the rest (it extends `PartialType(OmitType(CreateProductDto, ['imageUrl']))`)
- Send `imageUrl: null` to remove the existing image
- Send `imageUrl: "https://..."` to set a new URL image
- Omit `imageUrl` entirely to leave the current image unchanged

- [ ] **Step 3: If any endpoints or fields changed, update the types in Task 1 before implementing it. No commit needed for this review step.**

---

## Task 1: Create `src/lib/products-api.ts`

**Files:**
- Create: `apps/ui/src/lib/products-api.ts`

- [ ] **Step 1: Write the file**

```typescript
import { apiFetch } from './api';

export const PRODUCTS_QUERY_KEY = '/v1/products';
export const CATEGORIES_QUERY_KEY = '/v1/categories';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  active: boolean;
  sku: string | null;
  imageUrl: string | null;
  restaurantId: string;
  categoryId: string;
  createdAt: string;
  category: { name: string };
}

export interface Category {
  id: string;
  name: string;
}

export interface ProductPayload {
  name: string;
  categoryId: string;
  price: number;
  stock?: number | null;
  sku?: string;
  imageUrl?: string | null;
  description?: string;
  active?: boolean;
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiFetch('/v1/categories?limit=100');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { data } = await res.json();
  return data;
}

export async function createProduct(payload: ProductPayload): Promise<void> {
  const res = await apiFetch('/v1/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Error al crear el producto');
  }
}

export async function updateProduct(id: string, payload: Partial<ProductPayload>): Promise<void> {
  const res = await apiFetch(`/v1/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Error al actualizar el producto');
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await apiFetch(`/v1/products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Error al eliminar el producto');
}

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/v1/uploads/image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Error al subir la imagen');
  const { url } = await res.json();
  return url;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ui/src/lib/products-api.ts
git commit -m "feat(ui): add products API module with typed functions and query keys"
```

---

## Task 2: Write failing tests for `ProductForm`

**Files:**
- Create: `apps/ui/src/components/dash/products/ProductForm.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import ProductForm from './ProductForm';
import type { Category, Product } from '../../../lib/products-api';

vi.mock('../../../lib/products-api', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadImage: vi.fn(),
}));

import { createProduct, updateProduct } from '../../../lib/products-api';
const mockCreate = vi.mocked(createProduct);
const mockUpdate = vi.mocked(updateProduct);

const categories: Category[] = [
  { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Bebidas' },
  { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Comida' },
];

const editProduct: Product = {
  id: 'prod-1',
  name: 'Hamburguesa',
  price: 10.5,
  categoryId: '550e8400-e29b-41d4-a716-446655440001',
  active: true,
  stock: 5,
  sku: 'HAM-001',
  imageUrl: null,
  description: 'Con queso',
  restaurantId: 'rest-1',
  createdAt: '2026-01-01T00:00:00Z',
  category: { name: 'Bebidas' },
};

const defaultProps = {
  categories,
  onSuccess: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders "Nuevo producto" title in create mode', () => {
  render(<ProductForm {...defaultProps} />);
  expect(screen.getByRole('heading', { name: 'Nuevo producto' })).toBeInTheDocument();
});

test('renders "Editar producto" title and prefills name in edit mode', () => {
  render(<ProductForm {...defaultProps} initialData={editProduct} />);
  expect(screen.getByRole('heading', { name: 'Editar producto' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Nombre/i)).toHaveValue('Hamburguesa');
});

test('prefills price, stock, sku, description in edit mode', () => {
  render(<ProductForm {...defaultProps} initialData={editProduct} />);
  expect(screen.getByLabelText(/Precio/i)).toHaveValue(10.5);
  expect(screen.getByLabelText(/Stock/i)).toHaveValue(5);
  expect(screen.getByLabelText(/SKU/i)).toHaveValue('HAM-001');
  expect(screen.getByLabelText(/Descripción/i)).toHaveValue('Con queso');
});

test('shows validation error when name is empty', async () => {
  render(<ProductForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(screen.getByText(/El nombre es requerido/i)).toBeInTheDocument(),
  );
});

test('shows validation error when price is not positive', async () => {
  render(<ProductForm {...defaultProps} />);
  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Agua' } });
  fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() =>
    expect(screen.getByText(/El precio debe ser mayor a 0/i)).toBeInTheDocument(),
  );
});

test('calls createProduct and onSuccess on valid create submit', async () => {
  mockCreate.mockResolvedValue(undefined);
  render(<ProductForm {...defaultProps} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Agua' } });
  fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  expect(defaultProps.onSuccess).toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('calls updateProduct and onSuccess on valid edit submit', async () => {
  mockUpdate.mockResolvedValue(undefined);
  render(<ProductForm {...defaultProps} initialData={editProduct} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Hamburguesa XL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('prod-1', expect.objectContaining({ name: 'Hamburguesa XL' })));
  expect(defaultProps.onSuccess).toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('shows API error message when createProduct throws', async () => {
  mockCreate.mockRejectedValue(new Error('Error del servidor'));
  render(<ProductForm {...defaultProps} />);

  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Agua' } });
  fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(screen.getByText('Error del servidor')).toBeInTheDocument(),
  );
  expect(defaultProps.onSuccess).not.toHaveBeenCalled();
});

test('calls onCancel when cancel button clicked', () => {
  render(<ProductForm {...defaultProps} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(defaultProps.onCancel).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify they fail (ProductForm doesn't exist yet)**

```bash
cd apps/ui && pnpm test -- ProductForm
```

Expected: FAIL with "Cannot find module './ProductForm'"

---

## Task 3: Implement `ProductForm.tsx`

**Files:**
- Create: `apps/ui/src/components/dash/products/ProductForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import Button from '../../commons/Button';
import type { Category, Product, ProductPayload } from '../../../lib/products-api';
import { createProduct, updateProduct, uploadImage } from '../../../lib/products-api';

const ProductSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(255, 'Máximo 255 caracteres'),
  categoryId: z.string().uuid('Debes seleccionar una categoría'),
  price: z
    .number({ invalid_type_error: 'El precio debe ser un número' })
    .positive('El precio debe ser mayor a 0'),
  stock: z.number().int().nonnegative('El stock no puede ser negativo').nullable().optional(),
  sku: z.string().max(100, 'Máximo 100 caracteres').optional(),
  imageUrl: z
    .string()
    .regex(/^(https?:\/\/.+|\/.+)/, 'La URL de imagen no es válida')
    .nullable()
    .optional(),
  description: z.string().max(1000, 'Máximo 1000 caracteres').optional(),
  active: z.boolean().optional(),
});

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface ProductFormProps {
  initialData?: Product;
  categories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProductForm({ initialData, categories, onSuccess, onCancel }: ProductFormProps) {
  const isEditing = !!initialData;

  const [name, setName] = useState(initialData?.name ?? '');
  const [categoryId, setCategoryId] = useState(
    initialData?.categoryId ?? categories[0]?.id ?? '',
  );
  const [price, setPrice] = useState(
    initialData?.price !== undefined ? String(initialData.price) : '',
  );
  const [stock, setStock] = useState(
    initialData?.stock !== null && initialData?.stock !== undefined
      ? String(initialData.stock)
      : '',
  );
  const [sku, setSku] = useState(initialData?.sku ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [active, setActive] = useState(initialData?.active !== false);
  const [imageUrlInput, setImageUrlInput] = useState('');

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSizeMB, setUploadFileSizeMB] = useState('');
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(
    initialData?.imageUrl ?? null,
  );
  const [imageRemoved, setImageRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isEditing && categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const handleFileSelect = async (file: File) => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    const blob = URL.createObjectURL(file);
    setPreviewBlobUrl(blob);
    setUploadFileName(file.name);
    setUploadFileSizeMB((file.size / 1024 / 1024).toFixed(1));
    setUploadStatus('uploading');
    setUploadedImageUrl(null);
    setCurrentImageUrl(null);
    setImageRemoved(false);
    try {
      const url = await uploadImage(file);
      setUploadedImageUrl(url);
      setUploadStatus('done');
    } catch {
      setUploadStatus('error');
    }
  };

  const clearFileSelection = () => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    setUploadedImageUrl(null);
    setUploadStatus('idle');
    setUploadFileName('');
    setUploadFileSizeMB('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (uploadStatus === 'uploading') {
      setErrors(['La imagen aún se está subiendo, espera un momento']);
      return;
    }

    const resolvedImageUrl: string | null | undefined = uploadedImageUrl
      ? uploadedImageUrl
      : imageRemoved
        ? null
        : imageUrlInput || undefined;

    const raw = {
      name,
      categoryId,
      price: Number(price),
      stock: isEditing ? (stock === '' ? null : Number(stock)) : stock ? Number(stock) : undefined,
      sku: sku || undefined,
      imageUrl: resolvedImageUrl,
      description: description || undefined,
      active,
    };

    const result = ProductSchema.safeParse(raw);
    if (!result.success) {
      setErrors(result.error.issues.map((i) => i.message));
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await updateProduct(initialData!.id, result.data);
      } else {
        await createProduct(result.data as ProductPayload);
      }
      onSuccess();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">
        {isEditing ? 'Editar producto' : 'Nuevo producto'}
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="pf-name" className="block text-sm font-medium text-slate-700 mb-1">
            Nombre *
          </label>
          <input
            id="pf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-price" className="block text-sm font-medium text-slate-700 mb-1">
            Precio *
          </label>
          <input
            id="pf-price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            step="0.01"
            min="0.01"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-stock" className="block text-sm font-medium text-slate-700 mb-1">
            Stock
          </label>
          <input
            id="pf-stock"
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            min="0"
            placeholder="Vacío = ilimitado (∞)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-sku" className="block text-sm font-medium text-slate-700 mb-1">
            SKU
          </label>
          <input
            id="pf-sku"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="pf-category" className="block text-sm font-medium text-slate-700 mb-1">
            Categoría *
          </label>
          <select
            id="pf-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Imagen del producto
          </label>

          {currentImageUrl && uploadStatus === 'idle' && (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
              <img
                src={currentImageUrl}
                alt="imagen actual"
                className="w-16 h-16 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">Imagen actual</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{currentImageUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentImageUrl(null);
                  setImageRemoved(true);
                }}
                className="text-red-500 hover:text-red-700 text-xs font-medium bg-transparent border-none cursor-pointer shrink-0"
              >
                ✕ Quitar
              </button>
            </div>
          )}

          {!currentImageUrl && uploadStatus === 'idle' && (
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors mb-2"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              <p className="text-sm text-slate-500">
                Arrastra una imagen o{' '}
                <span className="text-indigo-600 font-medium">haz clic para seleccionar</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                JPG, PNG, WEBP — si pesa más de 10 MB se comprime automáticamente
              </p>
            </div>
          )}

          {uploadStatus !== 'idle' && previewBlobUrl && (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
              <img src={previewBlobUrl} alt="preview" className="w-16 h-16 object-cover rounded" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{uploadFileName}</p>
                <p
                  className={`text-xs mt-0.5 ${
                    uploadStatus === 'done'
                      ? 'text-green-600'
                      : uploadStatus === 'error'
                        ? 'text-red-600'
                        : 'text-slate-500'
                  }`}
                >
                  {uploadStatus === 'uploading' && `${uploadFileSizeMB} MB — subiendo...`}
                  {uploadStatus === 'done' && '✓ Subida correctamente'}
                  {uploadStatus === 'error' && '⚠ Error al subir la imagen'}
                </p>
              </div>
              <button
                type="button"
                onClick={clearFileSelection}
                className="text-red-500 hover:text-red-700 text-xs font-medium bg-transparent border-none cursor-pointer shrink-0"
              >
                ✕ Quitar
              </button>
            </div>
          )}

          {uploadStatus === 'idle' && !currentImageUrl && (
            <>
              <p className="text-xs text-blue-600 mb-1">
                💡 ¿Foto muy pesada?{' '}
                <a
                  href="https://tinypng.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Comprímela gratis en tinypng.com
                </a>
              </p>
              <input
                id="pf-image-url"
                type="text"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="O pega una URL externa de imagen"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </>
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="pf-description" className="block text-sm font-medium text-slate-700 mb-1">
            Descripción
          </label>
          <textarea
            id="pf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="pf-active"
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="pf-active" className="text-sm font-medium text-slate-700">
            Producto activo
          </label>
        </div>

        <div className="md:col-span-2 flex gap-2">
          <Button
            type="submit"
            disabled={isSubmitting || uploadStatus === 'uploading'}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>

        {errors.length > 0 && (
          <p className="md:col-span-2 text-sm text-red-600">{errors.join(', ')}</p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
cd apps/ui && pnpm test -- ProductForm
```

Expected: All 9 tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/products/ProductForm.tsx apps/ui/src/components/dash/products/ProductForm.test.tsx
git commit -m "feat(ui): add ProductForm component with Zod validation and image upload"
```

---

## Task 4: Write failing tests for `ProductsIsland`

**Files:**
- Create: `apps/ui/src/components/dash/products/ProductsIsland.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import ProductsIsland from './ProductsIsland';

vi.mock('../../../lib/products-api', () => ({
  fetchCategories: vi.fn().mockResolvedValue([
    { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Bebidas' },
  ]),
  deleteProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadImage: vi.fn(),
  PRODUCTS_QUERY_KEY: '/v1/products',
  CATEGORIES_QUERY_KEY: '/v1/categories',
}));

vi.mock('../../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../commons/Providers', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  };
});

import { apiFetch } from '../../../lib/api';
import { deleteProduct } from '../../../lib/products-api';
const mockApiFetch = vi.mocked(apiFetch);
const mockDelete = vi.mocked(deleteProduct);

const emptyResponse = {
  ok: true,
  json: async () => ({ data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 50 } }),
} as Response;

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(emptyResponse);
});

test('renders "Productos" heading and "Nuevo producto" button', () => {
  render(<ProductsIsland />);
  expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeInTheDocument();
});

test('shows ProductForm when "Nuevo producto" is clicked', async () => {
  render(<ProductsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
  expect(screen.getByRole('heading', { name: 'Nuevo producto', level: 3 })).toBeInTheDocument();
});

test('hides ProductForm when cancel is clicked', async () => {
  render(<ProductsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('heading', { name: 'Nuevo producto', level: 3 })).not.toBeInTheDocument();
});

test('shows empty table message when API returns no products', async () => {
  render(<ProductsIsland />);
  await waitFor(() => expect(screen.getByText('No hay productos')).toBeInTheDocument());
});

test('renders product rows from API response', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [
        {
          id: 'p1',
          name: 'Agua',
          price: 5,
          stock: null,
          active: true,
          sku: null,
          imageUrl: null,
          description: null,
          restaurantId: 'r1',
          categoryId: '550e8400-e29b-41d4-a716-446655440001',
          createdAt: '2026-01-01T00:00:00Z',
          category: { name: 'Bebidas' },
        },
      ],
      meta: { page: 1, totalPages: 1, total: 1, limit: 50 },
    }),
  } as Response);

  render(<ProductsIsland />);
  await waitFor(() => expect(screen.getByText('Agua')).toBeInTheDocument());
  expect(screen.getByText('Bebidas')).toBeInTheDocument();
  expect(screen.getByText('$5.00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd apps/ui && pnpm test -- ProductsIsland
```

Expected: FAIL with "Cannot find module './ProductsIsland'"

---

## Task 5: Implement `ProductsIsland.tsx`

**Files:**
- Create: `apps/ui/src/components/dash/products/ProductsIsland.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { queryClient } from '../../commons/Providers';
import TableWithFetch from '../../commons/TableWithFetch';
import Button from '../../commons/Button';
import ProductForm from './ProductForm';
import {
  fetchCategories,
  deleteProduct,
  PRODUCTS_QUERY_KEY,
  CATEGORIES_QUERY_KEY,
} from '../../../lib/products-api';
import type { Product } from '../../../lib/products-api';

function ProductsContent() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: [CATEGORIES_QUERY_KEY, 'all'],
    queryFn: fetchCategories,
  });

  const handleNew = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditingProduct(null);
    qc.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      await deleteProduct(id);
      qc.invalidateQueries({ queryKey: [PRODUCTS_QUERY_KEY] });
    } catch {
      alert('Error al eliminar el producto');
    }
  };

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ getValue }) => (
        <span className="font-medium text-slate-800 max-w-[200px] truncate block">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'price',
      header: 'Precio',
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap">${Number(getValue<number>()).toFixed(2)}</span>
      ),
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return <span className="whitespace-nowrap">{v === null || v === undefined ? '∞' : v}</span>;
      },
    },
    {
      id: 'category',
      header: 'Categoría',
      cell: ({ row }) => (
        <span className="max-w-[160px] truncate block">{row.original.category?.name ?? '-'}</span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Activo',
      cell: ({ getValue }) => {
        const active = getValue<boolean>();
        return (
          <span
            className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
              active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {active ? 'Sí' : 'No'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => handleEdit(row.original)}>
            Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(row.original.id)}>
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Productos</h2>
        <Button onClick={showForm ? handleCancel : handleNew}>
          {showForm ? 'Cancelar' : 'Nuevo producto'}
        </Button>
      </div>

      {showForm && (
        <ProductForm
          initialData={editingProduct ?? undefined}
          categories={categories}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}

      <TableWithFetch<Product>
        url={PRODUCTS_QUERY_KEY}
        columns={columns}
        params={{ limit: '50' }}
        emptyMessage="No hay productos"
      />
    </div>
  );
}

export default function ProductsIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProductsContent />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
cd apps/ui && pnpm test -- ProductsIsland
```

Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/components/dash/products/ProductsIsland.tsx apps/ui/src/components/dash/products/ProductsIsland.test.tsx
git commit -m "feat(ui): add ProductsIsland React island composing TableWithFetch and ProductForm"
```

---

## Task 6: Update `products.astro` and run full test suite

**Files:**
- Modify: `apps/ui/src/pages/dash/products.astro`

- [ ] **Step 1: Replace the page content**

Replace the entire file `apps/ui/src/pages/dash/products.astro` with:

```astro
---
export const prerender = true;
import DashboardLayout from '../../layouts/DashboardLayout.astro';
import ProductsIsland from '../../components/dash/products/ProductsIsland';
---

<DashboardLayout>
  <ProductsIsland client:load />
</DashboardLayout>
```

- [ ] **Step 2: Run full test suite**

```bash
cd apps/ui && pnpm test
```

Expected: All tests PASS (no regressions)

- [ ] **Step 3: Verify build compiles**

```bash
cd apps/ui && pnpm build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/pages/dash/products.astro
git commit -m "feat(ui): migrate products page to React island"
```

---

## Summary

After completing all tasks, the products module will have:

- **`src/lib/products-api.ts`** — typed API functions and query keys, easy to mock in tests
- **`ProductForm`** — reusable for create and edit, Zod-validated, handles image upload with drag-drop and URL fallback
- **`ProductsIsland`** — composes `TableWithFetch`, `Button`, and `ProductForm` using TanStack Query for data fetching and cache invalidation
- **`products.astro`** — 5 lines, delegates entirely to the island
