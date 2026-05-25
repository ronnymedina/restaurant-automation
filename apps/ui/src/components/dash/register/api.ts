import { apiFetch } from '../../../lib/api';

export const CASH_SHIFT_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type CashShiftStatus = (typeof CASH_SHIFT_STATUS)[keyof typeof CASH_SHIFT_STATUS];

export interface CashShiftDto {
  id: string;
  status: CashShiftStatus;
  displayOpenedAt: string;
  displayClosedAt: string | null;
  closedBy: string | null;
  openedByEmail: string | null;
  _count?: { orders: number };
  // removed: restaurantId, userId, lastOrderNumber, openingBalance,
  //          totalSales, totalOrders, openedAt, closedAt
}

// -- Shift summary (unified shape used by /close, /summary/:id and /stats) --

export interface ShiftCounts {
  total: number;
  pending: number;
  created: number;
  confirmed: number;
  processing: number;
  served: number;
  completed: number;
  cancelled: number;
}

export interface ShiftRevenue {
  completed: number;
  pending: number;
  averageTicket: number;
}

export interface PaymentBreakdownItem {
  method: string;
  count: number;
  total: number;
}

export interface OrderTypeBreakdownItem {
  type: string;
  count: number;
}

export interface OrderSourceBreakdownItem {
  source: string;
  count: number;
}

export interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

export interface ShiftSummary {
  counts: ShiftCounts;
  revenue: ShiftRevenue;
  byPaymentMethod: PaymentBreakdownItem[];
  byOrderType: OrderTypeBreakdownItem[];
  byOrderSource: OrderSourceBreakdownItem[];
  topProducts: TopProduct[];
}

export interface CloseSessionResult {
  session: CashShiftDto;
  summary: ShiftSummary;
}

export interface SessionDetail {
  session: CashShiftDto;
  summary: ShiftSummary;
}

export interface LiveStatsResult {
  summary: ShiftSummary;
}

export interface TopProductsResult {
  topProducts: TopProduct[];
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

export interface SessionHistoryMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getSessionHistory(
  page: number,
  limit = 10,
): Promise<ApiResult<{ data: CashShiftDto[]; meta: SessionHistoryMeta }>> {
  const res = await apiFetch(`/v1/cash-register/history?page=${page}&limit=${limit}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function getSessionDetail(sessionId: string): Promise<ApiResult<SessionDetail>> {
  const res = await apiFetch(`/v1/cash-register/summary/${sessionId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function getTopProducts(sessionId: string): Promise<ApiResult<TopProductsResult>> {
  const res = await apiFetch(`/v1/cash-register/top-products/${sessionId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}

export async function getLiveStats(): Promise<ApiResult<LiveStatsResult>> {
  const res = await apiFetch('/v1/cash-register/stats');
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    return { ok: false, error, httpStatus: res.status };
  }
  return { ok: true, data: await res.json() };
}
