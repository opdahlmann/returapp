import { expect, test } from '@playwright/test';
import { API, apiToken, loginAs } from './helpers';

test('Superbruker: kategorier – flytt, endre og legg til', async ({ page, request }) => {
  await loginAs(page, 'demo@returapp.no', /^Superbruker/);
  await page.getByRole('navigation').getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('button', { name: /Kategorier/ }).click();
  await expect(page.getByText('Rekkefølgen her er rekkefølgen giver ser.')).toBeVisible();

  const firstUp = page.getByRole('button', { name: /^Flytt .* opp$/ }).first();
  await expect(firstUp).toHaveAttribute('aria-label', 'Flytt Paller opp');
  await page.getByRole('button', { name: 'Flytt Dører opp' }).click();
  await expect(firstUp).toHaveAttribute('aria-label', 'Flytt Dører opp');
  await page.getByRole('button', { name: 'Flytt Dører ned' }).click();
  await expect(firstUp).toHaveAttribute('aria-label', 'Flytt Paller opp');

  const name = 'E2E ' + Date.now();
  await page.getByRole('button', { name: 'Ny kategori' }).click();
  await page.getByLabel('Navn').fill(name);
  await page.getByRole('button', { name: 'Ikon leaf' }).click();
  await page.getByRole('button', { name: 'Legg til' }).click();
  await expect(page.getByRole('status')).toHaveText('Kategori lagt til');
  await expect(page.getByText(name)).toBeVisible();

  const token = await apiToken(request, 'demo@returapp.no');
  const cats = await (await request.get(`${API}/api/categories`)).json();
  const created = cats.find((c: { name: string }) => c.name === name);
  expect((await request.delete(`${API}/api/categories/${created.id}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(204);
});

test('Superbruker: postnummer-oversikt viser dekning', async ({ page }) => {
  await loginAs(page, 'demo@returapp.no', /^Superbruker/);
  await page.goto('/s/postnr');
  await expect(page.getByText('Kristiansand', { exact: true })).toBeVisible();
  await expect(page.getByText('Ombruksfabrikken AS').first()).toBeVisible();
  await page.getByLabel('Søk kommune').fill('Grim');
  await expect(page.getByText('Grimstad', { exact: true })).toBeVisible();
  await expect(page.getByText('Ingen dekning')).toBeVisible();
  await expect(page.getByText('0 firma')).toBeVisible();
});

test('Admin: slå kommune på og av endrer dekning for postnummer', async ({ page, request }) => {
  await loginAs(page, 'silje@ombruksfabrikken.no');
  await page.goto('/a/coverage');
  await expect(page.getByRole('button', { name: /Kristiansand .* Dekkes/ })).toBeVisible();
  const birkenes = page.getByRole('button', { name: /^Birkenes/ });
  await expect(birkenes).toContainText('Ikke dekket');
  try {
    await birkenes.click();
    await expect(birkenes).toContainText('Dekkes');
    await expect.poll(async () => (await (await request.get(`${API}/api/postnr/4760`)).json()).covered).toBe(true);
  } finally {
    if ((await birkenes.textContent())?.includes('Dekkes')) await birkenes.click();
    await expect(birkenes).toContainText('Ikke dekket');
  }
  await expect.poll(async () => (await (await request.get(`${API}/api/postnr/4760`)).json()).covered).toBe(false);
});
