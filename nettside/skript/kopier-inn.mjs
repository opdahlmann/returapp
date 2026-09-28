// Kopierer det nettsiden låner fra resten av repoet inn i public/ (ignorert av git). Kjøres av predev og prebuild.
// - Demoen: docs/design/Returapp-standalone.html (prototypen, uendret) → public/demo/app.html (nginx serverer den som /demo/app).
//   Bare <title>, lang og robots byttes i kopien.
// - Ikonene: frontend/public/icons/*.png → public/icons/
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const rot = join(her, '../..');
const pub = join(her, '../public');

const par = [['frontend/public/icons', 'icons']];
for (const [fra, til] of par) {
  const kilde = join(rot, fra);
  if (!existsSync(kilde)) throw new Error(`mangler ${kilde}`);
  mkdirSync(dirname(join(pub, til)), { recursive: true });
  cpSync(kilde, join(pub, til), { recursive: true });
}

const proto = join(rot, 'docs/design/Returapp-standalone.html');
if (!existsSync(proto)) throw new Error(`mangler ${proto}`);
mkdirSync(join(pub, 'demo'), { recursive: true });
// Ved oppstart bytter bundlen hele dokumentet med malen (en JSON-streng), så tittel, lang og robots må inn begge steder.
const hode = '<title>Returapp · Demo</title>\n<meta name="robots" content="noindex">';
const iMal = '<html><head>\\n<meta charset=\\"utf-8\\">';
const kopi = readFileSync(proto, 'utf8')
  .replace('<html>', '<html lang="nb">')
  .replace('<title>Bundled Page</title>', hode)
  .replace(iMal, `<html lang=\\"nb\\"><head>\\n<meta charset=\\"utf-8\\">\\n${hode.replace(/"/g, '\\"').replace(/\n/g, '\\n')}`);
if (!kopi.includes('lang=\\"nb\\"')) throw new Error('fant ikke malens <head> i prototypen');
writeFileSync(join(pub, 'demo/app.html'), kopi);
