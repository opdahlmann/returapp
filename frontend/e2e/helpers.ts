import { APIRequestContext, expect, Page } from '@playwright/test';

export const API = process.env['E2E_API_URL'] ?? 'http://localhost:5080';

/** Venter til siste SMS/e-post fra dev-endepunktet inneholder mønsteret, og returnerer treffet. */
async function devMatch(request: APIRequestContext, url: string, field: 'text' | 'body', re: RegExp): Promise<string> {
  let value = '';
  await expect
    .poll(async () => {
      const res = await request.get(url);
      value = res.ok() ? (await res.json())[field] : '';
      return re.test(value);
    })
    .toBe(true);
  return re.exec(value)![0];
}

/** Engangskoden fra siste SMS til nummeret (Console-SMS i dev). */
export const devCode = (request: APIRequestContext, phone: string) =>
  devMatch(request, `${API}/api/dev/last-sms?phone=${encodeURIComponent(phone)}`, 'text', /\d{6}/);

/** Lenke-stien (f.eks. /invite/abc) fra siste e-post til adressen (Console-mail i dev). */
export const mailLink = (request: APIRequestContext, to: string, path: 'invite' | 'reset') =>
  devMatch(request, `${API}/api/dev/last-mail?to=${encodeURIComponent(to)}`, 'body', new RegExp(`/${path}/[\\w-]+`));

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
export async function cleanup(request: APIRequestContext, data: { pickupIds?: string[]; phones?: string[]; companyIds?: string[]; emails?: string[] }) {
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
