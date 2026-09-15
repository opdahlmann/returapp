import { expect, test } from '@playwright/test';
import { cleanup, loginAs, testJpeg, testPhone } from './helpers';

test('Giver: meld henting med bilde → detalj → merkelapp → avbryt', async ({ page, request }) => {
  const created: string[] = [];
  try {
    await loginAs(page, 'jonas.hem@skanska.no');
    await expect(page.getByText('Hei, Jonas')).toBeVisible();
    await expect(page.getByText('Skanska – Tangen brygge · 4608')).toBeVisible();
    await expect(page.getByText('Pågående')).toBeVisible();
    await expect(page.getByText('24 vinduer, 3-lags glass')).toBeVisible();

    await page.getByRole('button', { name: 'Vinduer', exact: true }).click();
    await expect(page.getByText('Vinduer – vis oss')).toBeVisible();
    await expect(page.getByText('Steg 2 av 5')).toBeVisible();
    await page.locator('input[type=file][multiple]').setInputFiles({ name: 'vinduer.jpg', mimeType: 'image/jpeg', buffer: await testJpeg(page) });
    await expect(page.getByRole('img', { name: 'Bilde 1' })).toHaveCSS('opacity', '1');
    await page.getByLabel('Beskrivelse').fill('[e2e] Test fra Playwright');
    await page.getByRole('button', { name: 'Neste' }).click();

    await page.getByRole('button', { name: 'Neste' }).click();
    await expect(page.getByRole('status')).toHaveText('Oppgi antall / mengde');
    await page.getByLabel('Antall / mengde').fill('24');
    await page.getByRole('button', { name: 'Neste' }).click();

    await page.getByLabel('Adresse').fill('Tangen 8');
    await page.getByLabel('Postnr').fill('4608');
    await expect(page.getByText('Kristiansand', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Neste' }).click();

    await expect(page.getByText('Ser dette riktig ut?')).toBeVisible();
    await expect(page.getByText('24 stk · God')).toBeVisible();
    await page.getByRole('button', { name: 'Meld henting' }).click();
    await expect(page).toHaveURL(/\/p\/R-\d+$/);
    created.push(page.url().split('/').pop()!);
    await expect(page.getByRole('status')).toHaveText('Henting meldt – Ombruksfabrikken AS er varslet');
    await expect(page.getByText('Mottatt', { exact: true })).toHaveCount(2); // statuspille + tidslinje
    await expect(page.getByRole('button', { name: 'Vis bilde 1' }).getByRole('img')).toBeVisible();

    await page.getByRole('button', { name: 'Merkelapp' }).click();
    await expect(page.getByRole('img', { name: `QR-kode for ${created[0]}` }).locator('svg')).toBeVisible();
    await page.getByRole('button', { name: 'Tilbake' }).click();

    await page.getByRole('button', { name: 'Avbryt henting' }).click();
    await page.getByRole('button', { name: 'Ja, avbryt' }).click();
    await expect(page.getByRole('status')).toHaveText('Hentingen er avbrutt');
    await expect(page.getByText('Avbrutt av giver')).toBeVisible();
  } finally {
    await cleanup(request, { pickupIds: created });
  }
});

test('Gjest: postnummer uten dekning → varsle meg, og meld henting med navn og mobil', async ({ page, request }) => {
  const phone = testPhone();
  const created: string[] = [];
  try {
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('ra.postnr', '4878'));
    await page.getByRole('button', { name: 'Meld henting uten konto' }).click();
    await expect(page.getByText('Ingen henter i 4878 Grimstad ennå')).toBeVisible();
    await page.getByRole('button', { name: 'Varsle meg' }).click();
    await page.getByLabel('Mobilnummer').fill(phone);
    await page.getByRole('button', { name: 'Varsle meg' }).last().click();
    await expect(page.getByRole('status')).toHaveText('Du får beskjed når noen dekker 4878');

    await page.getByRole('button', { name: 'Trevirke', exact: true }).click();
    await page.getByLabel('Beskrivelse').fill('[e2e] Gjest');
    await page.getByRole('button', { name: 'Neste' }).click();
    await page.getByLabel('Antall / mengde').fill('8');
    await page.getByRole('button', { name: 'Neste' }).click();
    await page.getByLabel('Adresse').fill('Storgaten 44');
    await expect(page.getByText('Ingen hentefirma dekker 4878 ennå.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Neste' }).click();
    await expect(page.getByRole('status')).toHaveText('Skriv inn navn og mobilnummer');
    await page.getByLabel('Kontaktperson').fill('Per Test');
    await page.getByLabel('Mobil', { exact: true }).fill(phone);
    await page.getByRole('button', { name: 'Neste' }).click();
    await page.getByRole('button', { name: 'Meld henting' }).click();
    await expect(page).toHaveURL(/\/p\/R-\d+$/);
    created.push(page.url().split('/').pop()!);
    await expect(page.getByRole('status')).toHaveText('Registrert – vi varsler deg når noen dekker området');
    await expect(page.getByText('Privat – Per Test')).toBeVisible();
  } finally {
    await cleanup(request, { pickupIds: created, phones: [phone] });
  }
});

test('Giver: historikk og kvittering', async ({ page }) => {
  await loginAs(page, 'jonas.hem@skanska.no');
  await page.getByRole('navigation').getByRole('button', { name: 'Hentinger' }).click();
  await page.getByRole('tab', { name: 'Historikk' }).click();
  await expect(page.getByText('Eksporter historikk')).toBeVisible();
  await page.getByText('Glassvegger, 6 seksjoner').click();
  await page.getByRole('button', { name: 'Se kvittering' }).click();
  await expect(page.getByText('Hentet og bekreftet')).toBeVisible();
  await expect(page.getByText('6 seksjoner', { exact: true })).toBeVisible();
  const pdf = page.waitForResponse((r) => r.url().endsWith('/receipt.pdf'));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'PDF' }).click();
  expect((await pdf).headers()['content-type']).toBe('application/pdf');
  await (await popup).close();
});
