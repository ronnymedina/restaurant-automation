/**
 * Playwright E2E: Admin verification flow (UI)
 *
 * Tests the full user-facing flow for sensitive user operations:
 *  - Creating a user shows a "check your email" banner (no instant creation)
 *  - Deleting a user shows a "check your email" banner (no instant deletion)
 *  - Changing a user's role shows a "check your email" banner
 *  - The /confirm-operation page shows success when the API confirms
 *  - The /confirm-operation page shows an error for invalid/expired tokens
 *
 * API calls are intercepted with context.route() so the real backend is not required.
 */

import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth';

const API = process.env.PUBLIC_API_URL || 'http://localhost:3000';

const MOCK_USERS = [
  { id: 'u1', email: 'manager@test.com', role: 'MANAGER', isActive: true },
  { id: 'u2', email: 'basic@test.com', role: 'BASIC', isActive: true },
];

// ── /dash/users — pending confirmation banners ────────────────────────────────

test.describe('/dash/users — pending confirmation banners', () => {
  test.beforeEach(async ({ context, page }) => {
    await authenticateAs(context);

    // Mock GET /v1/users
    await context.route(`${API}/v1/users*`, (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: MOCK_USERS,
            meta: { total: 2, page: 1, limit: 30, totalPages: 1 },
          }),
        });
      }
      return route.continue();
    });

    await page.goto('/dash/users');
    await page.waitForSelector('#usersTableBody tr');
  });

  test('shows pending banner after creating a user', async ({ context, page }) => {
    await context.route(`${API}/v1/users`, (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ pending: true, message: 'Revisa tu correo para confirmar la operación' }),
        });
      }
      return route.continue();
    });

    await page.click('#newUserBtn');
    await page.fill('#createEmail', 'newuser@test.com');
    await page.fill('#createPassword', 'Pass1234!');
    await page.selectOption('#createRole', 'BASIC');
    await page.click('#createFormEl button[type="submit"]');

    await expect(page.locator('#pendingBanner')).toBeVisible();
    await expect(page.locator('#pendingBanner')).toContainText('correo');
    await expect(page.locator('#createForm')).toBeHidden();
  });

  test('shows pending banner after deleting a user', async ({ context, page }) => {
    await context.route(`${API}/v1/users/u2`, (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pending: true, message: 'Revisa tu correo para confirmar la operación' }),
        });
      }
      return route.continue();
    });

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('[data-delete="u2"]').click();

    await expect(page.locator('#pendingBanner')).toBeVisible();
    await expect(page.locator('#pendingBanner')).toContainText('correo');
  });

  test('shows pending banner after changing a user role', async ({ context, page }) => {
    await context.route(`${API}/v1/users/u1`, (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ pending: true, message: 'Revisa tu correo para confirmar la operación' }),
        });
      }
      return route.continue();
    });

    await page.locator('[data-edit-id="u1"]').click();
    await page.selectOption('#userRole', 'BASIC');
    await page.click('#userFormEl button[type="submit"]');

    await expect(page.locator('#pendingBanner')).toBeVisible();
    await expect(page.locator('#pendingBanner')).toContainText('correo');
    await expect(page.locator('#userForm')).toBeHidden();
  });

  test('does NOT show pending banner for non-role patch (isActive toggle)', async ({ context, page }) => {
    await context.route(`${API}/v1/users/u1`, (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'u1', email: 'manager@test.com', role: 'MANAGER', isActive: false }),
        });
      }
      return route.continue();
    });

    await page.locator('[data-edit-id="u1"]').click();

    // Keep same role, only toggle isActive (hidden checkbox — force click)
    await page.selectOption('#userRole', 'MANAGER');
    await page.locator('#userIsActive').evaluate((el: HTMLInputElement) => {
      el.checked = !el.checked;
    });

    await page.click('#userFormEl button[type="submit"]');

    await expect(page.locator('#pendingBanner')).toBeHidden();
  });

  test('shows inline error when create fails with conflict', async ({ context, page }) => {
    await context.route(`${API}/v1/users`, (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'El email ya existe' }),
        });
      }
      return route.continue();
    });

    await page.click('#newUserBtn');
    await page.fill('#createEmail', 'existing@test.com');
    await page.fill('#createPassword', 'Pass1234!');
    await page.click('#createFormEl button[type="submit"]');

    await expect(page.locator('#createError')).toBeVisible();
    await expect(page.locator('#createError')).toContainText('ya existe');
  });
});

// ── /confirm-operation — confirmation landing page ────────────────────────────

test.describe('/confirm-operation — confirmation landing page', () => {
  test('shows success state when token is valid', async ({ context, page }) => {
    const token = 'valid-token-abc123';

    await context.route(`${API}/v1/users/confirm/${token}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Operación confirmada exitosamente' }),
      }),
    );

    await page.goto(`/confirm-operation?token=${token}`);

    await expect(page.locator('#successState')).toBeVisible();
    await expect(page.locator('#successMessage')).toContainText('confirmada');
    await expect(page.locator('#errorState')).toBeHidden();
  });

  test('shows error state when token is expired or invalid', async ({ context, page }) => {
    const token = 'expired-token-xyz';

    await context.route(`${API}/v1/users/confirm/${token}`, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'El token ha expirado' }),
      }),
    );

    await page.goto(`/confirm-operation?token=${token}`);

    await expect(page.locator('#errorState')).toBeVisible();
    await expect(page.locator('#errorMessage')).toContainText('expirado');
    await expect(page.locator('#successState')).toBeHidden();
  });

  test('shows error state when no token in URL', async ({ page }) => {
    await page.goto('/confirm-operation');

    await expect(page.locator('#errorState')).toBeVisible();
    await expect(page.locator('#successState')).toBeHidden();
  });

  test('has a link back to /dash/users after success', async ({ context, page }) => {
    const token = 'some-token';

    await context.route(`${API}/v1/users/confirm/${token}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK' }),
      }),
    );

    await page.goto(`/confirm-operation?token=${token}`);
    await expect(page.locator('#successState')).toBeVisible();
    await expect(page.locator('#successState a')).toHaveAttribute('href', '/dash/users');
  });
});
