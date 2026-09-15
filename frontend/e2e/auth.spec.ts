import { expect, test } from '@playwright/test';
import { API, devCode, loginEmail, testPhone } from './helpers';

test('SMS-innlogging: kode → rett inn som giver (én rolle)', async ({ page, request }) => {
  const phone = testPhone();
  try {
    await page.goto('/login');
    await page.getByLabel('Mobilnummer').fill(phone);
    await page.getByRole('button', { name: 'Send meg kode på SMS' }).click();
    await expect(page.getByText('Skriv inn koden')).toBeVisible();
    await expect(page.getByText(`Vi sendte en 6-sifret kode til +47 ${phone}`)).toBeVisible();
    await page.getByLabel('Kode fra SMS').fill(await devCode(request, phone));
    await expect(page).toHaveURL(/\/g\/home$/);
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Hjem' })).toBeVisible();
  } finally {
    await request.delete(`${API}/api/dev/test-user?phone=${phone}`);
  }
});

test('Flere roller → "Hvem er du i dag?" → sjåfør-shell', async ({ page }) => {
  await loginEmail(page, 'ola@ombruksfabrikken.no');
  await expect(page.getByText('Hvem er du i dag?')).toBeVisible();
  await expect(page.getByText('Ola Berntsen · Ombruksfabrikken AS')).toHaveCount(2);
  await page.getByRole('button', { name: /Sjåfør/ }).click();
  await expect(page).toHaveURL(/\/d\/today$/);
  await expect(page.getByText('I dag', { exact: true }).first()).toBeVisible();
  for (const tab of ['I dag', 'Børs', 'Rute', 'Profil']) await expect(page.getByRole('navigation').getByRole('button', { name: tab })).toBeVisible();
});

test('Én rolle → rett til admin-innboks', async ({ page }) => {
  await loginEmail(page, 'silje@ombruksfabrikken.no');
  await expect(page).toHaveURL(/\/a\/inbox$/);
  await expect(page.getByText('Innboks', { exact: true }).first()).toBeVisible();
});

test('Feil passord gir toast', async ({ page }) => {
  await loginEmail(page, 'silje@ombruksfabrikken.no', 'feil-passord');
  await expect(page.getByRole('status')).toHaveText('Feil e-post eller passord');
});

test('Gjest kommer rett inn', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Meld henting uten konto' }).click();
  await expect(page).toHaveURL(/\/g\/home$/);
  await expect(page.getByText('Hei!')).toBeVisible();
});

test('Tema-bytte lagres på brukeren og overlever reload', async ({ page }) => {
  await loginEmail(page, 'kari@ombruksfabrikken.no');
  await page.getByRole('button', { name: 'Profil' }).first().click();
  await expect(page.getByText('Kari Aasen')).toBeVisible();
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await page.getByRole('switch', { name: /modus/ }).click();
  const after = before === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-theme', after);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', after);
  // Sett tilbake, så demo-brukeren ikke endres av testen.
  await page.getByRole('switch', { name: /modus/ }).click();
  await expect(html).toHaveAttribute('data-theme', before!);
});
