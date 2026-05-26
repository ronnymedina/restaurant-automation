// apps/ui/src/components/dash/orders/create-order-api.ts
import { apiFetch } from '../../../lib/api';

export interface ProductSearchResult {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  imageUrl: string | null;
  active: boolean;
}

interface ApiError { message?: string; code?: string; }
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; httpStatus: number };

export async function searchProducts(search: string, limit = 20): Promise<ApiResult<ProductSearchResult[]>> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  const res = await apiFetch(`/v1/products?${query}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  return { ok: true, data: data.data as ProductSearchResult[] };
}

export interface CreateStaffOrderPayload {
  items: { productId: string; quantity: number }[];
  orderType: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  deliveryReferences?: string;
}

export interface CreatedOrderResult {
  order: { id: string; orderNumber: number; status: string; orderSource: string };
}

export async function createStaffOrder(payload: CreateStaffOrderPayload): Promise<ApiResult<CreatedOrderResult>> {
  const res = await apiFetch('/v1/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
