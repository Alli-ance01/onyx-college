import { expect, test, type Page } from '@playwright/test';

import { accounts, testPassword } from './accounts.js';

async function signIn(page: Page, username: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Username, email, or phone').fill(username);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.portal-main')).toBeVisible();
}

test('sign-in controls remain usable on phones and desktops', async ({ page }, testInfo) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Sign in to Onyx.' })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: testInfo.outputPath(`sign-in-${String(width)}.png`),
        fullPage: true,
      });
  }
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Username, email, or phone')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByText('Enter your password.', { exact: true })).toBeVisible();
});

test('admin creates a session with three terms and duplicate errors preserve the input', async ({
  page,
}) => {
  await signIn(page, accounts.admin);
  await page.getByRole('navigation').getByRole('link', { name: 'Sessions', exact: true }).click();
  const label = page.getByLabel('Session label', { exact: true });
  await label.fill('2027/2028');
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Session 2027/2028 created with three terms.' }),
  ).toBeVisible();
  await expect(label).toHaveValue('');
  await expect(page.getByRole('heading', { name: '2027/2028', exact: true })).toBeVisible();
  await expect(page.locator('.term-row')).toHaveCount(6);
  await label.fill('2027/2028');
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('This academic session already exists.');
  await expect(label).toHaveValue('2027/2028');
});

test('sign out reports network failures and supports retry before returning to sign in', async ({
  page,
}) => {
  await signIn(page, accounts.student);
  const endpoint = '**/api/v1/auth/logout';
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Try again' } }),
    }),
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not sign out');
  await expect(page).toHaveURL(/\/student\/dashboard$/u);
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Onyx.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to Onyx.' })).toBeVisible();
});

for (const role of ['admin', 'student'] as const) {
  test(`${role} sign-in and responsive navigation`, async ({ page }) => {
    await signIn(page, accounts[role]);
    await expect(page).toHaveURL(role === 'admin' ? /\/admin$/u : /\/student\/dashboard$/u);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('main h1')).toBeVisible();
      const main = await page.locator('.portal-main').boundingBox();
      expect(main?.y).toBe(0);
      if (width <= 1120) expect(main?.x).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    const open = page.getByRole('button', { name: 'Open navigation' });
    await open.click();
    const menu = page.getByRole('dialog');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Close navigation' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(open).toBeFocused();
    await open.click();
    await menu
      .getByRole('link', { name: role === 'admin' ? 'All students' : 'Profile', exact: true })
      .click();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('main h1')).toHaveText(
      role === 'admin' ? 'Student directory' : 'Amara Okafor',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
}

test('admin directory views apply their named lifecycle filter', async ({ page }) => {
  await signIn(page, accounts.admin);
  await page.getByRole('link', { name: 'All students', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Amara Okafor', exact: true })).toBeVisible();
  for (const label of ['Graduated', 'Archived']) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `${label} students`, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('No students match this view')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Amara Okafor', exact: true })).toHaveCount(0);
  }
});

test('student sections load without failed API requests or runtime errors', async ({ page }) => {
  await signIn(page, accounts.student);
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/api/v1/') && response.status() >= 400)
      failures.push(`${String(response.status())} ${new URL(response.url()).pathname}`);
  });
  const destinations = [
    ['Assignments', 'Assignments'],
    ['Announcements', 'Announcements'],
    ['Results', 'Results and report cards'],
    ['Subjects', 'My subjects'],
    ['Academic history', 'Academic history'],
    ['Documents', 'Documents'],
    ['Profile', 'Amara Okafor'],
    ['Notifications', 'Notifications'],
    ['Settings', 'Settings'],
  ] as const;
  for (const [link, heading] of destinations) {
    await page.getByRole('navigation').getByRole('link', { name: link, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(heading);
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});

test('student dashboard recovers after a failed request', async ({ page }) => {
  const endpoint = '**/api/v1/students/me/dashboard';
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Please try again.' } }),
    }),
  );
  await signIn(page, accounts.student);
  await expect(page.getByRole('heading', { name: 'Dashboard unavailable' })).toBeVisible({
    timeout: 15000,
  });
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Welcome, Amara Okafor');
});

test('administrator approves a registration and the applicant enters the student portal', async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.admin);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Registration review', exact: true })
    .click();
  await page.getByRole('link', { name: 'Open review' }).click();
  await expect(page.locator('main h1')).toHaveText('David Adeyemi');
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText(/VERIFIED/u)).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Class level', exact: true })
    .selectOption({ label: 'JSS1' });
  await page.getByRole('button', { name: 'Approve and create student', exact: true }).click();
  await expect(page.locator('main .status-badge').filter({ hasText: /^APPROVED$/u })).toBeVisible();
  const studentContext = await browser.newContext();
  try {
    const studentPage = await studentContext.newPage();
    await signIn(studentPage, accounts.applicant);
    await expect(studentPage).toHaveURL(/\/student\/dashboard$/u);
    await expect(studentPage.locator('main h1')).toHaveText('Welcome, David Adeyemi');
    await expect(studentPage.getByText('ONYX/0002', { exact: true })).toBeVisible();
  } finally {
    await studentContext.close();
  }
});

test('a failed student directory load offers a retry and recovers', async ({ page }) => {
  await signIn(page, accounts.admin);
  const endpoint = '**/api/v1/students?*';
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Please try again.' } }),
    }),
  );
  await page.getByRole('link', { name: 'All students', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('No students match this view')).toHaveCount(0);
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Amara Okafor', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
