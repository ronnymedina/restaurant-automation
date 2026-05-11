import { apiFetch } from '../../../lib/api';

export const CASH_SHIFT_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type CashShiftStatus = (typeof CASH_SHIFT_STATUS)[keyof typeof CASH_SHIFT_STATUS];

export interface CashShiftDto {
  id: string;
  restaurantId: string;
  userId: string;
  status: CashShiftStatus;
  lastOrderNumber: number;
  openingBalance: number;
  totalSales: number | null;
  totalOrders: number | null;
  closedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  _count?: { orders: number };
  user?: { id: string; email: string } | null;
}

export interface PaymentMethodInfo {
  count: number;
  total: number;
}

export interface CloseSummary {
  totalOrders: number;
  totalSales: number;
  paymentBreakdown: Record<string, PaymentMethodInfo>;
}

export interface CloseSessionResult {
  session: CashShiftDto;
  summary: CloseSummary;
}

interface ApiError {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; httpStatus: number };

export async function getCurrentSession(): Promise<ApiResult<CashShiftDto | null>> {
  const res = await apiFetch('/v1/cash-register/current');
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  if (!data || !('id' in data)) return { ok: true, data: null };
  return { ok: true, data: data as CashShiftDto };
}

export async function openSession(): Promise<ApiResult<CashShiftDto>> {
  const res = await apiFetch('/v1/cash-register/open', { method: 'POST' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  return { ok: true, data: data as CashShiftDto };
}

export async function closeSession(): Promise<ApiResult<CloseSessionResult>> {
  const res = await apiFetch('/v1/cash-register/close', { method: 'POST' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  const data = await res.json();
  return { ok: true, data: data as CloseSessionResult };
}
