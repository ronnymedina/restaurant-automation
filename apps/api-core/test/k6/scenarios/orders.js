import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG, PRODUCT_IDS } from '../helpers/data.js';
import { getAuthToken, openCashRegister } from '../helpers/auth.js';

// Simula múltiples kiosks enviando órdenes simultáneas.
// No requiere auth — POST /v1/kiosk/:slug/orders es público.
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // ramp: 10 kiosks enviando órdenes
    { duration: '3m',  target: 30 },  // pico sostenido: 30 clientes simultáneos
    { duration: '1m',  target: 50 },  // estrés: 50 concurrentes (escenario apertura)
    { duration: '1m',  target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed:                      ['rate<0.01'],      // < 1% errores
    'http_req_duration{scenario:orders}': ['p(95)<1000'],     // p95 < 1s
    'checks{type:order_created}':         ['rate>0.99'],      // > 99% órdenes creadas
  },
};

export function setup() {
  const token = getAuthToken();
  openCashRegister(token);
}

function randomItems(count) {
  const shuffled = [...PRODUCT_IDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((productId) => ({
    productId,
    quantity: Math.floor(Math.random() * 3) + 1,
  }));
}

export default function () {
  const payload = JSON.stringify({
    items: randomItems(Math.floor(Math.random() * 4) + 1), // 1–4 items por orden
  });

  const res = http.post(
    `${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/orders`,
    payload,
    { headers: { 'Content-Type': 'application/json' }, tags: { scenario: 'orders' } },
  );

  check(res, {
    'order created (201)': (r) => r.status === 201,
  }, { type: 'order_created' });

  sleep(Math.random() * 2 + 1); // 1–3s entre órdenes por VU (simula tiempo de selección)
}
