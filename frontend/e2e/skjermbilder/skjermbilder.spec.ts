import { expect, Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API, loginAs } from '../helpers';
import { SCREENS, THEMES } from '../visual/screens';

// Skjermbilder av den ekte appen til nettsiden (docs/nettside-plan.md N3). Gjenbruker skjermkatalogen fra de visuelle testene,
// setter demo-dataene tilbake først (stabile datoer og tall) og tar bildet i begge temaer ved 402×874 × 3 (1206×2622).
// Kjør: SKJERMBILDER=1 npx playwright test --project skjermbilder   (eller npm run skjermbilder i nettside/)
const UT = join(__dirname, '../../../nettside/src/assets/skjermbilder');
const UTVALG = ['giver/home', 'giver/new-2', 'giver/new-4', 'giver/detail', 'giver/receipt', 'giver/label', 'driver/today', 'driver/market', 'driver/complete', 'admin/inbox', 'admin/routes', 'admin/stats'];

const pages = new Map<string, Page>();

test.beforeAll(async ({ request }) => {
  expect((await request.post(`${API}/api/dev/reset-demo`)).status()).toBe(200);
  for (const theme of THEMES) mkdirSync(join(UT, theme), { recursive: true });
});
test.afterAll(async () => { for (const p of pages.values()) await p.close(); });

for (const id of UTVALG) {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`ukjent skjerm ${id}`);
  test(`skjermbilde ${id}`, async ({ browser }) => {
    const key = s.user ?? 'anon';
    if (!pages.has(key)) {
      const page = await browser.newPage({ baseURL: test.info().project.use.baseURL, viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, locale: 'nb-NO', timezoneId: 'Europe/Oslo' });
      if (s.user) await loginAs(page, s.user, s.role);
      pages.set(key, page);
    }
    const page = pages.get(key)!;
    await page.goto(s.url);
    await page.waitForLoadState('networkidle');
    await s.app?.(page);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.querySelectorAll('.ra-scroll').forEach((el) => (el.scrollTop = 0)));
    await page.waitForTimeout(400);
    for (const theme of THEMES) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      // PNG-hodet: bredde og høyde i byte 16–23. Feiler høyt hvis bildet ikke har riktig størrelse.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1206, 2622]);
      writeFileSync(join(UT, theme, `${id.replace('/', '-')}.png`), png);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  });
}
