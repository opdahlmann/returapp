// Liten statisk server for dist/ med samme regler som infra/nettside/nginx.conf: rene adresser ($uri, $uri.html), 404-siden med
// status 404, .html-adresser sendes til den rene adressen, og gzip på tekst (som nginx). Til Playwright (astro preview kjører som daemon i Astro 7).
// Kjør: node skript/server.mjs [port]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGzip } from 'node:zlib';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.argv[2] ?? 4322);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const fil = (p) => existsSync(p) && statSync(p).isFile();
createServer((req, res) => {
  const sti = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (/\.html$/.test(sti) && sti !== '/404.html') return res.writeHead(301, { Location: sti.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '') || '/' }).end();
  if (sti.length > 1 && sti.endsWith('/')) return res.writeHead(301, { Location: sti.slice(0, -1) }).end();
  const kandidater = sti === '/' ? [join(dist, 'index.html')] : [join(dist, sti), join(dist, `${sti}.html`), join(dist, sti, 'index.html')];
  let treff = kandidater.find(fil);
  let status = 200;
  if (!treff) { treff = join(dist, '404.html'); status = 404; }
  const type = MIME[extname(treff)] ?? 'application/octet-stream';
  const gzip = /^(text\/|application\/(json|xml|javascript)|image\/svg)/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(status, { 'Content-Type': type, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  const strom = createReadStream(treff);
  (gzip ? strom.pipe(createGzip()) : strom).pipe(res);
}).listen(port, () => console.log(`dist/ på http://localhost:${port}`));
