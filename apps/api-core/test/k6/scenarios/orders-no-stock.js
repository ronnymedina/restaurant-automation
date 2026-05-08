import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, openCashRegister } from '../helpers/auth.js';
import { fetchAllProductIds, resetStock } from '../helpers/stock.js';

// Verifies the API handles out-of-stock orders gracefully under concurrent load.
//
// All products are set to stock=0 in setup(). Every order attempt should return
// 409 STOCK_INSUFFICIENT. The goal is confirming:
//   1. Rejections are fast — no lock waits or DB contention on 0-stock paths
//   2. The server does not crash or degrade under a sustained stream of invalid orders
//   3. No request returns 500 — all failures are clean business-logic rejections
//
// 409 is marked as an expected status so k6 does not count it as http_req_failed.
// Latency is measured only on kiosk order requests (tagged role:kiosk) to exclude
// setup() calls (login, PATCH stock resets) from the threshold.
export const options = {
  stages: [
    { duration: '20s', target: 20 },
    { duration: '2m',  target: 40 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'checks{type:stock_rejected}':      ['rate>0.99'],
    'http_req_duration{role:kiosk}':    ['p(95)<300'],
  },
};

export function setup() {
  const token = getAuthToken();
  openCashRegister(token);
  const productIds = fetchAllProductIds(token);
  resetStock(token, productIds, 0);
  return { productIds };
}

function randomItems(productIds) {
  const count = Math.floor(Math.random() * 4) + 1;
  const shuffled = [...productIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((productId) => ({
    productId,
    quantity: 1,
  }));
}

export default function (data) {
  const payload = JSON.stringify({ items: randomItems(data.productIds) });

  const res = http.post(
    `${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/orders`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { role: 'kiosk' },
      // Mark 409 as expected so k6 does not count it as http_req_failed
      responseCallback: http.expectedStatuses(409),
    },
  );

  check(
    res,
    { 'rejected: no stock (409)': (r) => r.status === 409 },
    { type: 'stock_rejected' },
  );

  sleep(Math.random() + 0.5);
}
