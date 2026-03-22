import { BrowserContext, Page } from '@playwright/test';

const API = process.env.PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Injects fake tokens into localStorage AND mocks /v1/auth/me.
 * Uses addInitScript so tokens are present before ANY page script runs,
 * preventing ProtectedLayout from redirecting to /login.
 */
export async function authenticateAs(
  context: BrowserContext,
  user: {
    id?: string;
    email?: string;
    role?: string;
    restaurantSlug?: string;
  } = {},
) {
  const {
    id = 'admin-1',
    email = 'admin@test.com',
    role = 'ADMIN',
    restaurantSlug = 'test-restaurant',
  } = user;

  // Set tokens before page scripts run
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'fake-jwt-token');
    localStorage.setItem('refreshToken', 'fake-refresh-token');
  });

  // Mock /v1/auth/me so ProtectedLayout and loadKioskLink don't fail
  await context.route(`${API}/v1/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        email,
        role,
        restaurant: { id: 'r1', slug: restaurantSlug },
      }),
    }),
  );

  // Mock token refresh so 401 auto-refresh doesn't redirect
  await context.route(`${API}/v1/auth/refresh`, (route) =>
    route.fulfill({ status: 401, body: '{}' }),
  );
}
