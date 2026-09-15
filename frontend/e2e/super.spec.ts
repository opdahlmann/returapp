import { expect, test } from '@playwright/test';
import { API, apiToken, cleanup, guestToken, loginAs, testPhone } from './helpers';

test('Superbruker: godkjenn firma → dekning i postnummer-oversikt → ordre uten firma får firma', async ({ page, request }) => {
  const name = `E2E Hentefirma ${Date.now()}`;
  const apply = await request.post(`${API}/api/companies/apply`, { data: { name, orgnr: '999888777', city: 'Åseral', phone: '38000000', contactName: 'E2E Kontakt', email: `e2e-${Date.now()}@test.returapp.no`, kommuner: ['Åseral'] } });
  expect(apply.status()).toBe(201);
  const companyId = (await apply.json()).id;
  const pickupRes = await request.post(`${API}/api/pickups`, {
    headers: { Authorization: `Bearer ${await guestToken(request)}` },
    data: { categoryId: 'trevirke', desc: '[e2e] super', qty: 5, unit: 'stk', cond: 'God', dims: '', address: 'Kyrkjebygda 1', postnr: '4544', day: null, slot: null, unattended: true, contact: 'E2E Gjest', phone: testPhone(), photoIds: [] },
  });
  const pickup = await pickupRes.json();
  expect(pickup.companyId).toBeNull();
  try {
    await loginAs(page, 'demo@returapp.no', /^Superbruker/);
    await expect(page.getByText(/firma venter på godkjenning/)).toBeVisible();
    await page.getByText(/firma venter på godkjenning/).click();
    const card = page.locator('div', { has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Godkjenn' }) }).last();
    await card.getByRole('button', { name: 'Godkjenn' }).click();
    await expect(page.getByRole('status')).toHaveText('Firma godkjent – de kan nå motta oppdrag');

    await page.goto('/s/postnr');
    await page.getByLabel('Søk kommune').fill('Åseral');
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText('1 firma')).toBeVisible();

    await page.goto(`/p/${pickup.id}`);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText('Ikke tildelt firma')).toHaveCount(0);
  } finally {
    await cleanup(request, { pickupIds: [pickup.id], companyIds: [companyId] });
  }
});

test('Superbruker: brukerroller, og systemvarsel vises som banner hos giver', async ({ page, request }) => {
  const text = `[e2e] Planlagt vedlikehold ${Date.now()}`;
  try {
    await loginAs(page, 'demo@returapp.no', /^Superbruker/);
    await page.goto('/s/users');
    await page.getByLabel('Søk navn, e-post, firma').fill('Kari');
    await page.getByRole('button', { name: /Kari Aasen/ }).click();
    const giverSwitch = page.getByRole('dialog').getByRole('switch', { name: 'Byggeplass / giver' });
    await expect(giverSwitch).toHaveAttribute('aria-checked', 'false');
    await giverSwitch.click();
    await expect(giverSwitch).toHaveAttribute('aria-checked', 'true');
    await giverSwitch.click(); // tilbake til demo-oppsettet
    await expect(giverSwitch).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: 'Ferdig' }).click();

    await page.goto('/s/notice');
    await page.getByLabel('Melding').fill(text);
    await page.getByRole('button', { name: 'Send til alle' }).click();
    await expect(page.getByRole('status')).toHaveText('Varsel sendt til alle brukere');
    await expect(page.getByText(text)).toBeVisible();

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await loginAs(page, 'jonas.hem@skanska.no');
    await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
    await page.getByRole('button', { name: 'Lukk varsel' }).click();
    await expect(page.getByRole('alert').filter({ hasText: text })).toHaveCount(0);
  } finally {
    await cleanup(request, {});
    const token = await apiToken(request, 'demo@returapp.no');
    const kari = (await (await request.get(`${API}/api/users?q=kari@ombruksfabrikken.no`, { headers: { Authorization: `Bearer ${token}` } })).json())[0];
    expect(kari.roles.giver).toBe(false);
  }
});
