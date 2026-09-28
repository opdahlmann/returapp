# returapp.no

Statisk produktside for Returapp, bygget med Astro uten rammeverk i nettleseren. Plan, beslutninger og steg: `docs/nettside-plan.md`.

- Kjøre: `npm install` og `npm run dev` (port 4321). Krever Node 22.12 eller nyere.
- Bygge: `npm run build` gir `dist/`. `npm run sjekk` bygger, kontrollerer `dist/` (`skript/sjekk-dist.mjs`) og kjører Playwright (`tests/`, mot `skript/server.mjs`, som serverer `dist/` med samme regler som nginx).
- Fonter, ikoner og demoen kopieres inn fra `frontend/` og `docs/design/` av `skript/kopier-inn.mjs` før dev og bygg. Demoen er designprototypen `docs/design/Returapp-standalone.html` uendret (bare tittel, `lang` og `noindex` byttes i kopien), servert som `/demo/app` og åpnet i egen fane.
- Skjermbildene i `src/assets/skjermbilder/` er tatt av appen med `npm run skjermbilder` (krever API og `ng serve` lokalt, Playwright starter dem selv).
- Delingsbildene i `public/og/` lages av `node skript/og.mjs` når titler endres.
- Drift: `infra/nettside/Dockerfile` og `infra/nettside/nginx.conf`, se `DEPLOY.md`.

## Sjekkliste fra taste-skillen (harde regler, kapittel 4.7), gått gjennom 28. september 2026

- [x] Hero får plass i første skjermbilde: H1 på to linjer på desktop, ingress på 17 ord, knappene synlige uten rulling på 390×844 (test i `tests/`).
- [x] Hero-skala: H1 56 px på desktop, 36 px på mobil, aldri fire linjer.
- [x] Toppavstand i hero maks 96 px (80 px desktop, 56 px mobil).
- [x] Hero har fire tekstelementer: ingen eyebrow, H1, ingress, to knapper. Ingen tagline, ingen logovegg, ingen prisstripe.
- [x] Nav på én linje ved 1024 px og 64 px høy (test).
- [x] Bento med seks celler, alle fylt: 2 + 3 + 1, tre med bilde og tre tonet.
- [x] Ingen layoutfamilie brukes to ganger på forsiden: hero-splitt, medie i full bredde, trestegs-rekke, bento, to like kort, tallrad, ren tekst, trekkspill, CTA-bånd.
- [x] Aldri mer enn to bilde-tekst-splitter på rad (forsiden har én; `/funksjoner` har to, deretter to kort).
- [x] Tre eyebrows på ni seksjoner (demo, for hvem, miljø); `sjekk-dist` feiler ved fire.
- [x] Ingen delt seksjonsoverskrift med forklaring i høyre kolonne.
- [x] Bento har bakgrunnsvariasjon: tre skjermbildeutsnitt, tre tonede flater.
- [x] Mobilfall er angitt i hver komponent (`@media (min-width: …)` i samme fil).
- [x] Bevegelse: én kurve og to varigheter fra appens `ra-up`; alt under `prefers-reduced-motion: no-preference` (test).
- [x] Kontrast 4,5:1 målt: dempet tekst på tonede flater bruker `.flate`-regelen i `global.css`. Lighthouse tilgjengelighet 100.
- [x] Lyst og mørkt tema følger systemet uten blink (`data-theme` settes før stilene).

Lighthouse 28. september 2026 mot `skript/server.mjs` (gzip, uten cache-hoder): mobil 100/100/100/100, LCP 1,7 s (H1, simulert Slow 4G), CLS 0, TBT 0 ms, 179 kB; desktop 100/100/100/100, LCP 0,3 s, 137 kB. Planens LCP-mål var 1,5 s; det som gjenstår er HTML og font over simulert 4G, ikke bilder eller skript.
