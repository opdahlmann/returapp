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
