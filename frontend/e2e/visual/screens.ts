import { Locator, Page } from '@playwright/test';
import { join } from 'node:path';

/** Skjermkatalog brukt både til å ta referansebilder av prototypen og til å sammenligne appen mot dem. */

export const PROTOTYPE = 'file://' + join(__dirname, '../../../docs/design/Returapp-standalone.html');
export const SCREENS_DIR = join(__dirname, '../../../docs/design/screens');
export const THEMES = ['light', 'dark'] as const;

export interface Proto {
  page: Page;
  screen: Locator;
  /** Klikker første element med nøyaktig denne teksten inne i telefonskjermen. */
  click(text: string): Promise<void>;
  tab(name: string): Promise<void>;
  sel(selector: string): Promise<void>;
}

export interface ScreenDef {
  id: string;
  /** Hvor i prototypen stegene starter: innlogging, rollevalg eller inne i en rolle (rollens etikett). */
  start: 'login' | 'roles' | 'Byggeplass / giver' | 'Sjåfør' | 'Retur-admin' | 'Superbruker';
  proto?: (p: Proto) => Promise<void>;
  /** App: innlogget bruker (undefined = utlogget), valgt rolle ved flere roller, og url. */
  user?: string;
  role?: RegExp;
  url: string;
  app?: (page: Page) => Promise<void>;
  /** Dynamisk innhold som ikke kan være likt (datoer, beregnede tall, ekte bilder/QR) – se ALLOWED_DIFFS.md. */
  mask?: (page: Page) => Locator[];
  /** Faste områder (402×874) når innholdet er datastyrt og ikke kan pekes ut i appen. */
  rects?: { x: number; y: number; width: number; height: number }[];
}

const GIVER = 'jonas.hem@skanska.no', DRIVER = 'kari@ombruksfabrikken.no', ADMIN = 'silje@ombruksfabrikken.no', SUPER = 'demo@returapp.no';

// Datoer i designet er låst til fredag 11. september; appen viser datoer fra dagens dato.
const DATE = /(Man|Tir|Ons|Tor|Fre|Lør|Søn)(dag)? \d{1,2}\.( [a-zæøå]{3,9})?|\b[Ii] (dag|går)\b/;
const dates = (page: Page) => [page.getByText(DATE)];
const photos = (page: Page) => [page.locator('img')];

/** Designets demo-bruker har alle fire roller; testbrukerne har færre. Rollelisten byttes bare i nettleseren for disse skjermene. */
async function allRoles(page: Page) {
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), roles: { giver: true, driver: true, admin: true, super: true } } });
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}
const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' }).first().click();

export const SCREENS: ScreenDef[] = [
  // Innlogging
  { id: 'auth/login', start: 'login', url: '/login' },
  {
    id: 'auth/code', start: 'login', url: '/code',
    proto: async (p) => { await p.screen.locator('input[placeholder="Mobilnummer"]').fill('95432100'); await p.click('Send meg kode på SMS'); },
    app: async (page) => { await page.evaluate(() => sessionStorage.setItem('ra.phone', '95432100')); await page.goto('/code'); },
  },
  {
    id: 'auth/roles', start: 'roles', user: 'ola@ombruksfabrikken.no', url: '/roles',
    app: allRoles,
    // Designet viser ulike personer per rolle; appen viser innlogget bruker på alle.
    mask: (page) => [page.getByText(/Ola Berntsen ·/)],
  },

  // Giver
  { id: 'giver/home', start: 'Byggeplass / giver', user: GIVER, url: '/g/home', mask: dates },
  { id: 'giver/list', start: 'Byggeplass / giver', user: GIVER, url: '/g/list', proto: (p) => p.tab('Hentinger'), mask: dates },
  {
    id: 'giver/history', start: 'Byggeplass / giver', user: GIVER, url: '/g/list',
    proto: async (p) => { await p.tab('Hentinger'); await p.click('Historikk'); },
    app: (page) => page.getByRole('tab', { name: 'Historikk' }).click(), mask: dates,
  },
  {
    id: 'giver/export-sheet', start: 'Byggeplass / giver', user: GIVER, url: '/g/list',
    proto: async (p) => { await p.tab('Hentinger'); await p.click('Historikk'); await p.sel('[data-type="export"]'); },
    app: async (page) => { await page.getByRole('tab', { name: 'Historikk' }).click(); await btn(page, /Eksporter historikk/); }, mask: dates,
  },
  { id: 'giver/new-1', start: 'Byggeplass / giver', user: GIVER, url: '/g/new', proto: (p) => p.click('Meld henting') },
  {
    id: 'giver/new-2', start: 'Byggeplass / giver', user: GIVER, url: '/g/new',
    proto: async (p) => { await p.click('Meld henting'); await p.click('Vinduer'); },
    app: (page) => btn(page, 'Vinduer'),
  },
  {
    id: 'giver/new-3', start: 'Byggeplass / giver', user: GIVER, url: '/g/new',
    proto: async (p) => { await p.click('Meld henting'); await p.click('Vinduer'); await p.click('Neste'); await p.screen.locator('input[placeholder="f.eks. 24"]').fill('24'); },
    app: async (page) => { await btn(page, 'Vinduer'); await btn(page, 'Neste'); await page.getByLabel('Antall / mengde').fill('24'); },
  },
  {
    id: 'giver/new-4', start: 'Byggeplass / giver', user: GIVER, url: '/g/new',
    proto: async (p) => { await p.click('Meld henting'); await p.click('Vinduer'); await p.click('Neste'); await p.screen.locator('input[placeholder="f.eks. 24"]').fill('24'); await p.click('Neste'); },
    app: async (page) => { await btn(page, 'Vinduer'); await btn(page, 'Neste'); await page.getByLabel('Antall / mengde').fill('24'); await btn(page, 'Neste'); await page.getByLabel('Adresse').fill('Tangen 8'); },
    mask: dates,
  },
  {
    id: 'giver/new-5', start: 'Byggeplass / giver', user: GIVER, url: '/g/new',
    proto: async (p) => { await p.click('Meld henting'); await p.click('Vinduer'); await p.click('Neste'); await p.screen.locator('input[placeholder="f.eks. 24"]').fill('24'); await p.click('Neste'); await p.click('Neste'); },
    app: async (page) => { await btn(page, 'Vinduer'); await btn(page, 'Neste'); await page.getByLabel('Antall / mengde').fill('24'); await btn(page, 'Neste'); await page.getByLabel('Adresse').fill('Tangen 8'); await btn(page, 'Neste'); },
    mask: dates,
  },
  { id: 'giver/detail', start: 'Byggeplass / giver', user: GIVER, url: '/p/R-2041', proto: (p) => p.click('24 vinduer, 3-lags glass'), mask: (page) => [...dates(page), ...photos(page)] },
  {
    id: 'giver/cancel-sheet', start: 'Byggeplass / giver', user: GIVER, url: '/p/R-2041',
    proto: async (p) => { await p.click('24 vinduer, 3-lags glass'); await p.click('Avbryt henting'); },
    app: (page) => btn(page, 'Avbryt henting'), mask: (page) => [...dates(page), ...photos(page)],
  },
  {
    id: 'giver/label', start: 'Byggeplass / giver', user: GIVER, url: '/p/R-2041/label',
    proto: async (p) => { await p.click('24 vinduer, 3-lags glass'); await p.click('Merkelapp'); },
    mask: (page) => [page.locator('svg[width="180"]')],
  },
  {
    id: 'giver/receipt', start: 'Byggeplass / giver', user: GIVER, url: '/p/R-2030/receipt',
    proto: async (p) => { await p.tab('Hentinger'); await p.click('Historikk'); await p.click('Glassvegger, 6 seksjoner'); await p.click('Se kvittering'); },
    mask: (page) => [...dates(page), ...photos(page)],
  },
  { id: 'giver/msgs', start: 'Byggeplass / giver', user: GIVER, url: '/g/msgs', proto: (p) => p.tab('Meldinger') },
  {
    id: 'giver/thread', start: 'Byggeplass / giver', user: GIVER, url: '/p/R-2041/thread',
    proto: async (p) => { await p.tab('Meldinger'); await p.click('Kari Aasen'); },
  },
  { id: 'giver/profile', start: 'Byggeplass / giver', user: GIVER, url: '/profile', proto: (p) => p.tab('Profil'), app: allRoles },
  {
    id: 'giver/postnr-sheet', start: 'Byggeplass / giver', user: GIVER, url: '/profile',
    proto: async (p) => { await p.tab('Profil'); await p.click('Mitt postnummer'); },
    app: async (page) => { await allRoles(page); await btn(page, /Mitt postnummer/); },
    // Designets demo-hint («Prøv 4878 …») er erstattet med en forklaring.
    mask: (page) => [page.getByRole('dialog').getByText(/postnummeret/)],
  },

  // Sjåfør
  { id: 'driver/today', start: 'Sjåfør', user: DRIVER, url: '/d/today', mask: dates },
  { id: 'driver/market', start: 'Sjåfør', user: DRIVER, url: '/d/market', proto: (p) => p.tab('Børs'), mask: dates },
  { id: 'driver/route', start: 'Sjåfør', user: DRIVER, url: '/d/route', proto: (p) => p.tab('Rute'), mask: (page) => [page.getByText(/Skjematisk kart ·/)] },
  {
    id: 'driver/complete', start: 'Sjåfør', user: DRIVER, url: '/p/R-2041/complete',
    proto: async (p) => { await p.click('24 vinduer, 3-lags glass'); await p.click('Start henting'); },
  },
  {
    id: 'driver/avvik-sheet', start: 'Sjåfør', user: DRIVER, url: '/p/R-2041/complete',
    proto: async (p) => { await p.click('24 vinduer, 3-lags glass'); await p.click('Start henting'); await p.click('Meld avvik i stedet'); },
    app: (page) => btn(page, 'Meld avvik i stedet'),
  },
  { id: 'driver/profile', start: 'Sjåfør', user: DRIVER, url: '/profile', proto: (p) => p.tab('Profil'), app: allRoles },

  // Retur-admin
  { id: 'admin/inbox', start: 'Retur-admin', user: ADMIN, url: '/a/inbox', mask: dates },
  {
    id: 'admin/assign-sheet', start: 'Retur-admin', user: ADMIN, url: '/a/inbox',
    proto: (p) => p.sel('[data-type="assign"]:text-is("Annen")'),
    app: (page) => btn(page, 'Annen'), mask: dates,
  },
  { id: 'admin/routes', start: 'Retur-admin', user: ADMIN, url: '/a/routes', proto: (p) => p.tab('Ruter'), mask: (page) => [...dates(page), page.getByText(/stopp · ca \d+ km/)] },
  { id: 'admin/company', start: 'Retur-admin', user: ADMIN, url: '/a/company', proto: (p) => p.tab('Firma') },
  { id: 'admin/drivers', start: 'Retur-admin', user: ADMIN, url: '/a/drivers', proto: async (p) => { await p.tab('Firma'); await p.click('Sjåfører'); } },
  { id: 'admin/depts', start: 'Retur-admin', user: ADMIN, url: '/a/depts', proto: async (p) => { await p.tab('Firma'); await p.click('Avdelinger og lager'); } },
  {
    id: 'admin/stats', start: 'Retur-admin', user: ADMIN, url: '/a/stats', proto: async (p) => { await p.tab('Firma'); await p.click('Statistikk og rapport'); },
    // Tallene beregnes fra historikken; designet har faste tall.
    mask: (page) => [page.getByText(/^\d[\d ,.]*( (kg|t|dager|%))?$/), page.getByText('Per kategori (kg)').locator('xpath=following-sibling::div')],
  },
  {
    id: 'admin/coverage', start: 'Retur-admin', user: ADMIN, url: '/a/coverage', proto: async (p) => { await p.tab('Firma'); await p.click('Dekningsområde'); },
    // Ekte postnummerregister: alle kommuner i fylket og faktiske antall, mot designets utvalg på seks.
    mask: (page) => [page.getByRole('button').filter({ hasText: 'Ikke dekket' }), page.getByText(/\d+ postnr/), page.getByText(/postnummer dekkes nå/)],
  },

  // Superbruker
  { id: 'super/dash', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/dash', mask: dates },
  // «Uten firma»: designets «Ubehandlet»-liste står i dataenes rekkefølge, appen viser nyeste først.
  {
    id: 'super/orders', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/orders',
    proto: async (p) => { await p.tab('Ordre'); await p.click('Uten firma'); },
    app: (page) => page.getByRole('tab', { name: 'Uten firma' }).click(), mask: dates,
  },
  {
    id: 'super/company-sheet', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/orders',
    proto: async (p) => { await p.tab('Ordre'); await p.click('Uten firma'); await p.click('Tildel firma'); },
    app: async (page) => { await page.getByRole('tab', { name: 'Uten firma' }).click(); await btn(page, 'Tildel firma'); }, mask: dates,
  },
  { id: 'super/admin', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/admin', proto: (p) => p.tab('Admin') },
  { id: 'super/companies', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/companies', proto: async (p) => { await p.tab('Admin'); await p.click('Hentefirma'); } },
  { id: 'super/users', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/users', proto: async (p) => { await p.tab('Admin'); await p.click('Brukere og roller'); } },
  {
    id: 'super/user-sheet', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/users',
    proto: async (p) => { await p.tab('Admin'); await p.click('Brukere og roller'); await p.click('Kari Aasen'); },
    app: (page) => btn(page, /Kari Aasen/),
  },
  { id: 'super/cats', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/cats', proto: async (p) => { await p.tab('Admin'); await p.click('Kategorier'); } },
  {
    id: 'super/cat-sheet', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/cats',
    proto: async (p) => { await p.tab('Admin'); await p.click('Kategorier'); await p.click('Paller'); },
    app: (page) => btn(page, 'Paller'),
  },
  {
    id: 'super/postnr', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/postnr', proto: async (p) => { await p.tab('Admin'); await p.click('Postnummer og dekning'); },
    // Listen kommer fra ekte postnummerregister og faktisk dekning – designet har et fast utvalg.
    rects: [{ x: 0, y: 150, width: 402, height: 724 }],
  },
  { id: 'super/notice', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/notice', proto: async (p) => { await p.tab('Admin'); await p.click('Systemvarsel'); } },
  { id: 'super/support', start: 'Superbruker', user: SUPER, role: /^Superbruker/, url: '/s/support', proto: async (p) => { await p.tab('Admin'); await p.click('Support'); }, mask: dates },
];

/** Åpner prototypen (fersk tilstand) og går til startpunktet. */
export async function openPrototype(page: Page, start: ScreenDef['start']): Promise<Proto> {
  await page.goto(PROTOTYPE);
  const screen = page.locator('[data-theme]').first();
  const settle = () => page.waitForTimeout(350);
  const p: Proto = {
    page,
    screen,
    click: async (text) => { await screen.getByText(text, { exact: true }).first().click(); await settle(); },
    tab: async (name) => { await screen.getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) }).last().click(); await settle(); },
    sel: async (selector) => { await screen.locator(selector).first().click(); await settle(); },
  };
  await page.getByText('Send meg kode på SMS').waitFor({ timeout: 30_000 });
  // Prototypens flex-kolonner med overflow:auto lar barna krympe under egen høyde (søkefelt, chips og bildestriper blir 0–24 px).
  // Referansen tas slik designet er tenkt – samme regel som appens .ra-scroll i styles.css.
  await page.addStyleTag({ content: '[data-theme] div[style*="overflow: auto"][style*="flex-direction: column"] > * { flex-shrink: 0 !important; }' });
  await page.evaluate(() => document.fonts.ready);
  if (start === 'login') return p;
  await screen.locator('input[placeholder="Mobilnummer"]').fill('95432100');
  await p.click('Send meg kode på SMS');
  await screen.locator('input[placeholder="••••••"]').fill('123456');
  await p.click('Bekreft');
  await page.getByText('Hvem er du i dag?').waitFor();
  if (start !== 'roles') await p.click(start);
  return p;
}
