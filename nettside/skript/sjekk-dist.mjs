// Går gjennom dist/**/*.html og feiler når planens regler brytes (docs/nettside-plan.md N8). Node, ingen avhengigheter.
// Kjør: node skript/sjekk-dist.mjs   (etter npm run build)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const rot = join(her, '../..');
const dist = join(her, '../dist');
const SITE = 'https://returapp.no';
const FORBUDT = ['sømløs', 'neste generasjon', 'revolusjoner', 'kraftig', 'elegant', 'bærekraftig reise'];
const TIDSVINDU = /\b\d{2}–\d{2}\b/g; // Seeder.Slots: 07–09, 09–12, 12–15, 15–18 gjengis som i appen

const filer = [];
const gaa = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) f.isDirectory() ? gaa(join(d, f.name)) : f.name.endsWith('.html') && filer.push(join(d, f.name)); };
gaa(dist);
if (!filer.length) throw new Error('dist/ er tom, kjør npm run build først');

const feil = [];
const meld = (fil, m) => feil.push(`${relative(dist, fil)}: ${m}`);
const attr = (html, re) => html.match(re)?.[1];
const avkod = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// CO₂-faktoren i teksten skal være den samme som i API-et.
const weight = readFileSync(join(rot, 'backend/src/Returapp.Api/Services/Weight.cs'), 'utf8');
const faktor = weight.match(/kg \* ([\d.]+)/)?.[1].replace('.', ',');
if (!faktor) throw new Error('fant ikke CO₂-faktoren i Weight.cs');

for (const fil of filer) {
  const html = readFileSync(fil, 'utf8');
  const erDemoApp = fil.endsWith('/demo/app.html');
  if (erDemoApp) continue; // prototypen, ikke en side
  const sti = '/' + relative(dist, fil).replace(/\.html$/, '').replace(/^index$/, '');
  const synlig = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<[^>]+>/g, ' ');

  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) meld(fil, 'skal ha nøyaktig én <h1>');
  const tittel = attr(html, /<title>([^<]*)<\/title>/) ?? '';
  if (tittel.length < 20 || tittel.length > 60) meld(fil, `<title> er ${tittel.length} tegn (20–60): ${tittel}`);
  const beskr = avkod(attr(html, /<meta name="description" content="([^"]*)"/) ?? '');
  if (beskr.length < 80 || beskr.length > 160) meld(fil, `description er ${beskr.length} tegn (80–160)`);
  const canonical = attr(html, /<link rel="canonical" href="([^"]*)"/);
  if (!canonical?.startsWith(SITE) || canonical.endsWith('/') && canonical !== `${SITE}`) meld(fil, `canonical mangler eller er feil: ${canonical}`);
  if (canonical && canonical !== `${SITE}${sti === '/' ? '' : sti}` && sti !== '/404') meld(fil, `canonical ${canonical} matcher ikke stien ${sti}`);
  if (!/<html[^>]*\blang="nb"/.test(html)) meld(fil, 'lang skal være nb');
  const og = attr(html, /<meta property="og:image" content="([^"]*)"/);
  if (!og) meld(fil, 'og:image mangler');
  else if (!existsSync(join(dist, og.replace(SITE, '')))) meld(fil, `og:image finnes ikke i dist: ${og}`);
  const streker = synlig.replace(TIDSVINDU, '').match(/[—–]/g);
  if (streker) meld(fil, `${streker.length} tankestrek(er) i synlig tekst`);
  for (const ord of FORBUDT) if (synlig.toLowerCase().includes(ord)) meld(fil, `forbudt ord: «${ord}»`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) meld(fil, 'img uten alt');
  for (const m of html.matchAll(/\b(?:href|src)="(\/[^"#?]*)/g)) {
    const p = m[1];
    if (p.startsWith('//')) continue;
    const kandidater = [p, `${p}.html`, `${p}/index.html`].map((k) => join(dist, k));
    if (!kandidater.some(existsSync)) meld(fil, `intern lenke uten mål: ${p}`);
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]*)"/g)) meld(fil, `eksternt skript: ${m[1]}`);
  for (const m of html.matchAll(/<link\b[^>]*\brel="(?:stylesheet|preload|modulepreload)"[^>]*\bhref="(https?:\/\/[^"]*)"/g)) meld(fil, `ekstern ressurs: ${m[1]}`);
  if (sti === '/') {
    const eyebrows = (html.match(/class="eyebrow/g) ?? []).length;
    if (eyebrows > 3) meld(fil, `${eyebrows} eyebrows på forsiden (maks 3)`);
    if (!synlig.includes(`${faktor} kg per kg`)) meld(fil, `CO₂-faktoren i teksten er ikke ${faktor} som i Weight.cs`);
  }
}

if (feil.length) {
  console.error(feil.join('\n'));
  process.exit(1);
}
console.log(`sjekk-dist: ${filer.length - 1} sider ok`);
