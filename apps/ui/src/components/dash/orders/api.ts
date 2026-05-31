import { apiFetch } from '../../../lib/api';

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  product?: { name: string };
}

export interface Order {
  id: string;
  orderNumber: number;
  cashShiftId?: string;
  status: string;
  totalAmount: number;
  isPaid: boolean;
  paymentMethod?: string;
  cancellationReason?: string;
  orderSource: string;
  orderType: string;
  createdAt?: string;
  displayTime?: string;
  customerEmail?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReferences?: string;
  items: OrderItem[];
}

export interface CurrentSession {
  id: string;
  openedByEmail: string | null;
}

interface ApiError {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; httpStatus: number };

export async function getCurrentSession(): Promise<ApiResult<CurrentSession | null>> {
  const res = await apiFetch('/v1/cash-register/current');
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  // Backend returns `null` (no open session) or a `CurrentSession`. NestJS
  // sends an empty body for `null` returns, so we tolerate JSON parse
  // failure as the "no session" case (H-27).
  const data = await res.json().catch(() => null);
  if (!data) return { ok: true, data: null };
  return { ok: true, data: data as CurrentSession };
}

export async function getOrders(params: {
  orderNumber?: number;
  statuses?: string[];
  limit?: number;
}): Promise<ApiResult<Order[]>> {
  const query = new URLSearchParams();
  if (params.orderNumber !== undefined) query.set('orderNumber', String(params.orderNumber));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.statuses?.length) {
    for (const s of params.statuses) {
      query.append('statuses', s);
    }
  }
  const res = await apiFetch(`/v1/orders?${query}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function updateOrderStatus(id: string, status: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function markOrderPaid(id: string, paymentMethod: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ paymentMethod }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function cancelOrder(id: string, reason: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function confirmOrder(id: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/confirm`, { method: 'PATCH' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function unmarkOrderPaid(id: string): Promise<ApiResult<Order>> {
  const res = await apiFetch(`/v1/orders/${id}/unpay`, { method: 'PATCH' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
