import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, openCashRegister } from '../helpers/auth.js';
import { fetchAllProductIds, resetStock } from '../helpers/stock.js';

// Verifies order creation under concurrent load when stock is guaranteed to be sufficient.
//
// Stock is reset to 100 per product in setup() so no order should fail due to stock.
// The primary goal is validating the deadlock fix in decrementAllStock — orders processed
// by concurrent transactions over the same products must all succeed without 500 errors.
export const options = {
  stages: [
    { duration: '30s', target: 15 },
    { duration: '3m',  target: 30 },
    { duration: '2m',  target: 50 },
    { duration: '1m',  target: 0 },
  ],
  thresholds: {
    'checks{type:order_created}':          ['rate>0.99'],
    'http_req_duration{scenario:default}': ['p(95)<800'],
    http_req_failed:                       ['rate<0.01'],
  },
};

export function setup() {
  const token = getAuthToken();
  openCashRegister(token);
  const productIds = fetchAllProductIds(token);
  resetStock(token, productIds, 9999);
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
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, { 'order created (201)': (r) => r.status === 201 }, { type: 'order_created' });

  sleep(Math.random() * 2 + 1);
}
