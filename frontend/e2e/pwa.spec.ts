import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Ark: fokus flyttes inn, Tab blir i arket, Escape lukker og gir fokus tilbake', async ({ page }) => {
  await loginAs(page, 'jonas.hem@skanska.no');
  await page.goto('/g/list');
  await page.getByRole('tab', { name: 'Historikk' }).click();
  const opener = page.getByRole('button', { name: /Eksporter historikk/ });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Offline: cachet liste vises og lagring gir toast', async ({ page, context, request, baseURL }) => {
  const ngsw = await request.get(`${baseURL}/ngsw.json`);
  test.skip(!(ngsw.headers()['content-type'] ?? '').includes('json'), 'Service worker finnes bare i produksjonsbygget (kjør mot container med E2E_BASE_URL)');

  await loginAs(page, 'jonas.hem@skanska.no');
  await page.goto('/g/list');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // nå styrer service workeren siden og cacher API-svarene
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByText('24 vinduer, 3-lags glass')).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText('24 vinduer, 3-lags glass')).toBeVisible();
    await page.getByRole('link', { name: 'Profil' }).or(page.getByRole('button', { name: 'Profil' })).first().click();
    await page.getByRole('switch', { name: /^SMS/ }).click();
    await expect(page.getByRole('status')).toHaveText('Ingen nettverk – prøv igjen');
  } finally {
    await context.setOffline(false);
  }

  // Utlogging fjerner cachede API-svar, så neste bruker på enheten ikke ser dem offline.
  await page.getByRole('button', { name: 'Logg ut' }).click();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.includes(':data:')).length)).toBe(0);
});
