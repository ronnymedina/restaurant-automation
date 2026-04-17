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
  isDefault: boolean;
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
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || 'Error al eliminar el producto');
  }
}

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/v1/uploads/image', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Error al subir la imagen');
  const { url } = await res.json();
  return url;
}
