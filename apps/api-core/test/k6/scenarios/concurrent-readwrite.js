import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG, KITCHEN_TOKEN, PRODUCT_IDS } from '../helpers/data.js';
import { getAuthToken, openCashRegister, authHeaders } from '../helpers/auth.js';

// Simula el momento más exigente de producción:
// - 20 VUs de kiosk escriben órdenes (INSERT en tabla Order)
// - 5 VUs del dashboard leen órdenes (SELECT sobre la misma tabla)
// - 3 VUs de cocina leen órdenes activas (SELECT filtrado)
// Todas concurrentes — mide contención de escritura vs. lectura en Postgres.
export const options = {
  scenarios: {
    kiosk_orders: {
      executor: 'constant-vus',
      exec: 'kioskOrder',
      vus: 20,
      duration: '4m',
      tags: { role: 'kiosk' },
    },
    dashboard_reads: {
      executor: 'constant-vus',
      exec: 'dashboardRead',
      vus: 5,
      duration: '4m',
      tags: { role: 'dashboard' },
    },
    kitchen_reads: {
      executor: 'constant-vus',
      exec: 'kitchenRead',
      vus: 3,
      duration: '4m',
      tags: { role: 'kitchen' },
    },
  },
  thresholds: {
    'http_req_failed':                    ['rate<0.02'],
    'http_req_duration{role:kiosk}':      ['p(95)<1200'],
    'http_req_duration{role:dashboard}':  ['p(95)<800'],
    'http_req_duration{role:kitchen}':    ['p(95)<800'],
  },
};

function randomItems(count) {
  const shuffled = [...PRODUCT_IDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((productId) => ({
    productId,
    quantity: Math.floor(Math.random() * 3) + 1,
  }));
}

export function setup() {
  const token = getAuthToken();
  openCashRegister(token);
  return { token };
}

// 20 VUs — cada uno simula un kiosk enviando una orden cada 1–3s
export function kioskOrder() {
  const res = http.post(
    `${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/orders`,
    JSON.stringify({ items: randomItems(Math.floor(Math.random() * 3) + 1) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'order created (201)': (r) => r.status === 201 });
  sleep(Math.random() * 2 + 1);
}

// 5 VUs — simula staff del dashboard revisando órdenes cada 2–5s
export function dashboardRead(data) {
  const res = http.get(`${BASE_URL}/v1/orders`, authHeaders(data.token));
  check(res, { 'dashboard orders (200)': (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);
}

// 3 VUs — simula la pantalla de cocina consultando órdenes activas cada 1–3s
export function kitchenRead() {
  const res = http.get(
    `${BASE_URL}/v1/kitchen/${KIOSK_SLUG}/orders?token=${KITCHEN_TOKEN}`,
  );
  check(res, { 'kitchen orders (200)': (r) => r.status === 200 });
  sleep(Math.random() * 2 + 1);
}
