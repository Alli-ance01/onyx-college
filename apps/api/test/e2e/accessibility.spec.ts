import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { accounts, testPassword } from './accounts.js';
test('sign-in and student daily pages meet automated WCAG A/AA checks', async ({ page }) => {
  await page.goto('/auth/login');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel('Username, email, or phone').fill(accounts.student);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Amara Okafor' })).toBeVisible();
  for (const path of ['/student/dashboard', '/student/timetable', '/student/assignments']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.ui-skeleton')).toHaveCount(0);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await page.context().setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'You’re offline' })).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText('You’re offline.', { exact: false })).toHaveCount(0);
});
