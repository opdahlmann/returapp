import { APIRequestContext, expect, test } from '@playwright/test';
import { API, apiToken, cleanup, loginAs } from './helpers';

async function createPickup(request: APIRequestContext, qty: number, category = 'isolasjon') {
  const token = await apiToken(request, 'jonas.hem@skanska.no');
  const res = await request.post(`${API}/api/pickups`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { categoryId: category, desc: '[e2e] admin', qty, unit: 'stk', cond: 'God', dims: '', address: 'Tangen 8', postnr: '4608', day: null, slot: null, unattended: false, contact: 'Jonas Hem', phone: '91234567', photoIds: [] },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; title: string };
}

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Admin: ny ordre → tildel sjåfør i morgen 09–12 → ruteplan → flytt → send', async ({ page, request }) => {
  const a = await createPickup(request, 17);
  const b = await createPickup(request, 19);
  try {
    await loginAs(page, 'silje@ombruksfabrikken.no');
    await expect(page.getByText(/\d+ nye henteordre/)).toBeVisible();
    for (const p of [a, b]) {
      const card = page.locator('div', { has: page.getByText(p.title, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Annen' }) }).last();
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: /^Tildel / }).click();
      await expect(page.getByText('Tildel og planlegg')).toBeVisible();
      await page.getByRole('button', { name: /^KA Kari Aasen/ }).click();
      await page.getByRole('button', { name: 'I morgen', exact: true }).click();
      await page.getByRole('button', { name: '09–12', exact: true }).click();
      await page.getByRole('button', { name: 'Bekreft – giver varsles' }).click();
      await expect(page.getByRole('status')).toHaveText('Planlagt I morgen 09–12 · Kari Aasen');
    }
    await page.getByRole('tab', { name: /^Planlagt/ }).click();
    await expect(page.getByText(a.title, { exact: true })).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: 'Ruter' }).click();
    await page.getByRole('button', { name: 'Kari Aasen', exact: true }).click();
    await page.getByLabel('Velg dato').fill(tomorrow());
    const up = page.getByRole('button', { name: /^Flytt .* opp$/ });
    await expect(page.getByText(`${a.title}`, { exact: true })).toBeVisible();
    const before = await up.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    await page.getByRole('button', { name: `Flytt ${b.title} opp` }).click();
    await expect.poll(async () => (await up.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join()).not.toBe(before.join());
    await page.getByRole('button', { name: /Send (oppdatert )?rute/ }).click();
    await expect(page.getByRole('status')).toHaveText('Rute sendt til Kari – sjåføren får varsel');
  } finally {
    await cleanup(request, { pickupIds: [a.id, b.id] });
  }
});

test('Admin: børs av/på fra detalj, firma, sjåfører, avdeling og statistikk', async ({ page, request }) => {
  const p = await createPickup(request, 23, 'metall');
  try {
    await loginAs(page, 'silje@ombruksfabrikken.no');
    await page.goto(`/p/${p.id}`);
    await expect(page.getByText(/^Forslag:/)).toBeVisible();
    await page.getByRole('button', { name: 'Legg på børs' }).click();
    await expect(page.getByRole('status')).toHaveText('Lagt på oppdragsbørsen');
    await page.getByRole('button', { name: 'Fjern fra børs' }).click();
    await expect(page.getByRole('status')).toHaveText('Fjernet fra børsen');

    await page.goto('/a/company');
    await expect(page.getByText('hentinger denne uka')).toBeVisible();
    await expect(page.getByText(/Org\.nr 923 456 789 · Vennesla/)).toBeVisible();
    await page.getByRole('button', { name: /Sjåfører/ }).click();
    await expect(page.getByText('Kari Aasen')).toBeVisible();
    await expect(page.getByText(/planlagt · \d+ hentet/).first()).toBeVisible();

    await page.goto('/a/depts');
    await page.getByRole('button', { name: 'Legg til avdeling' }).click();
    await page.getByLabel('Navn').fill('E2E-lager');
    await page.getByLabel('Adresse').fill('Testveien 1, 4700 Vennesla');
    await page.getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByRole('status')).toHaveText('Avdeling lagt til');
    await page.getByRole('button', { name: /E2E-lager/ }).click();
    await page.getByRole('button', { name: 'Slett avdeling' }).click();
    await expect(page.getByRole('status')).toHaveText('Avdeling slettet');
    await expect(page.getByText('E2E-lager')).toHaveCount(0);

    await page.goto('/a/stats');
    await expect(page.getByText(/hentinger i \p{L}+/u)).toBeVisible();
    await expect(page.getByText('Per kategori (kg)')).toBeVisible();
  } finally {
    await cleanup(request, { pickupIds: [p.id] });
  }
});
