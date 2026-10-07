import { expect, test } from '@playwright/test';
import { accounts, testPassword } from './accounts.js';

test('passport upload handles storage errors, refreshes expired authentication, and preserves unsaved fields', async ({
  page,
}) => {
  const uncaught: string[] = [];
  page.on('pageerror', (error) => {
    uncaught.push(error.message);
  });
  await page.goto('/auth/login');
  await page.getByLabel('Username, email, or phone').fill(accounts.uploader);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Complete your Onyx College registration' }),
  ).toBeVisible();
  await page.getByLabel('Surname', { exact: true }).fill('Unsaved surname');
  await page
    .getByRole('navigation', { name: 'Registration sections' })
    .getByRole('button', { name: /Documents/u })
    .click();
  const input = page.locator('input[type="file"]');
  const file = {
    name: 'passport.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1kAAAAASUVORK5CYII=',
      'base64',
    ),
  };
  const endpoint = '**/api/v1/student-documents/*/content';
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'DOCUMENT_STORAGE_UNAVAILABLE',
          message: 'Document storage is temporarily unavailable.',
          requestId: 'upload-reference',
        },
      }),
    }),
  );
  await input.setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText(
    'Document storage is temporarily unavailable.',
  );
  await expect(page.getByRole('alert')).toContainText('upload-reference');
  await expect(input).toBeEnabled();
  await page.unroute(endpoint);
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests += 1;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in', requestId: 'expired-upload' },
      }),
    });
  });
  await input.setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText(
    'Your session was refreshed. Please try the upload again.',
  );
  expect(requests).toBe(1);
  await page.unroute(endpoint);
  await input.setInputFiles(file);
  await expect(page.getByText('passport.png', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Registration sections' })
    .getByRole('button', { name: /Personal Information/u })
    .click();
  await expect(page.getByLabel('Surname', { exact: true })).toHaveValue('Unsaved surname');
  expect(uncaught).toEqual([]);
});
