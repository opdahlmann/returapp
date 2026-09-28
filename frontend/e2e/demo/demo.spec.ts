import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compare, FRAME_MASKS } from '../visual/compare';
import { openPrototype, SCREENS, SCREENS_DIR, THEMES } from '../visual/screens';

// Den utpakkede demoen (nettside/skript/demo-pakk-ut.mjs → docs/design/Returapp-demo.html) skal virke uten nett og se ut som
// prototypen den er laget av: rotskjermene sammenlignes med referansebildene i docs/design/screens (samme terskel som e2e/visual).
const DEMO = 'file://' + join(__dirname, '../../../docs/design/Returapp-demo.html');
const MAX_DIFF = 0.01;
const ROT = ['auth/login', 'auth/roles', 'giver/home', 'giver/list', 'giver/msgs', 'driver/today', 'driver/market', 'driver/route', 'admin/inbox', 'admin/routes', 'admin/company', 'super/dash', 'super/orders', 'super/admin'];

let cmp: Page;
test.beforeAll(async ({ browser }) => { cmp = await browser.newPage(); });
test.afterAll(async () => { await cmp.close(); });

test.beforeEach(async ({ page }) => {
  // Uten nett: alt som ikke er file:// avvises, og skal heller ikke forsøkes.
  await page.route(/^https?:/, (r) => r.abort());
});

for (const s of SCREENS.filter((x) => ROT.includes(x.id))) {
  test(`demo ${s.id}`, async ({ page }) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('file:')) requests.push(r.url()); });
    page.on('pageerror', (e) => errors.push(e.message));
    const p = await openPrototype(page, s.start, DEMO);
    await s.proto?.(p);
    await p.screen.evaluate((el) => el.querySelectorAll('div').forEach((d) => (d.scrollTop = 0)));
    const failures: string[] = [];
    for (const theme of THEMES) {
      await p.screen.evaluate((el, t) => el.setAttribute('data-theme', t), theme);
      const actual = await p.screen.screenshot({ animations: 'disabled', caret: 'hide' });
      const r = await compare(cmp, readFileSync(join(SCREENS_DIR, `${s.id}-${theme}.png`)), actual, FRAME_MASKS);
      if (r.ratio > MAX_DIFF) failures.push(`${theme}: ${(r.ratio * 100).toFixed(2)} %`);
    }
    expect(requests, 'demoen skal ikke hente noe utenfra').toEqual([]);
    expect(errors, 'ingen feil i konsollen').toEqual([]);
    expect(failures, `${s.id} avviker fra prototypen`).toEqual([]);
  });
}

test('demo: tema fra adressen og kode-skjermen', async ({ page }) => {
  await page.goto(DEMO + '?theme=dark');
  const screen = page.locator('[data-theme]').first();
  await expect(screen).toHaveAttribute('data-theme', 'dark');
  await screen.locator('input[placeholder="Mobilnummer"]').fill('95432100');
  await page.getByText('Send meg kode på SMS').click();
  await expect(screen.getByText('Demo: hvilken som helst kode fungerer')).toBeVisible();
});
