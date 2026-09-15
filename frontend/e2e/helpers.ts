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

/** Rydder testdata via dev-endepunktet (kun ordre med beskrivelse "[e2e] …" og SMS-testbrukere). */
export async function cleanup(request: APIRequestContext, data: { pickupIds?: string[]; phones?: string[]; companyIds?: string[] }) {
  expect((await request.post(`${API}/api/dev/cleanup`, { data })).status()).toBe(200);
}

/** Genererer et ekte JPEG-bilde i nettleseren (canvas). */
export async function testJpeg(page: Page, w = 1200, h = 900): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.fillStyle = '#2E7A45';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#B7E39B';
    x.fillRect(w / 4, h / 4, w / 2, h / 2);
    return c.toDataURL('image/jpeg', 0.9);
  }, [w, h]);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function guestToken(request: APIRequestContext): Promise<string> {
  return (await (await request.post(`${API}/api/auth/guest`)).json()).accessToken;
}
