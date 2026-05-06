import http from 'k6/http';
import { BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from './data.js';

export function getAuthToken() {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 201) {
    throw new Error(`Login failed — status ${res.status}. Run 'pnpm run cli create-dummy' first.`);
  }

  return res.json('accessToken');
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

// Opens the cash register for the authenticated user's restaurant.
// Accepts 201 (opened now) and 409 (already open) — safe to call before any test.
export function openCashRegister(token) {
  const res = http.post(
    `${BASE_URL}/v1/cash-register/open`,
    JSON.stringify({ openingBalance: 0 }),
    authHeaders(token),
  );

  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to open cash register — status ${res.status}: ${res.body}`);
  }
}
