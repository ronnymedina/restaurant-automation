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
