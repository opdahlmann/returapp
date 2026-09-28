# returapp.no

Statisk produktside for Returapp, bygget med Astro uten rammeverk i nettleseren. Plan, beslutninger og steg: `docs/nettside-plan.md`.

- Kjøre: `npm install` og `npm run dev` (port 4321). Krever Node 22.12 eller nyere.
- Bygge: `npm run build` gir `dist/`. `npm run sjekk` bygger, kontrollerer `dist/` (`skript/sjekk-dist.mjs`) og kjører Playwright (`tests/`, mot `skript/server.mjs`, som serverer `dist/` med samme regler som nginx).
- Ikonene og demoen kopieres inn fra `frontend/` og `docs/design/` av `skript/kopier-inn.mjs` før dev og bygg. Teksten settes i systemfonten (SF Pro på Apple, Segoe UI på Windows), ingen fontfiler. Demoen er designprototypen `docs/design/Returapp-standalone.html` uendret (bare tittel, `lang` og `noindex` byttes i kopien), servert som `/demo/app` og åpnet i egen fane.
- Skjermbildene i `src/assets/skjermbilder/` er tatt av appen med `npm run skjermbilder` (krever API og `ng serve` lokalt, Playwright starter dem selv).
- Delingsbildene i `public/og/` lages av `node skript/og.mjs` når titler endres.
- Drift: `infra/nettside/Dockerfile` og `infra/nettside/nginx.conf`, se `DEPLOY.md`.

## Design «flytende» (branch `opd-apple`)

Nytt design etter Emil Kowalskis skills (`emil-design-eng`, `animate`, `apple-design`, `review-animations`, `find-animation-opportunities`, `animation-vocabulary`, `ask-sonner`). Ingen biblioteker i nettleseren, alt er CSS og små skript som Astro bundler (CSP tillater bare `'self'`).

- Tokens i `src/styles/global.css`: kurvene `--ease-out`, `--ease-in-out` og `--ease-drawer`, varigheter 160/200/700 ms, glassmaterialer (`backdrop-filter`) med fall for `prefers-reduced-transparency` og `prefers-contrast`. Systemfont med størrelsesavhengig sperring: display -.035em, H2 -.03em, brødtekst 0, liten tekst +.005em.
- `src/skript/fjaer.ts`: fjær med Apples to parametre (dempingsforhold og respons), alltid avbrytbar, med projeksjon av kast (`projiser`), gummistrikk (`strikk`) og fartsmåler så slippet arver fingerens fart.
- Nav (`Nav.astro`): flytende pille i glass; tyngre skygge når siden er rullet (observer på en vakt øverst, ingen 1 px-strek). På mobil et ark (`<dialog>`) som fjæres opp, dras 1:1 med pekerfangst, strikker oppover, og lukker når kastet projiseres forbi 40 %. Escape og bakteppet lukker samme vei som det kom.
- Hero: tekst og telefon materialiserer (uskarphet, skala og forflytning sammen). Med ekte peker vipper telefonen etter musen via to uavhengige fjærer.
- Karusell (`Karusell.astro`, forsiden): native scroll-snap for berøring og hjul; mus drar med pekerfangst, kastet lander på kortet farten peker mot, fjæren arver farten. Prikker, piler og piltaster bruker samme fjær.
- Faner (`Faner.astro`, /funksjoner): duplisert faneliste klippet med `clip-path` gir perfekt fargeovergang; paneler i samme rutenettcelle så høyden aldri hopper, kryssfading med 4 px uskarphet i sømmen.
- FAQ (`Faq.astro`): native `<details>` animert med Web Animations API (høyde + opasitet, 240 ms), avbrytbar midt i.
- Lys/mørk (`Lysmork.astro`): `<input type="range">` over telefonen driver `clip-path` direkte, ingen overgang (direkte manipulasjon).
- Toast (/kontakt): `@starting-style` inn nedenfra, ut samme vei, overganger ikke keyframes.
- Statuslinjen på /funksjoner tegnes av rullingen med `animation-timeline: view()` der det finnes.
- Trykk: alle knapper skalerer til .97 på 160 ms. Hover bare under `(hover: hover) and (pointer: fine)`. `prefers-reduced-motion`: bare fade, ingen fjærer, ingen vipp.
- Tester i `tests/` dekker arket (dra og Escape), karusellen (dra med mus), fanene (klikk og piltast), glideren og FAQ, og layout på 390 og 1440 px for hver side: ingen vannrett overflow, alle bilder lastet etter rulling, alt innslipp synlig, ingen tekst utenfor skjermen.
- Innslipp (`data-reveal`) settes rett på elementene i sidene, ikke via en komponent: Astro gir ikke sidens scope-attributt til en komponents rotelement, så sidens stiler ville ikke truffet.

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
