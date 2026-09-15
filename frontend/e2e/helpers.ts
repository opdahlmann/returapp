import { APIRequestContext, expect, Page } from '@playwright/test';

export const API = process.env['E2E_API_URL'] ?? 'http://localhost:5080';

export async function devCode(request: APIRequestContext, phone: string): Promise<string> {
  await expect.poll(async () => (await request.get(`${API}/api/dev/last-sms?phone=${encodeURIComponent(phone)}`)).status()).toBe(200);
  const { text } = await (await request.get(`${API}/api/dev/last-sms?phone=${encodeURIComponent(phone)}`)).json();
  return /\d{6}/.exec(text)![0];
}

export async function loginEmail(page: Page, email: string, password = 'demo1234') {
  await page.goto('/login');
  await page.getByRole('button', { name: 'E-post' }).click();
  await page.getByLabel('E-post').fill(email);
  await page.getByLabel('Passord').fill(password);
  await page.getByRole('button', { name: 'Logg inn' }).click();
}

/** Unikt testnummer (8 siffer, starter på 4) – brukeren slettes etter testen. */
export function testPhone() {
  return '4' + String(Math.floor(1_000_000 + Math.random() * 8_999_999));
}

export async function apiToken(request: APIRequestContext, email: string, password = 'demo1234'): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  return (await res.json()).accessToken;
}

/** Logger inn via e-post og velger rolle hvis brukeren har flere. */
export async function loginAs(page: Page, email: string, role?: RegExp) {
  await loginEmail(page, email);
  await expect(page).not.toHaveURL(/\/login/);
  if (role) {
    await expect(page.getByText('Hvem er du i dag?')).toBeVisible();
    await page.getByRole('button', { name: role }).click();
    await expect(page).not.toHaveURL(/\/roles/);
  }
}
