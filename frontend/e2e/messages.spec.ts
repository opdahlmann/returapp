import { expect, test } from '@playwright/test';
import { API, apiToken, cleanup, loginAs } from './helpers';

test('Meldinger: giver skriver → sjåfør ser og svarer → giver får varsel og badge', async ({ browser, page, request }) => {
  const giver = await apiToken(request, 'jonas.hem@skanska.no');
  const res = await request.post(`${API}/api/pickups`, {
    headers: { Authorization: `Bearer ${giver}` },
    data: { categoryId: 'dorer', desc: '[e2e] meldinger', qty: 7, unit: 'stk', cond: 'God', dims: '', address: 'Tangen 8', postnr: '4608', day: null, slot: null, unattended: true, contact: 'Jonas Hem', phone: '91234567', photoIds: [] },
  });
  const p = (await res.json()) as { id: string; title: string };
  const driverCtx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 402, height: 874 } });
  try {
    const admin = await apiToken(request, 'silje@ombruksfabrikken.no');
    expect((await request.post(`${API}/api/pickups/${p.id}/assign`, { headers: { Authorization: `Bearer ${admin}` }, data: { driverId: 'u3', day: null, slot: null } })).ok()).toBeTruthy();
    await request.post(`${API}/api/notifications/read`, { headers: { Authorization: `Bearer ${giver}` }, data: {} });

    await loginAs(page, 'jonas.hem@skanska.no');
    await page.goto(`/p/${p.id}`);
    await page.getByRole('button', { name: 'Melding til Kari Aasen' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${p.id}/thread$`));
    await expect(page.getByText('Kari Aasen', { exact: true })).toBeVisible();
    await expect(page.getByText('Ingen meldinger ennå.', { exact: false })).toBeVisible();
    await page.getByLabel('Skriv en melding').fill('Porten er åpen fra 07');
    await page.getByLabel('Skriv en melding').press('Enter');
    await expect(page.getByText('Porten er åpen fra 07')).toBeVisible();
    await expect(page.getByLabel('Skriv en melding')).toHaveValue('');

    const driver = await driverCtx.newPage();
    await loginAs(driver, 'kari@ombruksfabrikken.no');
    await driver.goto(`/p/${p.id}/thread`);
    await expect(driver.getByText('Jonas Hem', { exact: true })).toBeVisible();
    await expect(driver.getByText('Porten er åpen fra 07')).toBeVisible();
    await driver.getByLabel('Skriv en melding').fill('Supert, kommer 08');
    await driver.getByRole('button', { name: 'Send melding' }).click();

    // Giver ser svaret via polling (5 s), og får varsel + badge på Meldinger.
    await expect(page.getByText('Supert, kommer 08')).toBeVisible({ timeout: 10_000 });
    await page.goto('/g/home');
    await expect(page.getByRole('navigation').getByRole('button', { name: /^Meldinger \d+$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Varsler' }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await page.getByRole('button', { name: /Melding fra Kari Aasen/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/p/${p.id}/thread$`));
    await page.goto('/g/home');
    await expect(page.getByRole('button', { name: 'Varsler' }).locator('span')).toHaveCount(0);
  } finally {
    await driverCtx.close();
    await cleanup(request, { pickupIds: [p.id] });
  }
});
