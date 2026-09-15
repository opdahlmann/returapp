import { APIRequestContext, expect, test } from '@playwright/test';
import { API, apiToken, cleanup, loginAs, testJpeg } from './helpers';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function pickup(request: APIRequestContext, qty: number, category: string) {
  const res = await request.post(`${API}/api/pickups`, {
    headers: { Authorization: `Bearer ${await apiToken(request, 'jonas.hem@skanska.no')}` },
    data: { categoryId: category, desc: '[e2e] sjåfør', qty, unit: 'stk', cond: 'God', dims: '', address: 'Tangen 8', postnr: '4608', day: null, slot: null, unattended: true, contact: 'Jonas Hem', phone: '91234567', photoIds: [] },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; title: string };
}

async function admin(request: APIRequestContext, path: string, data: object) {
  const res = await request.post(`${API}${path}`, { headers: { Authorization: `Bearer ${await apiToken(request, 'silje@ombruksfabrikken.no')}` }, data });
  expect(res.ok()).toBeTruthy();
}

test('Sjåfør: dagens stopp → start → bilde → juster mengde → bekreft → kvittering', async ({ page, request }) => {
  const p = await pickup(request, 24, 'kjokken');
  try {
    await admin(request, `/api/pickups/${p.id}/assign`, { driverId: 'u3', day: today(), slot: '09–12' });
    await loginAs(page, 'kari@ombruksfabrikken.no');
    await expect(page).toHaveURL(/\/d\/today$/);
    await expect(page.getByText('Dagens stopp')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(p.title) }).click();
    await page.getByRole('button', { name: 'Start henting' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${p.id}/complete$`));

    await page.getByRole('button', { name: 'Bekreft hentet' }).click();
    await expect(page.getByRole('status')).toHaveText('Ta minst ett bilde av det som hentes');
    await page.locator('input[type=file]').setInputFiles({ name: 'hentet.jpg', mimeType: 'image/jpeg', buffer: await testJpeg(page) });
    await expect(page.getByRole('img', { name: 'Bilde 1' })).toHaveCSS('opacity', '1');
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Færre' }).click();
    await expect(page.getByText('stk · meldt 24')).toBeVisible();
    await page.getByRole('button', { name: 'Bekreft hentet' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${p.id}/receipt$`));
    await expect(page.getByRole('status')).toHaveText('Henting bekreftet – kvittering sendt til giver');
    await expect(page.getByText('20 stk', { exact: true })).toBeVisible();
    await expect(page.getByText('1 bilder ved henting')).toBeVisible();
  } finally {
    await cleanup(request, { pickupIds: [p.id] });
  }
});

test('Sjåfør: ta oppdrag fra børsen, og meld avvik som admin ser', async ({ page, request }) => {
  const market = await pickup(request, 13, 'mobler');
  const dev = await pickup(request, 11, 'dorer');
  try {
    await admin(request, `/api/pickups/${market.id}/market`, { open: true });
    await admin(request, `/api/pickups/${dev.id}/assign`, { driverId: 'u3', day: today(), slot: '12–15' });

    await loginAs(page, 'kari@ombruksfabrikken.no');
    await page.getByRole('navigation').getByRole('button', { name: 'Børs' }).click();
    const card = page.locator('div', { has: page.getByText(market.title, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Ta oppdraget' }) }).last();
    await card.getByRole('button', { name: 'Ta oppdraget' }).click();
    await expect(page.getByText('Du tar oppdraget selv.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'I dag', exact: true }).click();
    await page.getByRole('button', { name: 'Bekreft – giver varsles' }).click();
    await expect(page.getByRole('status')).toContainText('Planlagt I dag 09–12 · Kari Aasen');
    await page.getByRole('navigation').getByRole('button', { name: 'I dag' }).click();
    await expect(page.getByText(market.title, { exact: true })).toBeVisible();

    await page.getByText(dev.title, { exact: true }).click();
    await page.getByRole('button', { name: 'Meld avvik' }).click();
    await page.getByRole('button', { name: 'Ikke funnet / ingen til stede' }).click();
    await page.getByLabel('Utdyp').fill('Porten var låst');
    await page.getByRole('button', { name: 'Send avvik' }).click();
    await expect(page.getByRole('status')).toHaveText('Avvik meldt – admin og giver er varslet');
    await expect(page).toHaveURL(/\/d\/today$/);

    await page.getByRole('navigation').getByRole('button', { name: 'Profil' }).click();
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await loginAs(page, 'silje@ombruksfabrikken.no');
    await page.getByRole('tab', { name: /^Avvik/ }).click();
    await expect(page.getByText('Ikke funnet / ingen til stede: Porten var låst')).toBeVisible();
  } finally {
    await cleanup(request, { pickupIds: [market.id, dev.id] });
  }
});
