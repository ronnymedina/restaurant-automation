import http from 'k6/http';
import { BASE_URL } from './data.js';
import { authHeaders } from './auth.js';

// Fetches all product IDs for the authenticated user's restaurant.
// Uses limit=200 to get the full catalog in one call — adjust if the catalog grows beyond that.
export function fetchAllProductIds(token) {
  const res = http.get(
    `${BASE_URL}/v1/products?limit=100`,
    authHeaders(token),
  );

  if (res.status !== 200) {
    throw new Error(`Failed to fetch products — status ${res.status}: ${res.body}`);
  }

  const ids = res.json('data').map((p) => p.id);

  if (ids.length === 0) {
    throw new Error("No products found. Run 'pnpm run cli create-dummy' to seed the database.");
  }

  return ids;
}

// Resets stock to a fixed value for every product in the list.
// Called in setup() so all VUs start from a known, consistent stock state.
export function resetStock(token, productIds, stock) {
  for (const id of productIds) {
    const res = http.patch(
      `${BASE_URL}/v1/products/${id}`,
      JSON.stringify({ stock }),
      authHeaders(token),
    );

    if (res.status !== 200) {
      throw new Error(`Failed to reset stock for product ${id} — status ${res.status}: ${res.body}`);
    }
  }
}
