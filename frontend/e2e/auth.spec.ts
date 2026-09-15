import { expect, test } from '@playwright/test';
import { cleanup, devCode, loginAs, loginEmail, mailLink, testPhone } from './helpers';

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
    await cleanup(request, { phones: [phone] });
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

test('Invitasjon på e-post → aktiver konto → glemt passord → nytt passord → logg inn', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@test.returapp.no`;
  try {
    await loginAs(page, 'demo@returapp.no', /^Superbruker/);
    await page.goto('/s/users');
    await page.getByRole('button', { name: 'Inviter bruker' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Navn').fill('E2E Invitert');
    await sheet.getByLabel('E-post eller mobilnummer').fill(email);
    await expect(sheet.getByRole('switch', { name: 'Byggeplass / giver' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('button', { name: 'Send invitasjon' }).click();
    await expect(page.getByRole('status')).toHaveText('Invitasjon sendt på e-post');
    const invite = await mailLink(request, email, 'invite');

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await page.goto(invite);
    await expect(page.getByLabel('Navn')).toHaveValue('E2E Invitert');
    await page.getByLabel('Velg passord').fill('e2epassord1');
    await page.getByRole('button', { name: 'Aktiver konto' }).click();
    await expect(page).toHaveURL(/\/g\/home$/);

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await page.getByRole('button', { name: 'E-post' }).click();
    await page.getByRole('button', { name: 'Glemt passord?' }).click();
    await page.getByRole('dialog').getByLabel('E-post').fill(email);
    await page.getByRole('button', { name: 'Send lenke' }).click();
    await expect(page.getByRole('status')).toHaveText('Lenke for nytt passord er sendt');
    await page.goto(await mailLink(request, email, 'reset'));
    await page.getByLabel('Nytt passord').fill('e2epassord2');
    await page.getByRole('button', { name: 'Lagre passord' }).click();
    await expect(page.getByRole('status')).toHaveText('Passordet er endret – logg inn');

    await loginEmail(page, email, 'e2epassord1');
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await loginEmail(page, email, 'e2epassord2');
    await expect(page).toHaveURL(/\/g\/home$/);
  } finally {
    await cleanup(request, { emails: [email] });
  }
});
