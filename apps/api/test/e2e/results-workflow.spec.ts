import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { accounts, testPassword } from './accounts.js';
const base = 'http://localhost:4001/api/v1';
async function token(request: APIRequestContext, username: string) {
  const response = await request.post(`${base}/auth/login`, {
    headers: { Origin: 'http://localhost:4173' },
    data: { identifier: username, password: testPassword },
  });
  expect(response.ok()).toBe(true);
  return z.object({ data: z.object({ accessToken: z.string() }) }).parse(await response.json()).data
    .accessToken;
}
const reportsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      overallAverage: z.string(),
      versionNumber: z.number(),
      studentId: z.string(),
    }),
  ),
});
test('teacher scores reach independently reviewed reports and audited correction revisions', async ({
  page,
  request,
}) => {
  await page.goto('/auth/login');
  await page.getByLabel('Username, email, or phone').fill(accounts.teacher);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.portal-main')).toBeVisible();
  await page.goto('/teacher/results');
  for (const label of ['Assigned subject and class', 'Term', 'Assessment scheme', 'Grading scheme'])
    await page.getByLabel(label, { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Create result batch' }).click();
  await expect(page).toHaveURL(/teacher\/results\/[a-f\d]{24}$/);
  const batchId = z.string().parse(page.url().split('/').at(-1));
  const cards = page.locator('.result-entry-card');
  await expect(cards.first()).toBeVisible();
  for (let index = 0; index < (await cards.count()); index++) {
    const card = cards.nth(index);
    await card.getByRole('spinbutton').fill('75');
    const saveButton = card.getByRole('button', { name: 'Save entry' });
    if (await saveButton.isVisible()) {
      await saveButton.click();
    }
    await expect(card.getByText(/75(\.00)?/)).toBeVisible();
    await expect(card.getByText('A', { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeEnabled();
  const studentToken = await token(request, accounts.student);
  const teacherToken = await token(request, accounts.teacher);
  const adminToken = await token(request, accounts.admin);
  const headers = { Authorization: `Bearer ${adminToken}` };
  expect(
    reportsSchema.parse(
      await (
        await request.get(`${base}/results/reports`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        })
      ).json(),
    ).data,
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText(/SUBMITTED/i)).toBeVisible();
  for (const action of ['start-review', 'approve', 'publish']) {
    const response = await request.post(`${base}/results/batches/${batchId}/${action}`, {
      headers,
      data: {},
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  const original = reportsSchema.parse(
    await (
      await request.get(`${base}/results/reports`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      })
    ).json(),
  ).data[0];
  expect(original).toMatchObject({
    overallAverage: '75.00',
    versionNumber: 1,
    studentId: 'ONYX/0001',
  });
  await page.reload();
  const studentCard = cards.filter({ hasText: 'ONYX/0001' });
  await studentCard.getByRole('spinbutton').fill('82');
  await studentCard
    .getByLabel('Published-result correction reason')
    .fill('Verified against the original marked examination paper.');
  await studentCard.getByRole('button', { name: 'Request correction' }).click();
  await expect(studentCard.getByText('Correction request submitted.')).toBeVisible();
  const corrections = z
    .object({ data: z.array(z.object({ id: z.string(), resultEntryId: z.string() })) })
    .parse(await (await request.get(`${base}/results/corrections`, { headers })).json());
  const correction = corrections.data[0];
  if (!correction || !original) throw new Error('Missing workflow fixture');
  const directEdit = await request.put(`${base}/results/entries/${correction.resultEntryId}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    data: { exempt: false, components: [{ key: 'exam', state: 'SCORED', score: '82' }] },
  });
  expect(directEdit.status()).toBe(409);
  for (const action of ['start-review', 'approve', 'apply']) {
    const response = await request.post(`${base}/results/corrections/${correction.id}/${action}`, {
      headers,
      data: {},
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  const updated = reportsSchema.parse(
    await (
      await request.get(`${base}/results/reports`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      })
    ).json(),
  ).data;
  expect(updated).toContainEqual(
    expect.objectContaining({ overallAverage: '82.00', versionNumber: 2 }),
  );
  const old = await request.get(`${base}/results/reports/${original.id}`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  expect(old.status()).toBe(404); // Superseded snapshots remain stored, but student links expose the current revision only.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Username, email, or phone').fill(accounts.student);
  await page.locator('input[name="password"]').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('link', { name: 'Open report card', exact: true }).click();
  await expect(
    page.locator('.report-card-average').getByText('82.00%', { exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await pendingDownload;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
});
