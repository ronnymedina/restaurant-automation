import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(99)<2000'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: 200': (r) => r.status === 200 });

  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: 200': (r) => r.status === 200 });

  const productsRes = http.get(`${BASE_URL}/v1/products`, authHeaders(data.token));
  check(productsRes, { 'products: 200': (r) => r.status === 200 });

  sleep(0.5);
}
