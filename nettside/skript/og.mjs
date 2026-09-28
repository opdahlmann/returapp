// Lager delingsbildene (Open Graph, 1200×630) i public/og/ fra src/og/mal.html. Kjøres manuelt når titler endres; bildene sjekkes inn.
// Kjør: node skript/og.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const mal = pathToFileURL(join(her, '../src/og/mal.html')).href;
const bilde = (navn) => pathToFileURL(join(her, `../src/assets/skjermbilder/light/${navn}.png`)).href;
const ut = join(her, '../public/og');
mkdirSync(ut, { recursive: true });

// Filnavn = sti med / byttet til -, som Seo.astro regner ut. Titlene er kortversjoner av sidenes H1.
const sider = [
  ['forside', 'Enkel retur og gjenbruk fra byggeplassen', 'giver-home'],
  ['funksjoner', 'Fire roller, én henting', 'admin-inbox'],
  ['for-byggeplass', 'Det som ikke skal i containeren', 'giver-new-4'],
  ['for-hentefirma', 'Oppdragene kommer til innboksen', 'admin-inbox'],
  ['demo', 'Prøv Returapp i nettleseren', 'driver-today'],
  ['personvern', 'Personvern', 'giver-receipt'],
  ['kontakt', 'Kontakt Returapp', 'giver-home'],
  ['404', 'Fant ikke siden', 'giver-home'],
];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const [navn, tittel, skjerm] of sider) {
  await p.goto(`${mal}?tittel=${encodeURIComponent(tittel)}&bilde=${encodeURIComponent(bilde(skjerm))}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(ut, `${navn}.png`) });
  console.log(`og/${navn}.png`);
}
await b.close();
