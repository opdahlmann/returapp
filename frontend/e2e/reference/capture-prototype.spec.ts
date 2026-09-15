import { test } from '@playwright/test';
import { join } from 'node:path';
import { openPrototype, SCREENS, SCREENS_DIR, THEMES } from '../visual/screens';

// Referansebilder av prototypen (docs/design/Returapp-standalone.html), klippet til telefonskjermen (402×874).
// Kjør: CAPTURE=1 npx playwright test --project reference
test.use({ viewport: { width: 1000, height: 1100 } });

for (const s of SCREENS) {
  test(`referanse ${s.id}`, async ({ page }) => {
    const p = await openPrototype(page, s.start);
    await s.proto?.(p);
    // Prototypen beholder scroll-posisjonen fra forrige skjerm; appen starter alltid øverst.
    await p.screen.evaluate((el) => el.querySelectorAll('div').forEach((d) => (d.scrollTop = 0)));
    for (const theme of THEMES) {
      await p.screen.evaluate((el, t) => el.setAttribute('data-theme', t), theme);
      await p.screen.screenshot({ path: join(SCREENS_DIR, `${s.id}-${theme}.png`), animations: 'disabled', caret: 'hide' });
    }
  });
}
