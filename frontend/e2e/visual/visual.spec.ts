import { Browser, expect, Page, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API, loginAs } from '../helpers';
import { compare, FRAME_MASKS, Rect } from './compare';
import { SCREENS, SCREENS_DIR, THEMES } from './screens';

// Appen mot prototypens referansebilder (docs/design/screens). Maks 1 % avvikende piksler utenom masker.
// Kjente avvik og hvorfor de maskeres: e2e/visual/ALLOWED_DIFFS.md
const MAX_DIFF = 0.01;

let cmp: Page;
const pages = new Map<string, Page>();

async function pageFor(browser: Browser, user: string | undefined, role: RegExp | undefined) {
  const key = user ?? 'anon';
  if (pages.has(key)) return pages.get(key)!;
  const page = await browser.newPage({ baseURL: test.info().project.use.baseURL, viewport: { width: 402, height: 874 }, locale: 'nb-NO', timezoneId: 'Europe/Oslo', serviceWorkers: 'block' });
  if (user) await loginAs(page, user, role);
  pages.set(key, page);
  return page;
}

test.beforeAll(async ({ browser, request }) => {
  expect((await request.post(`${API}/api/dev/reset-demo`)).status()).toBe(200);
  cmp = await browser.newPage();
});

test.afterAll(async () => {
  for (const p of pages.values()) await p.close();
  await cmp.close();
});

for (const s of SCREENS) {
  test(`visuell ${s.id}`, async ({ browser }) => {
    const page = await pageFor(browser, s.user, s.role);
    await page.goto(s.url);
    await page.waitForLoadState('networkidle');
    await s.app?.(page);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    // Som referansen: alltid øverst (klikk på knapper langt nede scroller innholdet).
    await page.evaluate(() => document.querySelectorAll('.ra-scroll').forEach((el) => (el.scrollTop = 0)));
    await page.waitForTimeout(400);

    const masks: Rect[] = [...FRAME_MASKS, ...(s.rects ?? [])];
    for (const loc of s.mask?.(page) ?? [])
      for (const el of await loc.all()) {
        const b = await el.boundingBox();
        if (b) masks.push({ x: b.x - 4, y: b.y - 3, width: b.width + 8, height: b.height + 6 });
      }

    const failures: string[] = [];
    for (const theme of THEMES) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const actual = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      const expected = readFileSync(join(SCREENS_DIR, `${s.id}-${theme}.png`));
      const r = await compare(cmp, expected, actual, masks);
      const name = `${s.id.replace('/', '-')}-${theme}`;
      if (r.ratio > MAX_DIFF) {
        for (const [kind, body] of [['expected', expected], ['actual', actual], ['diff', Buffer.from(r.png, 'base64')]] as const) {
          const path = test.info().outputPath(`${name}-${kind}.png`);
          writeFileSync(path, body);
          await test.info().attach(`${name}-${kind}.png`, { path, contentType: 'image/png' });
        }
        failures.push(`${theme}: ${(r.ratio * 100).toFixed(2)} % (${r.diff} px, ${r.size})`);
      }
      console.log(`${s.id} ${theme}: ${(r.ratio * 100).toFixed(2)} %`);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.unrouteAll();
    expect(failures, `${s.id} avviker fra designet`).toEqual([]);
  });
}
