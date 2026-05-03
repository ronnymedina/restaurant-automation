import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: status 200': (r) => r.status === 200 });

  // Kiosk menus — public, unauthenticated
  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: status 200': (r) => r.status === 200 });

  // Products list — requires JWT
  const productsRes = http.get(`${BASE_URL}/v1/products`, authHeaders(data.token));
  check(productsRes, { 'products: status 200': (r) => r.status === 200 });

  sleep(1);
}
