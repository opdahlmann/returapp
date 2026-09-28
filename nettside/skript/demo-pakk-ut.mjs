// Pakker designprototypen (en «Bundled Page» med base64+gzip-manifest) ut til én vanlig, selvforsynt HTML-fil.
// Inn:  docs/design/Returapp-standalone.html (røres ikke; referansebildene i frontend/e2e bygger på den)
// Ut:   docs/design/Returapp-demo.html (React, ReactDOM, dc-runtime, demo-data og fonter inline; ingen unpkg, ingen Google Fonts, ingen Babel)
// Kjør: node nettside/skript/demo-pakk-ut.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const rot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const inn = join(rot, 'docs/design/Returapp-standalone.html');
const ut = join(rot, 'docs/design/Returapp-demo.html');

const html = readFileSync(inn, 'utf8');
const del = (type) => JSON.parse(html.match(new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`))[1]);
const manifest = del('manifest');
const ext = del('ext_resources');
let mal = del('template');

const bytes = (uuid) => {
  const e = manifest[uuid];
  const raw = Buffer.from(e.data, 'base64');
  return e.compressed ? gunzipSync(raw) : raw;
};
const tekst = (uuid) => bytes(uuid).toString('utf8');
const uuidFor = (delAvUrl) => ext.find((r) => r.id.includes(delAvUrl))?.uuid ?? fail(`ext_resources mangler ${delAvUrl}`);
const fail = (m) => { throw new Error(m); };

// Skript som malen refererer med <script src="uuid">: dc-runtime og demo-data (window.RA).
const skriptUuids = [...mal.matchAll(/<script src="([0-9a-f-]{36})"><\/script>\n?/g)].map((m) => m[1]);
if (skriptUuids.length !== 2) fail(`ventet 2 skript i malen, fant ${skriptUuids.length}`);
mal = mal.replace(/<script src="[0-9a-f-]{36}"><\/script>\n?/g, '');

// Fonter: uuid i @font-face → data-URI (manifestet har dem ukomprimert som base64).
for (const [uuid, e] of Object.entries(manifest)) {
  if (!e.mime.startsWith('font/')) continue;
  mal = mal.split(uuid).join(`data:${e.mime};base64,${e.data}`);
}

// Google Fonts-preconnect (fontene er inline).
mal = mal.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n?/, '');

// IOSDevice-rammen (JSX via Babel) byttes mot en enkel boks som fyller vinduet: appen ligger som position:absolute;inset:0 inni.
const rammeStart = /<div style="min-height:100vh;[^"]*background:#E4E8E0">\n<x-import component-from-global-scope="IOSDevice"[^>]*>\n/;
if (!rammeStart.test(mal)) fail('fant ikke IOSDevice-rammen i malen');
mal = mal.replace(rammeStart, '<div style="position:relative;height:100vh;height:100dvh;overflow:hidden">\n');
mal = mal.replace(/<\/x-import>\n<\/div>\n<\/x-dc>/, '</div>\n</x-dc>');

// Tema fra adressen (?theme=dark), så nettsiden kan vise demoen i samme tema som seg selv.
const temaFør = "this.state.theme = p.theme ?? 'light';";
if (!mal.includes(temaFør)) fail('fant ikke tema-initialiseringen i komponenten');
mal = mal.replace(temaFør, "this.state.theme = new URLSearchParams(location.search).get('theme') || p.theme || 'light';");

// Hode: React og ReactDOM må finnes på window før dc-runtime (den laster dem ellers fra unpkg). window.__resources = {} hindrer at
// runtime henter siden på nytt for å lete etter ressurser.
const inline = (uuid) => {
  const js = tekst(uuid);
  if (js.includes('</script')) fail(`${uuid} inneholder </script`);
  return `<script>${js}</script>`;
};
const hode = [
  '<!DOCTYPE html>',
  '<html lang="nb">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="robots" content="noindex">',
  '<title>Returapp · Demo</title>',
  '<style>html,body{margin:0;height:100%;background:#E4E8E0}</style>',
  '<script>window.__resources = {};</script>',
  inline(uuidFor('/react@')),
  inline(uuidFor('/react-dom@')),
  ...skriptUuids.map(inline),
  '</head>',
].join('\n');

const kropp = mal.slice(mal.indexOf('<body>'));
const resultat = `${hode}\n${kropp}`;

// Skriptene i hodet inneholder adresser som tekst (Reacts feildekoder, runtimes unpkg-reserve som aldri brukes når React finnes på window),
// så bare malen sjekkes. Runtime kan ikke laste noe utenfra derfra: alle src/href peker på data: eller er borte.
const eksterne = [...kropp.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('http://www.w3.org/'));
if (eksterne.length) fail(`eksterne adresser igjen i malen: ${[...new Set(eksterne)].join(', ')}`);
if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(kropp)) fail('uuid igjen i malen');

writeFileSync(ut, resultat);
console.log(`Skrev ${ut} (${(resultat.length / 1024).toFixed(0)} kB)`);
