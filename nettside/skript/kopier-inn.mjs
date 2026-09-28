// Kopierer det nettsiden låner fra resten av repoet inn i public/ (ignorert av git). Kjøres av predev og prebuild.
// - Demoen: docs/design/Returapp-demo.html → public/demo/app.html (nginx serverer den som /demo/app)
// - Fontene: frontend/public/fonts/*.woff2 → public/fonts/ (samme filer som appen, ingen Google Fonts)
// - Ikonene: frontend/public/icons/*.png → public/icons/
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const her = dirname(fileURLToPath(import.meta.url));
const rot = join(her, '../..');
const pub = join(her, '../public');

const par = [
  ['docs/design/Returapp-demo.html', 'demo/app.html'],
  ['frontend/public/fonts', 'fonts'],
  ['frontend/public/icons', 'icons'],
];
for (const [fra, til] of par) {
  const kilde = join(rot, fra);
  if (!existsSync(kilde)) throw new Error(`mangler ${kilde} (kjør nettside/skript/demo-pakk-ut.mjs?)`);
  mkdirSync(dirname(join(pub, til)), { recursive: true });
  cpSync(kilde, join(pub, til), { recursive: true });
}
