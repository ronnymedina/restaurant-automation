import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, KIOSK_SLUG } from '../helpers/data.js';
import { getAuthToken, authHeaders } from '../helpers/auth.js';

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // warm up
    { duration: '10s', target: 80 },  // sudden spike
    { duration: '1m',  target: 80 },  // hold spike
    { duration: '30s', target: 5 },   // recovery ramp down
    { duration: '30s', target: 5 },   // verify stable after spike
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

export function setup() {
  return { token: getAuthToken() };
}

export default function (data) {
  // Focus on the highest-traffic public endpoint: kiosk menus
  const menusRes = http.get(`${BASE_URL}/v1/kiosk/${KIOSK_SLUG}/menus`);
  check(menusRes, { 'kiosk menus: 200': (r) => r.status === 200 });

  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: 200': (r) => r.status === 200 });

  sleep(0.3);
}
