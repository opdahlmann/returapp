import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('Ark: fokus flyttes inn, Tab blir i arket, Escape lukker og gir fokus tilbake', async ({ page }) => {
  await loginAs(page, 'jonas.hem@skanska.no');
  await page.goto('/g/list');
  await page.getByRole('tab', { name: 'Historikk' }).click();
  const opener = page.getByRole('button', { name: /Eksporter historikk/ });
  await opener.focus(); // tastaturbruker (Safari gir ikke fokus til knapper ved klikk)
  await page.keyboard.press('Enter');
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

test('Offline: cachet liste vises og lagring gir toast', async ({ page, context, request, baseURL, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit kan ikke navigere offline via service worker');
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

test('nginx: sikkerhets- og cache-headere', async ({ request, baseURL }) => {
  test.skip(!process.env['E2E_BASE_URL'], 'Headerne settes av nginx (kjør mot container med E2E_BASE_URL)');
  const get = async (path: string) => (await request.get(`${baseURL}${path}`)).headers();
  const index = await (await request.get(`${baseURL}/`)).text();
  const js = index.match(/src="(main-[^"]+\.js)"/)![1];
  const expected: [string, string | undefined][] = [
    ['/', 'no-cache'],
    ['/p/R-2041', 'no-cache'],
    ['/ngsw-worker.js', 'no-cache'],
    [`/${js}`, 'public, max-age=31536000, immutable'],
    ['/icons/icon-192x192.png', undefined],
  ];
  for (const [path, cache] of expected) {
    const h = await get(path);
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['strict-transport-security'], path).toBe('max-age=31536000; includeSubDomains');
    expect(h['cache-control'], path).toBe(cache);
  }
  const api = await get('/api/postnr/4865');
  expect(api['cache-control'] ?? '').not.toContain('immutable');
  expect(api['cache-control'] ?? '').not.toContain('no-cache, ');
});
