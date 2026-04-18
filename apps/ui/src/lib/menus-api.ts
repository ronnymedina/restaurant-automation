import { apiFetch } from './api';

export const MENUS_QUERY_KEY = '/v1/menus';

export interface Menu {
  id: string;
  name: string;
  active: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: string | null;
  itemsCount: number;
}

export interface MenuItem {
  id: string;
  productId: string;
  sectionName: string | null;
  order: number;
  product: { name: string; price: number; category?: { name: string } };
}

export interface MenuWithItems extends Menu {
  items: MenuItem[];
}

export interface MenuPayload {
  name: string;
  active?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek?: string | null;
}

export interface UpdateMenuItemPayload {
  sectionName?: string | null;
  order?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; totalPages: number; total: number; limit: number };
}

export async function fetchMenus(
  params: Record<string, string> = {},
): Promise<PaginatedResponse<Menu>> {
  const qs = new URLSearchParams({ limit: '50', ...params }).toString();
  const res = await apiFetch(`/v1/menus?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchMenuById(id: string): Promise<MenuWithItems> {
  const res = await apiFetch(`/v1/menus/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createMenu(payload: MenuPayload): Promise<Menu> {
  const res = await apiFetch('/v1/menus', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateMenu(id: string, payload: Partial<MenuPayload>): Promise<Menu> {
  const res = await apiFetch(`/v1/menus/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteMenu(id: string): Promise<void> {
  const res = await apiFetch(`/v1/menus/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function bulkCreateMenuItems(
  menuId: string,
  payload: { productIds: string[]; sectionName: string },
): Promise<{ created: number }> {
  const res = await apiFetch(`/v1/menus/${menuId}/items/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateMenuItem(
  menuId: string,
  itemId: string,
  payload: UpdateMenuItemPayload,
): Promise<MenuItem> {
  const res = await apiFetch(`/v1/menus/${menuId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteMenuItem(menuId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`/v1/menus/${menuId}/items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
