import { expect, test, type Page } from '@playwright/test';

// docs/nettside-plan.md N8. Kjør: npx playwright test (bygg først). Mot image: E2E_BASE_URL=http://localhost:8082 npx playwright test
const SIDER = ['/', '/funksjoner', '/for/byggeplass', '/for/hentefirma', '/demo', '/personvern', '/kontakt'];
// Prototypens skjematiske kart har {{ routePoints }} i en <polyline> før runtime fyller den inn; nettleseren klager én gang per visning.
const KJENT = /polyline.*routePoints/;

function overvaak(page: Page, base: string) {
  const feil: string[] = [];
  const eksterne: string[] = [];
  page.on('pageerror', (e) => feil.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !KJENT.test(m.text())) feil.push(m.text()); });
  page.on('request', (r) => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(base)) eksterne.push(r.url()); });
  return { feil, eksterne };
}

for (const sti of SIDER) {
  for (const [w, h, tema] of [[390, 844, 'light'], [1440, 900, 'dark']] as const) {
    test(`${sti} laster ved ${w} px i ${tema}`, async ({ browser, baseURL }) => {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: tema });
      const { feil, eksterne } = overvaak(page, baseURL!);
      const res = await page.goto(sti);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      await page.waitForLoadState('networkidle');
      expect(feil).toEqual([]);
      expect(eksterne).toEqual([]);
      await page.close();
    });
  }
}

test('nav er én linje ved 1024 px og under 64 px høy', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
  await page.goto('/');
  const topp = await page.locator('header.topp').boundingBox();
  expect(topp!.height).toBeLessThanOrEqual(64);
  const lenker = await page.locator('header nav.desktop a').all();
  const ys = new Set(await Promise.all(lenker.map(async (l) => Math.round((await l.boundingBox())!.y))));
  expect(ys.size).toBe(1);
  await page.close();
});

test('hero: overskrift og knapper synlige uten rulling på mobil', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('/');
  const hero = page.locator('.hero');
  for (const el of [hero.locator('h1'), hero.getByRole('link', { name: 'Meld henting' }), hero.getByRole('link', { name: 'Prøv demoen' })]) {
    const b = (await el.boundingBox())!;
    expect(b.y + b.height, 'under folden').toBeLessThanOrEqual(844);
  }
  await page.close();
});

test('FAQ åpner og lukker', async ({ page }) => {
  await page.goto('/');
  const forste = page.locator('.faq details').first();
  await forste.locator('summary').click();
  await expect(forste).toHaveAttribute('open', '');
  await forste.locator('summary').click();
  await expect(forste).not.toHaveAttribute('open', '');
});

test('demoen åpner i egen fane og innloggingen virker', async ({ page, baseURL }) => {
  await page.goto('/demo');
  const lenke = page.getByRole('link', { name: 'Prøv demoen' }).first();
  await expect(lenke).toHaveAttribute('target', '_blank');
  await expect(lenke).toHaveAttribute('href', '/demo/app.html');
  const { feil, eksterne } = overvaak(page, baseURL!);
  await page.goto('/demo/app');
  await expect(page).toHaveTitle('Returapp · Demo');
  await page.locator('input[placeholder="Mobilnummer"]').fill('95432100');
  await page.getByText('Send meg kode på SMS').click();
  await page.locator('input[placeholder="••••••"]').fill('123456');
  await page.getByText('Bekreft').click();
  await page.getByText('Hvem er du i dag?').waitFor();
  await page.getByText('Byggeplass / giver').click();
  await page.getByText('Hei, Jonas').waitFor();
  expect(feil).toEqual([]);
  expect(eksterne).toEqual([]);
});

test('uten bevegelse: ingen transform på [data-reveal]', async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('/');
  const transforms = await page.locator('[data-reveal]').evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
  expect(transforms.every((t) => t === 'none')).toBe(true);
  await page.close();
});

test('tastaturet når alle lenker i nav med synlig fokus', async ({ page }) => {
  await page.goto('/');
  const antall = await page.locator('header nav.desktop a').count();
  await page.keyboard.press('Tab'); // hopp-lenke
  await page.keyboard.press('Tab'); // logo
  for (let i = 0; i < antall; i++) {
    await page.keyboard.press('Tab');
    const [tag, outline] = await page.evaluate(() => { const a = document.activeElement as HTMLElement; return [a.tagName, getComputedStyle(a).outlineStyle]; });
    expect(tag).toBe('A');
    expect(outline).not.toBe('none');
  }
});

test('404 gir egen side', async ({ page }) => {
  const res = await page.goto('/finnes-ikke');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Fant ikke siden');
});

test('mobilarket åpner, kan dras igjen med musen og lukkes med Escape', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('/');
  await page.click('.meny');
  const ark = page.locator('#ark');
  await expect(ark).toHaveAttribute('open', '');
  await expect(page.locator('.ark nav a').first()).toBeVisible();
  // Kast nedover: fingeren slipper med fart, arket lukker.
  const b = (await page.locator('.ark .hank').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width / 2, b.y + 2 + i * 40, { steps: 2 });
  await page.mouse.up();
  await expect(ark).not.toHaveAttribute('open', '');
  await page.click('.meny');
  await expect(ark).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(ark).not.toHaveAttribute('open', '');
  await page.close();
});

test('karusellen kan dras med musen og lander på et kort', async ({ page }) => {
  await page.goto('/');
  const spor = page.locator('.spor');
  await spor.scrollIntoViewIfNeeded();
  const b = (await spor.boundingBox())!;
  await page.mouse.move(b.x + b.width - 60, b.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width - 60 - i * 40, b.y + 100);
  await page.mouse.up();
  await expect(page.locator('.prikker button').nth(1)).toHaveAttribute('aria-selected', 'true');
  // Fjæren lander nøyaktig på kortets start (eller på enden av banen om kortet ikke kan rulles helt inn).
  await expect.poll(() => spor.evaluate((el) => Math.abs(el.scrollLeft - Math.min((el.children[1] as HTMLElement).offsetLeft - (el as HTMLElement).offsetLeft, el.scrollWidth - el.clientWidth)))).toBeLessThan(2);
  await page.getByRole('button', { name: 'Forrige' }).click();
  await expect(page.locator('.prikker button').first()).toHaveAttribute('aria-selected', 'true');
});

test('fanene på /funksjoner bytter panel med klikk og piltast', async ({ page }) => {
  await page.goto('/funksjoner');
  await page.getByRole('tab', { name: 'Sjåfør' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Sjåfør' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Byggeplass' })).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Superbruker' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Superbruker' })).toBeVisible();
});

test('lys/mørk-glideren klipper det mørke bildet', async ({ page }) => {
  await page.goto('/');
  const inn = page.locator('.lysmork input');
  await inn.fill('80');
  await expect(page.locator('.lysmork .moerk')).toHaveCSS('clip-path', 'inset(0px 0px 0px 80%)');
});
