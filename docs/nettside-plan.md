# Nettside for Returapp: implementeringsplan

*Versjon 1.0, 28. september 2026. Plan for prosjektet `nettside/` (Astro) som skal bli produktsiden på `returapp.no`. Skrevet før én linje kode, etter samme mal som nettsideplanen for Kodetank Lokal KI. Følger samme regler som `IMPLEMENTERINGSPLAN.md`: ett steg om gangen, tester, «Endret»-notat når noe avviker, ett innsjekk per steg på branch `opd`. Kilder: `IMPLEMENTERINGSPLAN.md` (skjermer, roller, forretningsregler), `README.md`, `DEPLOY.md`, `dockploy-way.md`, `frontend/src/styles.css`, `frontend/e2e/visual/screens.ts`, designprototypen i `docs/design/`, seed-dataene i `backend/src/Returapp.Api/Seed/Seeder.cs`, og søstersidene kodetank.no og nabotavle.no (repoene `kodetank-no` og `nabotavle`).*

---

## 0. Kort fortalt

En statisk nettside bygget med Astro, uten rammeverk i nettleseren, som forklarer Returapp for to grupper: byggeplasser som har materialer til overs, og hentefirma som vil hente dem. Siden gjenbruker appens egne designtokens og font, viser ekte skjermbilder fra appen i en telefonramme, og lar besøkende klikke gjennom prototypen som demo rett i nettleseren, slik nabotavle.no og planen for lokal-ki.kodetank.no gjør. Alt innhold hentes fra dokumentasjonen og koden i dette repoet, så siden lover bare det appen faktisk gjør. Begge handlingene siden ber om, «Meld henting» og «Bli hentefirma», finnes allerede i appen (`app.returapp.no` og `app.returapp.no/apply`). Nettsiden trenger derfor ingen backend, ingen skjema og ingen `/api`-proxy.

**Hva som leveres**

| Del | Hvor |
|---|---|
| Astro-prosjekt | `nettside/` i repo-rota, ved siden av `frontend/` og `backend/` |
| Demo | `docs/design/Returapp-standalone.html` pakket ut til vanlig HTML uten eksterne ressurser, kopiert inn i nettsiden ved bygg |
| Skjermbilder fra ekte app | `nettside/src/assets/skjermbilder/`, laget av et Playwright-skript som gjenbruker skjermkatalogen i `frontend/e2e/visual/screens.ts` |
| Designtokens | `frontend/src/tokens.css`, delt mellom appen og nettsiden (én sannhet for farger, lys og mørk) |
| Drift | Dokploy med `infra/nettside/Dockerfile` og `infra/nettside/nginx.conf`, samme mønster som `infra/web/` og kodetank.no |

**Beslutninger** (planens forslag; de som er merket «antatt» bekreftes av eieren i kapittel 1)

1. Kanonisk adresse er `https://returapp.no`; `www.returapp.no` går 301 dit. Apex-domenet er allerede reservert til nettsiden i `DEPLOY.md` § 1.
2. Hosting er Dokploy med Dockerfile, som appens to andre applikasjoner. To miljøer: `returapp.no` fra `main` og `dev.returapp.no` fra `opd`.
3. Ingen prisside. Appen sier at hentingen er gratis for giver (wizardens steg 5), og ingen prismodell for hentefirma er besluttet. Siden sier «gratis for byggeplassen» og ikke mer (antatt).
4. Ingen statistikk, ingen informasjonskapsler, ingen samtykkebanner. `/personvern` sier det.
5. Bare norsk bokmål.
6. Lyst og mørkt tema etter `prefers-color-scheme`, uten bryter. Appen har begge, tokens for begge finnes allerede i `styles.css`, og referansebildene i `docs/design/screens/` finnes i begge. Det koster ett `<picture>`-element per skjermbilde.
7. Ingen JavaScript-rammeverk og ingen animasjonsbibliotek. Native CSS, én liten `IntersectionObserver`, og nettleserens egne view transitions. Appens egen bevegelseskurve (`ra-up`: 280 ms, `cubic-bezier(.2,.8,.2,1)`) blir sidens rytme.
8. Avsender er Kodetank AS med `kontakt@returapp.no` som kontaktpunkt (antatt; postkassen finnes ikke i dag, se kapittel 1).

---

## 1. Spørsmål til eieren

Planen antar svarene under så arbeidet kan starte. Bekreftes eller rettes før N6 (tekst) og N9 (drift), og føres da inn her som «Endret i 1.1».

| # | Spørsmål | Antatt svar | Konsekvens i planen |
|---|---|---|---|
| 1 | Domene | `returapp.no` med `www` som 301 | `site` i Astro-konfig, canonical, OG-URL-er. Dokploy-appen får begge domenene; nginx omdirigerer `www`. |
| 2 | Hosting | Dokploy med Dockerfile, som `infra/web/` | To filer i `infra/nettside/`. Byggkontekst er repo-roten fordi bygget trenger `docs/design/`, `frontend/src/tokens.css` og `frontend/public/fonts/`. Steg N9. |
| 3 | Pris | Ingen prisside; «gratis for byggeplassen» | Ingen `/priser`, ingen `Offer` i strukturerte data. Kommer en prismodell for hentefirma, legges siden til etter mønsteret i Kodetank-planen (kapittel 9). |
| 4 | Statistikk | Ingen ved lansering | Ingen sporing, ingen CSP-unntak for Google. Når det avgjøres: samme mønster som kodetank.no (`Tracking.astro`, Consent Mode v2, CSP utvidet) og en linje i `/personvern`. |
| 5 | Hvem står bak | Kodetank AS, org.nr 922 973 075, Moss | Bunntekst og `Organization`-skjema. Er det en annen juridisk enhet, byttes ett objekt i `src/consts.ts`. |
| 6 | Kontaktadresse | `kontakt@returapp.no` | Alle `mailto:`-lenker. Postkassen må opprettes hos e-postleverandøren før lansering. `drift@returapp.no` (push-subjekt i `DEPLOY.md`) og `noreply@returapp.no` (avsender) finnes allerede som adresser i konfigurasjonen. |
| 7 | Referansekunder | Ingen | Ingen kundelogoer og ingen sitater. Demo-firmaene i seeden (Ombruksfabrikken AS, Gjenbrukslageret Oslo, Sirkula Sør) er fiktive og skal aldri vises som kunder. |
| 8 | Språk | Bare norsk | Ingen `i18n`-konfig, ingen `hreflang`. |

---

## 2. Designlesning (taste-skill)

**Lesning:** Produktside for to praktiske målgrupper: anleggsledere, prosjektledere og byggeplassansvarlige som vil bli kvitt brukbare materialer uten å kaste dem, og daglige ledere og driftsansvarlige hos ombruksaktører som vil ha oppdragene. Ingen av dem er teknikere, og begge leser på mobil. Språket er direkte og konkret, i slekt med nabotavle.no, uten miljøpatos. Grunnlaget er native CSS og appens egne tokens: Figtree i all tekst (appen har én font, siden får én font), skogsgrønn `--pri #2E7A45` som eneste aksent på lys flate, og innloggingsskjermens palett (`#1B4D2B` med lime `#B7E39B`) til mørke bånd.

**Dialer:** `DESIGN_VARIANCE 6`, `MOTION_INTENSITY 4`, `VISUAL_DENSITY 4`. Landingsside-standarden er 7/6/4; en praktisk målgruppe på mobil trekker variansen og bevegelsen ned. Bevegelse skal merkes, aldri stjele fokus.

**Bevisste avvik fra taste-skillen, med begrunnelse**

- *Én font, ingen display-serif:* appen bruker Figtree 300–900 og ingenting annet. Hierarkiet lages med vekt (800 i overskrifter, som appen) og størrelse, ikke med en ekstra font.
- *Mørk modus følger systemet uten bryter:* appen har en bryter i Profil fordi den er en innlogget flate. En nettside husker ikke brukeren; `prefers-color-scheme` er nok.
- *Ingen React, ingen Motion:* Astro uten øyer. Skillens React-mønstre oversettes til CSS-overganger på `transform` og `opacity`, styrt av én observer.
- *Ingen bildegenerering:* alle bilder er ekte skjermbilder fra appen, tatt med Playwright på demo-dataene. Telefonrammen rundt dem er CSS, ikke et bilde. Ingen div-baserte «skjermbilder», ingen illustrasjoner.
- *Telefonformat, ikke laptop:* appen er en mobilflate på 402×874 (maks 480 px på desktop). Hero, demo og alle skjermbilder vises derfor i én telefonramme (`Telefon.astro`), aldri i en nettleser- eller laptopramme.

**Regler som gjelder hele siden**

- Null tankestreker (`—` og `–`) i synlig tekst. Bruk komma, punktum eller kolon. Bindestrek i tallområder. Unntak: tidsvinduene `07–09`, `09–12`, `12–15` og `15–18` gjengis som i appen (`Seeder.Slots`). Kontrolleres mekanisk i N8.
- Én aksentfarge på hele siden. Statusfargene `--warn`, `--dan` og `--info` brukes bare der de viser ekte status i et skjermbilde eller i demoen.
- Ett radiussystem, appens: kort 18 px, knapper og felt 14 px, piller 999 px.
- Maks 3 «eyebrows» (små versal-etiketter over en overskrift) på forsiden.
- Maks 2 seksjoner på rad med bilde-og-tekst-splitt. Hver layoutfamilie brukes én gang per side.
- Ingen «steg 1 / steg 2»-etiketter; verbet er etiketten. Ingen versjonsnumre eller «beta» i markedsføringen.
- Ingen «sømløs», «neste generasjon», «revolusjonerende», «kraftig», «bærekraftig reise». Konkrete verb.
- Tall bare fra koden i repoet, alltid med kilde i kapittel 3: 12 kategorier, 5 steg, 4 tidsvinduer, 4 roller, CO₂-faktor 0,9. Ingen oppdiktede totaler («12 000 tonn spart»); det finnes ingen produksjonsdata ennå.
- Sitater og kundelogoer: ingen før en ekte kunde har gitt et sitat med navn og tillatelse.
- Alle CTA-er med samme hensikt har samme tekst: «Meld henting» (til `https://app.returapp.no`), «Bli hentefirma» (til `https://app.returapp.no/apply`) og «Prøv demoen» (til `/demo`). Ingen synonymer.

---

## 3. Innholdsgrunnlag

Alt som skal stå på siden finnes allerede i repoet. Tabellen sier hvor hver påstand hentes fra, så tekstforfatteren ikke dikter.

| Tema | Kilde | Bruk på siden |
|---|---|---|
| Ett løfte: «Enkel retur og gjenbruk fra byggeplassen» | `frontend/src/index.html` (`description`), innloggingsskjermen (`IMPLEMENTERINGSPLAN.md` 1.5) | Hero-H1 |
| Fire roller og hva hver gjør | `IMPLEMENTERINGSPLAN.md` 1.4 og 1.5 | `/funksjoner`, `/for/*`, seksjonen «Slik virker det» |
| Wizarden i fem steg (kategori, bilder, mengde og stand, sted og tid, oppsummering) | `IMPLEMENTERINGSPLAN.md` 1.5 (`g_new`), `frontend/src/app/giver/` | «Slik virker det», `/for/byggeplass` |
| Gjest uten konto får SMS | `IMPLEMENTERINGSPLAN.md` 1.4, `Notifier.Giver` i `backend/src/Returapp.Api/Services/Notify.cs` | FAQ |
| Dekning: postnummer til kommune, firma dekker kommuner, «varsle meg», «tips et firma» | `IMPLEMENTERINGSPLAN.md` 1.6 («Dekning»), `Endpoints/Companies.cs` (coverage-alerts) | Bento, FAQ, `/for/hentefirma` |
| Statusflyt: mottatt, tildelt, planlagt, under henting, hentet, avvik, avbrutt | `IMPLEMENTERINGSPLAN.md` 1.6 | `/funksjoner` |
| Oppdragsbørs, ruteplan, sjåførforslag | `IMPLEMENTERINGSPLAN.md` 1.6 («Børs», «Rute», «Sjåførforslag») | Bento, `/for/hentefirma` |
| Henting bekreftes med minst ett bilde; kvittering med kg og CO₂ på e-post eller SMS | `Endpoints/Pickups.cs` (`/complete`), `Services/Pdf.cs` | «Slik virker det», FAQ |
| Merkelapp med QR som sjåføren skanner | `frontend/src/app/pickup/label.ts`, `GET /api/pickups/{id}/qr.svg` | Bento |
| 12 kategorier | `Seeder.DesignCategories` | «Hva kan meldes» i `/funksjoner` |
| Tidsvinduer 07–09, 09–12, 12–15, 15–18 | `Seeder.Slots` | `/funksjoner` |
| Vekt og CO₂: anslått kg per enhet per kategori, CO₂ = kg × 0,9 | `Services/Weight.cs`, `IMPLEMENTERINGSPLAN.md` 1.6 | Miljøseksjonen, alltid med ordet «anslag» |
| Eksport: CSV, Excel og PDF; statistikk per firma | `Endpoints/Export.cs`, `GET /companies/{id}/stats` | Bento, `/for/hentefirma` |
| Bilder lagres i databasen, maks 10 MB, vises bare for dem som kan se ordren | `DEPLOY.md` § 9 («Sikkerhet»), `Endpoints/Photos.cs` | `/personvern` |
| Innlogging med SMS-kode eller e-post og passord; passordreset; invitasjon | `Endpoints/Auth.cs` | FAQ, `/personvern` |
| PWA: kan legges på hjemskjermen, cachet liste uten nett, push-varsler | `frontend/ngsw-config.json`, `IMPLEMENTERINGSPLAN.md` fase 11 | FAQ, «Ærlig snakk» |
| Det den ikke gjør: ingen betaling, skjematisk kart (ikke ruting), ingen app i App Store, krever at et firma dekker kommunen | `IMPLEMENTERINGSPLAN.md` 1.6 («Rute»), 1.8, `DEPLOY.md` | Seksjonen «Ærlig snakk» |
| Kodetank AS, org.nr 922 973 075, Moss | `kodetank-no/src/consts.ts` (antatt, kapittel 1) | Bunntekst og `Organization`-skjema |

**Tekstene skrives i steg N6, ikke før.** Hver side får: H1 (én), inntil 2 linjer på desktop; ingress på maks 20 ord; seksjoner med overskrift på maks 8 ord og avsnitt på maks 25 ord.

---

## 4. Sidekart og nøkkelord

| Sti | Tittel-tag (maks 60 tegn) | Meta-beskrivelse (120–155 tegn) | Primære søkeord | Skjema |
|---|---|---|---|---|
| `/` | Returapp: enkel retur og gjenbruk fra byggeplassen | Meld materialer som skal ut i fem steg. Et hentefirma som dekker kommunen får beskjed, henter og bekrefter med bilde. Gratis for byggeplassen. | ombruk byggeplass, gjenbruk byggematerialer, henting byggematerialer, returapp | WebSite, Organization, SoftwareApplication, FAQPage |
| `/demo` | Prøv Returapp i nettleseren | Klikk deg gjennom appen med fiktive data: meld en henting, ta oppdrag som sjåfør, tildel som hentefirma, godkjenn som superbruker. Ingenting lagres. | demo returapp, prøv ombruksapp | WebPage, BreadcrumbList |
| `/funksjoner` | Funksjoner: melding, dekning, børs, rute, kvittering | Fem steg for giver, innboks og oppdragsbørs for hentefirma, dagens stopp og henting med bilde for sjåfør, kvittering med kg og CO₂-anslag. | melde henting, oppdragsbørs, ruteplan sjåfør, kvittering ombruk | WebPage, BreadcrumbList |
| `/for/byggeplass` | Returapp for byggeplassen | Ta bilde, si hvor mye og hvor det står. Hentefirmaet som dekker postnummeret får beskjed. Følg status, få kvittering. Uten konto får du SMS. | bli kvitt byggematerialer, ombruk anlegg, gratis henting materialer | WebPage, FAQPage, BreadcrumbList |
| `/for/hentefirma` | Returapp for hentefirma | Nye henteordre i innboksen, tildel sjåfør eller legg på børs, planlegg ruten, dokumenter hentingen med bilde, eksporter statistikk. Søk om å bli hentefirma. | hentefirma ombruk, ombruksaktør oppdrag, gjenbrukslager henting | WebPage, FAQPage, BreadcrumbList |
| `/personvern` | Personvern i Returapp og på returapp.no | Hva appen lagrer (kontaktinfo, adresser, bilder av materialer), hvem som ser det, og at nettsiden ikke bruker informasjonskapsler eller sporing. | personvern returapp | WebPage |
| `/kontakt` | Kontakt Returapp | Skriv til kontakt@returapp.no. Fortell om du melder fra en byggeplass eller vil hente, og hvilke kommuner det gjelder. | | ContactPage |
| `/404` | Fant ikke siden | | | |

Nav (én linje på desktop, maks 64 px høy): Funksjoner · For byggeplass · For hentefirma · Demo, pluss knappen «Meld henting» (til appen). Kontakt og personvern ligger i bunnteksten. Under 900 px: hamburger med samme rekkefølge.

Bunntekst: logo «Retur*app*» (som innloggingsskjermen), én setning om produktet, lenker til alle sider, `kontakt@returapp.no`, «Kodetank AS · org.nr 922 973 075», lenke til kodetank.no, lenke til `/personvern`. Ingen versjonsnummer.

---

## 5. Forsiden, seksjon for seksjon

Ni seksjoner, ni ulike layoutfamilier, tre eyebrows (demo, for hvem, miljø).

| # | Seksjon | Layoutfamilie | Innhold | Bevegelse (hensikt) |
|---|---|---|---|---|
| 1 | **Hero** (mørkt bånd i innloggingspaletten) | Asymmetrisk splitt 7/5, telefon til høyre | H1 «Enkel retur og gjenbruk fra byggeplassen.» (42 tegn) i 56 px vekt 800 på desktop, 36 px på mobil, én til to linjer. Ingress (maks 20 ord): «Ta bilde, si hvor mye og hvor det står. Et hentefirma i nærheten får beskjed, henter og bekrefter.» «Meld henting» (primær, lime som innloggingsknappen) og «Prøv demoen». Høyre: telefonrammen med giverens hjem-skjerm (`giver/home`), lys eller mørk etter systemet. Ingen eyebrow, ingen logovegg, ingen tagline under knappene. Toppavstand maks 96 px. Under 900 px: telefonen under teksten, beskåret til øverste 60 % så knappene forblir synlige uten rulling. | Telefonen glir 24 px opp og inn ved lasting (hierarki: øyet skal til produktet). Ingen hover-effekt. |
| 2 | **Se den før dere bestemmer dere** | Full bredde, medie | Eyebrow «Demo». Én telefonramme med plakatbilde og knappen «Prøv demoen» som laster demoen i en `iframe` på stedet (lazy). Tekst under: «Fiktive firma og hentinger. Hvilken som helst kode logger inn. Ingenting lagres.» | Innlasting av iframe skjer først ved klikk (ytelse). Myk overgang fra plakat til iframe. |
| 3 | **Slik virker det** | Vannrett trestegs-rekke med telefoner | «Meld» (fem steg: kategori, bilder, mengde og stand, sted og tid, oppsummering; skjermbilde `giver/new-2`), «Hent» (sjåføren ser dagens stopp, starter, tar bilde og bekrefter mengde; `driver/complete`), «Bekreft» (giver får kvittering med kg og CO₂-anslag; `giver/receipt`). Verb som etikett, ikke «Steg 1». | Telefonene glir inn i rekkefølge når seksjonen kommer i syne (fortelling: rekkefølgen er poenget). |
| 4 | **Alt som trengs, ingenting mer** | Bento, nøyaktig 6 celler (2+2+2 med én bred) | Meld henting (bilder fra kamera eller galleri, 12 kategorier, «gjenta forrige»), Dekning (postnummer til kommune, «varsle meg» når noen dekker, «tips et firma»), Oppdragsbørs (firmaets sjåfører tar oppdrag selv, med dag og tidsvindu), Ruteplan (dagens stopp i rekkefølge, sendes til sjåføren), Merkelapp og kvittering (QR på varen, kvittering som PDF, deles fra mobilen), Statistikk og eksport (kg og CO₂ per kategori, CSV, Excel og PDF). Tre celler bærer skjermbildeutsnitt, tre er tekst på tonet flate (`--tint`). | Cellene tones opp 60 ms etter hverandre (hierarki). Hover løfter ikke kortet; kun kant blir mørkere. |
| 5 | **To sider av samme henting** | To like kort side om side (1+1), stablet under 768 px | Eyebrow «For hvem». Venstre: «Byggeplass», tre setninger og «Meld henting» (primær) med pil-lenke til `/for/byggeplass`. Høyre: «Hentefirma», tre setninger og «Bli hentefirma» med pil-lenke til `/for/hentefirma`. Kortene er tonet (`--sf2`), ikke hvite, så seksjonen skiller seg fra bentoen. | Pilen flytter seg 4 px ved hover (tilbakemelding). |
| 6 | **Hver henting får et tall** | Overskrift øverst, tre store tall i en rad, tekst under | Eyebrow «Miljø». Tre tall fra demo-kvitteringen for én henting, merket «eksempel»: anslått vekt, CO₂-anslag, antall bilder. Under: én setning om hvordan tallene regnes: «Vekten anslås per kategori og enhet. CO₂ regnes som 0,9 kg per kg materiale holdt i bruk. Begge er anslag, og kvitteringen sier det.» Tall med `font-variant-numeric: tabular-nums`. Ingen totaler for plattformen; det finnes ingen ennå. | Ingen. |
| 7 | **Ærlig snakk: dette gjør den ikke** | Ren tekst, én kolonne, maks 65 tegn bredde | Fem punkter: ingen betaling eller oppgjør, prisen avtales utenfor appen; kartet er skjematisk, navigasjon skjer i telefonens kartapp; ingen henting der ingen hentefirma dekker kommunen, men «varsle meg» virker; ingen app i App Store, den legges på hjemskjermen fra nettleseren; ingen garanti for at alt blir hentet, hentefirmaet bestemmer. | Ingen. |
| 8 | **Spørsmål og svar** | Native `<details>`-trekkspill | 7 spørsmål: Koster det noe? Hvem henter? Hva om ingen dekker postnummeret mitt? Trenger jeg konto? Hva skjer med bildene? Hvordan blir vi hentefirma? Virker den på mobil uten app-butikk? Svarene hentes fra kapittel 3. | Nettleserens egen åpning; høyde animeres ikke. |
| 9 | **Har dere noe som skal ut?** (mørkt bånd) | CTA-bånd | Én setning, «Meld henting» og «Bli hentefirma». Deretter bunntekst. | Ingen. |

Rekkefølgen er valgt for at seksjon 3 og 4 ikke skal bli to bilde-tekst-splitter på rad, for at målgruppevalget (5) kommer etter at leseren har sett hva appen gjør, og for at «ærlig snakk» kommer før spørsmålene.

**`/for/*`-sidene** deler én mal med samme komponenter: hero med rollens egen skjerm (byggeplass: `giver/new-4`; hentefirma: `admin/inbox`), «Slik virker det» for rollen (tre verb), en kort liste over hva rollen får (fra kapittel 3), en FAQ med tre spørsmål, og rollens CTA. `/for/hentefirma` har i tillegg et avsnitt om søknaden: skjemaet i appen (`/apply`) med navn, org.nr, by, telefon, kontaktperson, e-post og kommuner; superbruker godkjenner; firmaet får beskjed og begynner å motta ordre i kommunene det dekker. Sjåførene inviteres av firmaet med SMS.

---

## 6. Steg for steg

Hvert steg har «Gjør», «Filer», «Test», «Ferdig når» og «Innsjekk». N1 og N3 kan gjøres parallelt med N2 og N4. Alt arbeid i branch `opd`. Innsjekksmeldinger bruker prefikset `nettside:` fordi dette er utenfor fasene i `IMPLEMENTERINGSPLAN.md`; steg N10 legger til en henvisning som fase 14.

### N1. Pakk ut designprototypen og gjør den selvforsynt

Prototypen er ikke vanlig HTML. Den er en «Bundled Page» fra designverktøyet (`IMPLEMENTERINGSPLAN.md` 1.1): en innpakning med et base64+gzip-manifest (React 18.3.1, ReactDOM, Babel standalone 7.29, Figtree som woff2), selve appen som en JSON-escapet HTML-streng, og `ext_resources` som peker til `unpkg.com` og `fonts.googleapis.com`. Slik den er kan den verken redigeres for hånd eller ligge bak en CSP med `script-src 'self'`.

**Gjør**
- Skriv `nettside/skript/demo-pakk-ut.mjs` (Node, ingen avhengigheter) som dekoder manifest og mal til én vanlig, lesbar HTML-fil: `<style>` med tokens, inline demo-data (`window.RA`), inline React og ReactDOM, fontene som `@font-face` med base64, og komponenten ferdig kompilert fra JSX til vanlig JavaScript én gang ved utpakking (Babel kjøres i skriptet, aldri i nettleseren). Alle `ext_resources` fjernes. Størrelsen blir omtrent som i dag (1,2 MB), uten Babel omtrent 0,8 MB.
- `IOSDevice`-rammen (16 KB, `IMPLEMENTERINGSPLAN.md` 1.1) tas bort: appen fyller iframen på 402×874, og nettsiden legger sin egen telefonramme rundt, den samme som rundt skjermbildene. Props settes til `theme` fra `prefers-color-scheme` i iframen og `startLoggedIn: false`, så besøkende ser innloggingen og rollevalget, slik appen gjør.
- Teksten «Demo: hvilken som helst kode fungerer» på kodeskjermen beholdes. Den er sann i demoen og fjernes bare i appen.
- `<html lang="nb">`, `<title>Returapp · Demo</title>`, `<meta name="robots" content="noindex">` (siden `/demo` indekseres, ikke selve app-filen), `<meta name="viewport">`.
- Skriv den utpakkede filen til `docs/design/Returapp-demo.html`. `Returapp-standalone.html` beholdes uendret, fordi `frontend/e2e/reference/capture-prototype.spec.ts` og de 46 referansebildene bygger på den.
- Kontroller at ingen ekte org.nr, kontonummer eller personer forekommer i demo-dataene. Seeden bruker fiktive org.nr (923456789, 918222111, 931555777); prototypens `window.RA` sjekkes på samme måte.

**Filer:** `nettside/skript/demo-pakk-ut.mjs`, `docs/design/Returapp-demo.html`.

**Test:** `nettside/skript/demo-sjekk.ts` (Playwright) åpner den utpakkede filen med `file://` uten nett (`context.route('**', abort)` for alt utenfor `file://`), logger inn, går gjennom de fire rollene og tar ett skjermbilde per rotskjerm. Skjermbildene sammenlignes med de 46 referansebildene fra den opprinnelige prototypen med samme pixelmatch-terskel (1 %) som `frontend/e2e/visual/`, ved å gjenbruke skjermkatalogen `screens.ts` og `Proto`-hjelperne.

**Ferdig når** filen åpner uten nett, ser identisk ut, og kan leses og redigeres i en vanlig editor.

**Innsjekk:** `nettside: designprototypen pakket ut til selvforsynt demo`.

**Hvis utpakkingen feiler** (kjøretiden krever manifestet): behold bundle-formatet, la skriptet bare bytte `ext_resources` mot de innpakkede ressursene og fjerne `IOSDevice`. Da er filen fortsatt uleselig, men selvforsynt, og resten av planen er uendret.

### N2. Opprett prosjektet `nettside/`

**Gjør**
- `npm create astro@latest` i `nettside/` med malen «minimal», TypeScript «strict», ingen integrasjoner ut over det som legges til under. Astro er 7.3.5 på npm i dag; lås `^7.3`. kodetank.no ligger på Astro 5 og nabotavle.no på Astro 5; det er ingen grunn til å matche dem, men `package.json` følger samme oppsett (`type: module`, skriptene `dev`, `build`, `preview`, `check`).
- Repoet `kodetank-no` (`~/Documents/_git/kodetank-no`) er forbildet for struktur: `src/consts.ts` for URL, firmanavn og e-post, `src/styles/global.css`, `src/layouts/Layout.astro`, `infra/` for drift. Repoet `nabotavle` (`apps/nettside/src/pages/demo.astro`) er forbildet for demo-iframen. Kopier mønsteret, ikke filene; fargene og fonten skal være appens.
- Avhengigheter: `astro`, `@astrojs/sitemap`, `@astrojs/check`, `sharp` (bildetjeneste), `typescript`, `@playwright/test` (dev, samme versjon som `frontend/`). Ingen Tailwind, ingen React, ingen animasjonsbibliotek, ingen fontpakke: Figtree hentes fra `frontend/public/fonts/figtree-latin.woff2` og `figtree-latin-ext.woff2` ved bygg (`prebuild` kopierer til `nettside/public/fonts/`), med samme `@font-face`-regler som `frontend/src/styles.css`. Samme filer som appen, ingen forespørsel til Google.
- `astro.config.mjs`: `site: 'https://returapp.no'`, `trailingSlash: 'never'`, `build.format: 'file'` (gir `/funksjoner` uten skråstrek og samsvarer med `canonical`), `prefetch: { prefetchAll: true, defaultStrategy: 'hover' }`, `integrations: [sitemap({ filter })]`.
- Skript i `nettside/package.json`: `dev`, `build` (kjører `astro check` først), `preview`, `prebuild` og `predev` som kopierer demoen og fontene (`skript/kopier-inn.mjs`), `skjermbilder` (N3), `sjekk` (N8).
- `.gitignore` i repo-roten: `nettside/node_modules/`, `nettside/dist/`, `nettside/.astro/`, `nettside/public/demo/`, `nettside/public/fonts/`.
- `.dockerignore` i repo-roten utelater i dag hele `docs/`. Docker-bygget i N9 trenger `docs/design/Returapp-demo.html`; legg til `!docs/design/Returapp-demo.html` etter `docs`-linjen. `**/node_modules`, `**/dist` og `**/.angular` dekker allerede `nettside/`.
- Node: 24 i Dockerfilen og i CI, som `infra/web/Dockerfile` og `frontend`-jobben. Astro 7 krever Node 22.12 eller nyere; skriv det i `nettside/README.md` (fem linjer: hva, hvordan kjøre, hvordan bygge, hvor skjermbildene kommer fra, hvor demoen kommer fra).

**Filer:** `nettside/package.json`, `nettside/astro.config.mjs`, `nettside/tsconfig.json`, `nettside/README.md`, `nettside/src/consts.ts`, `nettside/skript/kopier-inn.mjs`, `.gitignore`, `.dockerignore`.

**Test:** `npm --prefix nettside run build` gir `nettside/dist/index.html`; `npm --prefix nettside run dev` starter på port 4321 uten å kollidere med 4200 eller 5080.

**Ferdig når** en tom side bygger, og Figtree serveres fra `dist/fonts/` uten noen forespørsel ut av domenet.

**Innsjekk:** `nettside: astro-prosjekt med appens font og sitemap`.

### N3. Skjermbilder fra den ekte appen

Siden skal vise appen, ikke tegninger av den. Skjermbildene tas av et skript som kan kjøres på nytt hver gang appen endrer seg, og som gjenbruker skjermkatalogen den visuelle testen allerede har.

**Gjør**
- `nettside/skript/skjermbilder.ts` (Playwright) importerer `ScreenDef`-listen fra `frontend/e2e/visual/screens.ts` (brukere, roller, URL-er og klikk per skjerm finnes der allerede), kaller `POST /api/dev/reset-demo` først (som den visuelle testen gjør, så datoer og tall er stabile), logger inn med `loginAs` fra `frontend/e2e/helpers.ts`, og tar bilde av `.app`-elementet for et utvalg skjermer i begge temaer.
- Kjøres mot lokal API (`dotnet run`, port 5080, `App__DevEndpoints=true`) og `ng serve --no-hmr` på 4200, som `frontend/playwright.config.ts` starter selv. Viewport 402×874, `deviceScaleFactor: 3`, `reducedMotion: 'reduce'`.
- Utvalg (12 skjermer × 2 temaer): `giver/home`, `giver/new-2`, `giver/new-4`, `giver/detail`, `giver/receipt`, `giver/label`, `driver/today`, `driver/market`, `driver/complete`, `admin/inbox`, `admin/routes`, `admin/stats`. Superbruker vises bare i demoen.
- Lagres som PNG i `nettside/src/assets/skjermbilder/<tema>/<rolle>-<skjerm>.png`; Astro lager AVIF og WebP i riktige bredder ved bygg. Bare PNG-ene sjekkes inn (24 filer på 100–300 KB).
- Skriv datoen og commit-id-en appen hadde i `nettside/src/assets/skjermbilder/README.md`, så det er lett å se når de ble tatt.

**Filer:** `nettside/skript/skjermbilder.ts`, `nettside/src/assets/skjermbilder/**/*.png` og `README.md`.

**Test:** skriptet feiler høyt hvis et bilde mangler eller ikke er 1206×2622 px (402×874 × 3).

**Ferdig når** alle bildene på forsiden er fra appen, og ett kjørt skript gjenskaper dem.

**Innsjekk:** `nettside: skjermbilder fra appen med playwright`.

### N4. Designtokens, layout og felleskomponenter

**Gjør**
- Del `frontend/src/styles.css` i to: `frontend/src/tokens.css` med bare de to `[data-theme]`-linjene (lys og mørk) og resten som før med `@import './tokens.css'` øverst. Nettsiden importerer samme fil fra `../frontend/src/tokens.css`. Én sannhet for fargene. Endringen i `frontend/` er ren flytting og bekreftes med `npm --prefix frontend run build`, `npm --prefix frontend test` og de visuelle e2e-testene.
- Nettsiden setter `data-theme` på `<html>` med ett inline-skript på tre linjer før stilene lastes (`matchMedia('(prefers-color-scheme: dark)')`), så tokens-filen virker uendret og det ikke blinker ved lasting. Tema-endring i systemet følges med en `change`-lytter.
- `nettside/src/styles/global.css`: nettsidens egne tilleggstokens, som ikke finnes i appen: typografisk skala (16 px brødtekst, 1.5 linjehøyde, H1 40/48/56 px etter bredde, H2 28/36, H3 20, alle vekt 800 som appens seksjonstitler), avstander (seksjoner 96 px desktop, 64 px mobil), maks bredde 1120 px, radius 18/14/999, skygge `--sh` fra appen, mørkt bånd (`--mork #1B4D2B`, `--mork-tekst #FFFFFF`, `--mork-aksent #B7E39B`, fra innloggingsskjermen), bevegelse (`--varighet-kort 180ms`, `--varighet-inn 280ms`, `--kurve cubic-bezier(.2,.8,.2,1)`, hentet fra `ra-up`). Fokusring 2 px `--pri` med 2 px offset på alt som kan fokuseres.
- `src/layouts/Base.astro`: `<html lang="nb">`, tema-skriptet, `<Seo>`-komponenten (N7), `@font-face` og `<link rel="preload">` for `figtree-latin.woff2` (som `frontend/src/index.html`), nav, `<main>`, bunntekst, `<Reveal>`-skriptet (under). `@view-transition { navigation: auto }` i CSS gir myk overgang mellom sider uten JavaScript i nettlesere som støtter det, og ingenting i de andre.
- Komponenter (Astro, ingen klientkode med mindre nevnt): `Nav.astro` (hamburger under 900 px med en `<details>`-basert meny, ingen JavaScript), `Footer.astro`, `Knapp.astro` (primær `--pri`, lime på mørkt bånd, sekundær med kant, alltid én linje, høyde 50 px som appens primærknapp, `:active` skalerer til 0.98), `Seksjon.astro` (bredde, avstand, valgfritt mørkt bånd), `Eyebrow.astro` (brukes maks 3 ganger; komponenten teller ikke, sjekken i N8 gjør det), `Telefon.astro` (rammen: ytre skall 402×874 i forhold, radius 44 px, 1 px hårlinje i `--bd`, 8 px innvendig luft, indre flate med radius 36 px og `overflow: hidden`; tar enten to bilder (lyst og mørkt) som den gjør om med `getImage()` fra `astro:assets` (`widths [402, 804, 1206]`, `formats ['avif', 'webp']`) og skriver som ett håndskrevet `<picture>` med `<source media="(prefers-color-scheme: dark)">`, fordi `<Picture>`-komponenten ikke kan velge kilde per tema selv, eller en `<slot>` for demo-iframen; `alt` obligatorisk), `Faq.astro` (`<details>`/`<summary>`), `Reveal.astro` (wrapper som setter `data-reveal`).
- Bevegelse: ett skript på 25 linjer i `Base.astro` med `IntersectionObserver` som legger klassen `er-synlig` på `[data-reveal]` én gang (`threshold 0.2`). CSS: `opacity 0` og `translateY(24px)` til `1` og `0` over `--varighet-inn` med `--kurve` (samme tall som `ra-up`), forsinkelse `calc(var(--i) * 60ms)` for søsken. Hover- og trykktilstander bruker `--varighet-kort`, og utganger er kortere enn innganger. Alt inne i `@media (prefers-reduced-motion: no-preference)`; uten den er alt synlig fra start. Bare `transform` og `opacity` animeres. Ingen `scroll`-lyttere, ingen parallakse, ingen evige løkker, ingen `blur`-filtre.
- Berøring og tastatur: alle klikkbare flater er minst 44×44 px, `touch-action: manipulation` på knapper og lenker, en «Hopp til innholdet»-lenke først i `<body>`, `cursor: pointer` på alt som kan klikkes, og `font-variant-numeric: tabular-nums` på tall.

**Filer:** `frontend/src/tokens.css`, `frontend/src/styles.css`, `nettside/src/styles/global.css`, `nettside/src/layouts/Base.astro`, `nettside/src/components/*.astro`.

**Test:** `npm --prefix frontend run build`, `npm --prefix frontend test` og `npm --prefix frontend run e2e` grønne etter delingen av `styles.css`. Playwright i N8 kontrollerer at nav ligger på én linje ved 1024 px, at ingen element har `transform` når `reducedMotion: 'reduce'` er satt, at fokusring er synlig ved tastaturnavigasjon, og at `data-theme` blir `dark` med `colorScheme: 'dark'`.

**Ferdig når** en tom side med nav, én seksjon og bunntekst ser ut som appens slektning i begge temaer: samme farger, samme font, samme radius.

**Innsjekk:** `nettside: tokens delt med frontend, layout og komponenter`.

### N5. Demoen inn i nettsiden

**Gjør**
- `nettside/skript/kopier-inn.mjs` (kjøres av `prebuild` og `predev`) kopierer `docs/design/Returapp-demo.html` til `nettside/public/demo/app.html` og fontene fra `frontend/public/fonts/`. Mappene er ignorert av git; Docker-bygget kjører `prebuild` selv (`npm run build`).
- `src/pages/demo.astro`: kort ingress, `Telefon.astro` med `iframe` som lastes ved klikk på «Prøv demoen» (plakatbilde `giver/home` i mellomtiden), knappene «Åpne i eget vindu» og «Start på nytt» (setter `src` på nytt). Adressen er `/demo/app` uten `.html`: nginx-oppsettet fra kodetank.no omdirigerer alle `.html`-adresser til rene adresser og finner filen med `try_files $uri.html`. Ingen `iframe` skal peke på en adresse som gir 301. `iframe` får `title`, `loading="lazy"` og `sandbox="allow-scripts allow-same-origin"` (demoen trenger ikke skjema, popup eller lagring). Ved siden av telefonen på desktop, under den på mobil: fire korte avsnitt, ett per rolle, om hva som er verdt å prøve («Meld en henting som Byggeplass», «Ta et oppdrag fra børsen som Sjåfør», «Tildel og planlegg som Retur-admin», «Godkjenn Sirkula Sør som Superbruker»). Rollen velges inne i demoen på «Hvem er du i dag?», som i appen.
- Forsidens seksjon 2 gjenbruker samme komponent (`Demo.astro`) med plakat og knapp.
- Sikkerhetshodene i `nginx.conf` (N9) må tillate innramming fra eget domene: `frame-ancestors 'self'` i CSP og `X-Frame-Options "SAMEORIGIN"`, ikke `DENY` som på kodetank.no. Ellers blokkeres iframen.

**Filer:** `nettside/skript/kopier-inn.mjs`, `nettside/src/components/Demo.astro`, `nettside/src/pages/demo.astro`.

**Test:** Playwright: `/demo` laster, klikk på «Prøv demoen», vent på iframen, logg inn i den med et vilkårlig nummer og kode, velg «Byggeplass / giver» og se hjem-skjermen; ingen konsollfeil; ingen forespørsler til andre domener (fang `request` og feil på alt som ikke er `returapp.no` eller `localhost`).

**Ferdig når** demoen kan brukes fra `/demo` og fra forsiden, og fra eget vindu, i begge temaer.

**Innsjekk:** `nettside: demo-side med innebygd prototype`.

### N6. Sider og tekst

**Gjør**
- Skriv tekstene i `nettside/src/innhold/*.ts` (typede objekter per side: tittel, beskrivelse, seksjoner, spørsmål og svar), ikke inne i `.astro`-filene. Da kan tekst rettes uten å røre oppsett, og N8 kan lese all synlig tekst mekanisk.
- Forsiden etter kapittel 5. Undersidene etter kapittel 4, med samme komponenter og maks tre layoutfamilier per underside. `/for/*`-sidene deler én mal (`src/pages/for/[gruppe].astro` med `getStaticPaths`) og har egen FAQ med tre spørsmål hver, egen H1 og eget skjermbilde.
- Miljøtallene i seksjon 6 leses fra ett objekt i `src/innhold/miljo.ts` med kommentaren `// eksempel fra demo-kvitteringen R-2030, ikke produksjonsdata`. CO₂-faktoren 0,9 skrives som tekst med henvisning til `Services/Weight.cs` i en kommentar; endres faktoren i appen, må teksten endres for hånd, og N8 sjekker at tallet i teksten er det samme som i `Weight.cs`.
- `/kontakt`: e-postadressen som lenke med ferdig emne («Returapp: henvendelse»), og tre punkter om hva som er nyttig å ta med (byggeplass eller hentefirma, kommune, omtrent hvor ofte). Ingen skjema; support fra innloggede brukere går allerede gjennom appen (`POST /api/support`).
- `/personvern`: to deler. Appen: hva som lagres (navn, telefon, e-post, adresse for henting, bilder av materialer, meldinger), hvem som ser det (giver, hentefirmaet som har ordren, superbruker), at bilder ligger i databasen og bare kan hentes av dem som kan se ordren, at SMS sendes via Twilio og e-post via SMTP, at push-varsler er valgfrie, og at brukere kan be om sletting på `kontakt@returapp.no`. Nettsiden: ingen informasjonskapsler, ingen sporing, webserveren (nginx bak Traefik på Kodetanks Dokploy-vert) logger IP-adresser som vanlig. Dato. Oppdateres når statistikk avgjøres (spørsmål 4).
- `/404`: kort, lenke hjem og til demo.
- Tekstgjennomgang før innsjekk: les alle strenger høyt. Fjern alt som lyder som KI («elegant», «reise», forsert metafor). Tall må ha kilde i kapittel 3.

**Filer:** `nettside/src/innhold/*.ts`, `nettside/src/pages/*.astro`, `nettside/src/pages/for/[gruppe].astro`.

**Test:** N8-sjekken (én H1, tittel- og beskrivelseslengde, ingen tankestreker, ingen forbudte ord, CO₂-faktor lik `Weight.cs`). Playwright: alle lenker i nav og bunntekst gir 200; lenkene til `app.returapp.no` og `app.returapp.no/apply` finnes på forsiden.

**Ferdig når** alle sider i kapittel 4 finnes med ferdig tekst, og forsiden har alle ni seksjoner.

**Innsjekk:** `nettside: forside og undersider med tekst`.

### N7. SEO og metadata

**Gjør**
- `src/components/Seo.astro` tar inn `tittel`, `beskrivelse`, `sti`, `bilde` (valgfritt), `type` og `skjema` (liste av JSON-LD-objekter) og skriver: `<title>` (sidens tittel; forsiden uten suffiks, undersider med « | Returapp»), `description`, `canonical` (alltid `https://returapp.no` + sti, aldri med skråstrek på slutten), `robots` (`index, follow`; `noindex` på `/404`), `theme-color` per tema (`#1B4D2B` som appen, `#0F1512` for mørkt), `og:type`, `og:site_name` «Returapp», `og:locale nb_NO`, `og:title`, `og:description`, `og:url`, `og:image` (1200×630) med `width`, `height` og `alt`, `twitter:card summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`. Mønsteret er det samme som kodetank.no og nabotavle.no bruker i dag.
- Strukturerte data som JSON-LD, ett `<script>` per objekt:
  - `Organization` på alle sider: Kodetank AS, `legalName`, `url https://kodetank.no`, `logo`, `email kontakt@returapp.no`, `areaServed NO`, `address` (Moss), `sameAs` (kodetank.no).
  - `WebSite` på forsiden med `inLanguage nb-NO`.
  - `SoftwareApplication` på forsiden og `/funksjoner`: `name Returapp`, `applicationCategory BusinessApplication`, `operatingSystem "Web (PWA)"`, `url https://app.returapp.no`, `featureList`, `isAccessibleForFree true`, `offers` med `price 0` og `priceCurrency NOK` (gratis for giver, kapittel 1 spørsmål 3), `publisher` = Organization. Ingen `softwareVersion`; appen viser ikke versjonsnummer utad.
  - `FAQPage` på forsiden og `/for/*`, generert fra samme data som trekkspillet, så de aldri spriker.
  - `BreadcrumbList` på alle undersider.
- OG-bilder: `nettside/skript/og.mjs` (Playwright) rendrer `src/og/mal.html` (mørk bakgrunn `#1B4D2B`, logo «Retur*app*», sidetittel i Figtree 800, telefonutsnitt til høyre) til `public/og/<side>.png` for forsiden og hver underside. Kjøres manuelt når titler endres; bildene sjekkes inn.
- `public/robots.txt`: alt tillatt, `Sitemap: https://returapp.no/sitemap-index.xml`, og `Disallow: /demo/app` (app-filen har dessuten `noindex`).
- Sitemap fra `@astrojs/sitemap` med `filter` som utelater `/404`. `lastmod` fra bygg-tidspunkt er godt nok.
- Ikoner: appens eksisterende `frontend/public/icons/icon-192x192.png` og `icon-512x512.png` kopieres av `kopier-inn.mjs` til `public/icons/`; favicon som SVG av samme logo (`#1B4D2B`-flate, lime-merke) lages én gang. Ingen `site.webmanifest`; nettsiden er ikke en PWA, det er appen.
- Overskriftshierarki: én H1 per side, H2 per seksjon, H3 inni. Bilder har `alt` som beskriver hva skjermen viser («Giverens hjem-skjerm med knappen Meld henting og kategoriene»), ikke «skjermbilde».

**Filer:** `nettside/src/components/Seo.astro`, `nettside/skript/og.mjs`, `nettside/src/og/mal.html`, `nettside/public/og/*.png`, `nettside/public/robots.txt`, `nettside/public/favicon.svg`.

**Test:** N8-sjekken validerer alle feltene. Manuelt før lansering: Google Rich Results Test på forsiden og `/for/byggeplass`, og delingsforhåndsvisning (opengraph.xyz eller lignende) på tre sider.

**Ferdig når** alle sider har unik tittel, beskrivelse, canonical og OG-bilde, og JSON-LD validerer uten feil.

**Innsjekk:** `nettside: seo, strukturerte data og og-bilder`.

### N8. Kvalitetssjekk, ytelse og tilgjengelighet

Én kjørbar sjekk som feiler når planens regler brytes, slik `frontend/e2e/visual/` gjør for designet i appen.

**Gjør**
- `nettside/skript/sjekk-dist.mjs` (Node, ingen avhengigheter) går gjennom `dist/**/*.html` og feiler ved: mer enn én `<h1>`; `<title>` kortere enn 20 eller lengre enn 60 tegn; `description` kortere enn 80 eller lengre enn 160; manglende `canonical` eller canonical som ikke starter med `site`; `og:image` som ikke finnes i `dist/`; `lang` som ikke er `nb`; tegnene `—` eller `–` i synlig tekst (utenfor `<script>`, `<pre>` og tidsvinduene fra `Seeder.Slots`); ord fra en kort forbudsliste («sømløs», «neste generasjon», «revolusjoner», «kraftig», «elegant», «bærekraftig reise»); interne `href` og `src` som ikke finnes i `dist/`; `<img>` uten `alt`; mer enn 3 elementer med klassen fra `Eyebrow.astro` på forsiden; eksterne `<script>` eller `<link>` til andre domener; CO₂-faktoren i teksten ulik konstanten i `backend/src/Returapp.Api/Services/Weight.cs` (leses med regex).
- `nettside/tests/nettside.spec.ts` (Playwright, egen `playwright.config.ts` i `nettside/` som kjører `astro preview` på port 4322): hver side i kapittel 4 laster ved 390 px og 1440 px uten konsollfeil, i lyst og mørkt tema; nav er én linje ved 1024 px og under 64 px høy; FAQ åpner og lukker; demo-iframen laster og innloggingen i den virker; med `reducedMotion: 'reduce'` har ingen `[data-reveal]` en `transform` ulik `none`; tastaturet når alle lenker i nav med synlig fokus; ingen forespørsel går til et annet domene; hero-CTA-ene er synlige uten rulling ved 390×844.
- Ytelsesbudsjett for forsiden, målt med Lighthouse i Chrome mot `astro preview`: LCP under 1,5 s på «Slow 4G», CLS 0, TBT under 50 ms, total overføring under 600 KB uten demoen, alle fire kategorier 95 eller høyere. Hero-telefonen får `loading="eager"` og `fetchpriority="high"`; alle andre bilder `loading="lazy"`. Bare `figtree-latin.woff2` forhåndslastes.
- Tilgjengelighet: kontrast 4,5:1 på all tekst. Målt 28. september 2026 med WCAG-formelen på appens tokens: `--tx #182119` på `--bg #F3F4EF` gir 15,0:1; `--pri #2E7A45` på hvitt 5,3:1 og på `--bg` 4,8:1; `--tint-tx #1F5A31` på `--tint #DDEED9` 6,7:1; hvitt på `--pri` 5,3:1; lime `#B7E39B` på `#1B4D2B` 6,8:1 og hvitt på `#1B4D2B` 9,8:1; `#182119` på lime 11,4:1. Dempet `--mu #66716A` gir 5,1:1 på hvitt og 4,6:1 på `--bg`, men bare 4,3:1 på `--sf2 #EBEEE6`, som er for lite. Regel: dempet tekst på tonede kort (`--sf2`) bruker `--tx` med `opacity` 0.8 eller `--tint-tx`, aldri `--mu`. Mørkt tema: `--mu #93A096` gir 6,8:1 på `--bg` og 6,2:1 på `--sf`; `--pri #5DBA72` 7,7:1; `--tx` 16,2:1; alt godkjent. `sjekk-dist` kan ikke måle dette; det tas i Lighthouse (begge temaer) og ved manuell gjennomgang. Fokusring overalt, `<details>` for meny og FAQ, `aria-label` på telefonrammen og iframen, ingen tekst i bilder utenom skjermbildene (som har `alt`).
- Taste-skillens harde regler (kapittel 4.7 i skillen) gås gjennom punkt for punkt før innsjekk, og resultatet legges som en avkryssingsliste i `nettside/README.md`.

**Filer:** `nettside/skript/sjekk-dist.mjs`, `nettside/tests/nettside.spec.ts`, `nettside/playwright.config.ts`, `nettside/README.md`.

**Test:** dette steget er testen. `npm --prefix nettside run sjekk` kjører bygg, `sjekk-dist` og Playwright.

**Ferdig når** sjekken er grønn, Lighthouse-budsjettet er nådd i begge temaer, og listen i README er full.

**Innsjekk:** `nettside: sjekk av dist, playwright og lighthouse-budsjett`.

### N9. Dokploy, Dockerfile, nginx og domene

Samme fremgangsmåte som appens to andre applikasjoner (`DEPLOY.md` § 1) og kodetank.no: to filer i `infra/nettside/`, ingen compose, ingen miljøvariabler, ingen build-args. Byggkonteksten er repo-roten fordi bygget trenger `docs/design/Returapp-demo.html`, `frontend/src/tokens.css`, `frontend/public/fonts/` og `frontend/public/icons/`.

**Gjør**
- `infra/nettside/Dockerfile`, etter `kodetank-no/infra/Dockerfile` linje for linje, med disse endringene:
  - Steg 1 (`public.ecr.aws/docker/library/node:24-alpine`, som `infra/web/Dockerfile`): `WORKDIR /app/nettside`; kopier `nettside/package.json` og `nettside/package-lock.json`, `npm ci`; kopier `nettside/astro.config.mjs`, `nettside/tsconfig.json`, `nettside/public/`, `nettside/src/`, `nettside/skript/`; kopier også `docs/design/Returapp-demo.html`, `frontend/src/tokens.css`, `frontend/public/fonts/` og `frontend/public/icons/` til samme relative stier under `/app/`, så `../docs/…` og `../frontend/…` virker som lokalt. `npm run build` kjører `prebuild` (kopiering), `astro check` og `astro build`.
  - Steg 2 (`public.ecr.aws/nginx/nginx-unprivileged:alpine`, som `infra/web/Dockerfile`, så containeren ikke kjører som root): kopier `infra/nettside/nginx.conf` til `/etc/nginx/conf.d/default.conf` (vanlig fil, ikke mal: ingen variabler skal byttes inn), kopier `/app/nettside/dist` til `/usr/share/nginx/html`, `EXPOSE 80` (imaget lytter på 80 uten root), `HEALTHCHECK` mot `/` som `infra/web/`.
  - Kommentar øverst som i forbildet: byggkontekst er repo-roten, Dokploy-sti er `infra/nettside/Dockerfile`.
- `infra/nettside/nginx.conf`, etter `kodetank-no/infra/nginx.conf`, med disse endringene:
  - `server_name returapp.no www.returapp.no`, og en egen `server`-blokk for `www.returapp.no` som gir `return 301 https://returapp.no$request_uri`. Traefik sender begge domenene til containeren.
  - `X-Frame-Options "SAMEORIGIN"` og `frame-ancestors 'self'` (demoen rammes inn). Ellers samme hoder: `nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS, og CSP `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`. `data:` i `font-src` trengs av demoens innbakte fonter. Ingen Google-domener før statistikk er avgjort (spørsmål 4). `unsafe-inline` for skript trengs av Astros inline-skript, tema-skriptet og JSON-LD.
  - Headerne settes én gang på server-nivå, og `Cache-Control` velges med `map $uri`, samme grep som `infra/web/nginx.conf` bruker etter audit-funn 18. Da gjentas ingen `add_header` i location-blokkene.
  - Ingen `/en/`-blokker (bare norsk). Beholder omdirigeringene `index.html` → `/`, `.html` → ren adresse og skråstrek → uten, og `try_files $uri $uri.html $uri/index.html =404`. Det er derfor demoen ligger på `/demo/app` (N5).
  - `absolute_redirect off` beholdes (Traefik avslutter TLS foran).
  - Cache: `/_astro/` ett år `immutable`; `/fonts/`, `/icons/`, `/og/` og `svg` 30 dager; HTML `no-cache`. `gzip_types` som i forbildet.
  - `/demo/app` får `Cache-Control "no-cache"` og hodet `X-Robots-Tag "noindex"`, så en ny demo alltid lastes ved neste besøk.
- Dokploy (eieren gjør det, planen gir verdiene; føres inn i `DEPLOY.md` § 1 i N10): to nye applikasjoner i prosjektet `returapp`.

  | App i Dokploy | Branch | Dockerfile Path | Build Context | Port | Domene |
  |---|---|---|---|---|---|
  | `returapp-dev-nettside` | `opd` | `infra/nettside/Dockerfile` | `.` | 80 | `dev.returapp.no` |
  | `returapp-nettside` | `main` | `infra/nettside/Dockerfile` | `.` | 80 | `returapp.no` og `www.returapp.no` |

  Build Type **Dockerfile**; Environment tom; Networks røres ikke; HTTPS på, Let's Encrypt, HTTP→HTTPS-redirect på alle tre domenene; auto-deploy ved push; Update Config med rollback som i `DEPLOY.md` § 4 steg 6.
- DNS: A-poster for `returapp.no` (apex), `www.returapp.no` og `dev.returapp.no` til Dokploy-verten, som for `app` og `api`, før første deploy.
- `.github/workflows/ci.yml` får en egen jobb `nettside` (ubuntu, Node 24 som `frontend`): `npm ci` i `nettside/`, `npm run build`, `node skript/sjekk-dist.mjs`, `npx playwright install --with-deps chromium`, `npm test`, og til slutt `docker build -f infra/nettside/Dockerfile .` så Dockerfilen aldri råtner uten at noen merker det. Jobben trenger ikke databasen og kjører uavhengig av `backend` og `e2e`. Den kjører bare når `nettside/**`, `docs/design/Returapp-demo.html`, `frontend/src/tokens.css`, `frontend/public/fonts/**`, `frontend/public/icons/**`, `infra/nettside/**` eller `.dockerignore` er endret (`paths`-filter), så den ikke forsinker app-CI.
- Kodetank.no: legg til Returapp i produktlisten med lenke til `returapp.no` (gjøres i repoet `kodetank-no`; nevnes her fordi det er den viktigste innlenken).
- Appen: `frontend/src/app/auth/login.ts` får en liten lenke «Om Returapp» til `https://returapp.no` under «Meld henting uten konto», og `noreply@returapp.no`-e-postene fra API-et får `returapp.no` i bunnteksten. Begge er ordinære endringer i appen og tas som eget innsjekk med `app:`-prefiks, ikke `nettside:`.
- Google Search Console: verifiser domenet, send inn sitemap. Bing Webmaster Tools det samme. Gjøres av eieren.

**Filer:** `infra/nettside/Dockerfile`, `infra/nettside/nginx.conf`, `.github/workflows/ci.yml`.

**Test:** lokalt: `docker build -f infra/nettside/Dockerfile -t returapp-nettside .` og `docker run --rm -p 8082:80 returapp-nettside`, deretter `curl -I http://localhost:8082/funksjoner` (200 med alle hoder), `curl -I http://localhost:8082/funksjoner.html` (301 til `/funksjoner`), `curl -I -H 'Host: www.returapp.no' http://localhost:8082/` (301 til `https://returapp.no/`), `curl -I http://localhost:8082/demo/app` (200, `X-Robots-Tag: noindex`), `curl -I http://localhost:8082/finnes-ikke` (404 med egen side), og Playwright-settet fra N8 mot port 8082 (`E2E_BASE_URL`, samme mønster som `frontend/`). Etter deploy: samme mot `https://dev.returapp.no`; securityheaders.com gir A.

**Ferdig når** siden svarer på kanonisk adresse over HTTPS med alle hoder fra Dokploy, `www` går 301 til apex, og et push til `main` gir ny versjon uten manuelle steg.

**Innsjekk:** `nettside: dockerfile og nginx for dokploy, ci-jobb`.

### N10. Repo-integrasjon og dokumentasjon

**Gjør**
- `README.md`: `nettside/` inn i «Kom i gang» med tre linjer (`npm --prefix nettside install`, `npm --prefix nettside run dev`, `npm --prefix nettside run sjekk`), og lenke til denne planen ved siden av `IMPLEMENTERINGSPLAN.md` og `DEPLOY.md`.
- `DEPLOY.md`: de to nettside-appene inn i tabellen i § 1, én linje i § 3 («Nettside: ingen variabler»), `dev.returapp.no` og `returapp.no` inn i DNS-listen i § 4 og § 8, og `curl -I https://returapp.no` i røyktesten i § 5. Setningen «`returapp.no` uten subdomene er reservert for en egen nettside» byttes til en henvisning hit.
- `IMPLEMENTERINGSPLAN.md`: nytt punkt «Fase 14: Nettside» etter fase 13 med tre linjer og henvisning hit, og en linje i endringsloggen i 7.5.
- `.dockerignore` og `.gitignore` er allerede endret i N2; kontroller at `docker build` for `infra/api` og `infra/web` fortsatt får samme kontekststørrelse (`docs/` er fortsatt utelatt, bare demo-filen slipper gjennom).

**Filer:** `README.md`, `DEPLOY.md`, `IMPLEMENTERINGSPLAN.md`.

**Test:** ingen. Les korrektur.

**Ferdig når** en ny utvikler finner nettsiden fra README på under ett minutt, og `DEPLOY.md` beskriver alle seks Dokploy-appene.

**Innsjekk:** `nettside: dokumentasjon og fase 14`.

---

## 7. Rekkefølge og anslag

| Steg | Avhenger av | Anslag |
|---|---|---|
| N1 Pakk ut prototypen | ingen | 3–4 timer, mest verifisering mot de 46 referansebildene |
| N2 Prosjekt | ingen | 2 timer |
| N3 Skjermbilder | app kjører lokalt | 2–3 timer (skjermkatalogen finnes) |
| N4 Tokens og komponenter | N2 | 1 dag |
| N5 Demo inn | N1, N2, N4 | 3 timer |
| N6 Sider og tekst | N3, N4 | 1,5 dag, tekst er det meste |
| N7 SEO | N6 | 3 timer |
| N8 Sjekk | N5–N7 | 1 dag |
| N9 Dokploy og CI | N8 | 3 timer pluss Dokploy-oppsett og DNS hos eieren |
| N10 Repo | alt | 1 time |

Samlet: omtrent 6 arbeidsdager. Kritisk sti: N1 → N5 → N8. Tekst (N6) kan begynne når N3 har gitt de første bildene. Mindre enn Kodetank-planen fordi det ikke finnes noen brukerveiledning å publisere, ingen prisside, og fordi skjermkatalogen, visuelle tester, fonter, ikoner og et nginx-oppsett med `map` allerede finnes i repoet.

---

## 8. Lanseringssjekk

Gås gjennom mot Docker-bildet lokalt eller `dev.returapp.no` før DNS for `returapp.no` pekes.

- [ ] Eierens svar på kapittel 1 er ført inn som «Endret i 1.1», og postkassen `kontakt@returapp.no` finnes og leses.
- [ ] Alle sider i kapittel 4 finnes, med unik tittel, beskrivelse og OG-bilde.
- [ ] `sjekk-dist`, Playwright og `docker build` grønne i CI.
- [ ] Lighthouse 95+ på forsiden, `/for/byggeplass` og `/demo` i mobil og desktop, lyst og mørkt.
- [ ] Demoen virker i Safari, Chrome og Firefox, i iframe og i eget vindu, uten forespørsler ut.
- [ ] Ingen tankestreker utenom tidsvinduene, ingen «steg 1», ingen versjonsnummer, ingen oppdiktede tall eller kunder.
- [ ] Alle tall har kilde i kapittel 3, og CO₂-faktoren er den samme som i `Services/Weight.cs`.
- [ ] «Meld henting» går til `https://app.returapp.no` og «Bli hentefirma» til `https://app.returapp.no/apply`, og begge svarer 200 i prod.
- [ ] `kontakt@returapp.no` virker som lenke med emne på alle kontaktpunkter.
- [ ] Rich Results Test uten feil på `/` og `/for/byggeplass`.
- [ ] `curl -I` på `/funksjoner.html` gir 301 til `/funksjoner`; `www.returapp.no` gir 301 til `returapp.no`; `/demo/app` gir 200 med `noindex`.
- [ ] securityheaders.com gir A.
- [ ] Sitemap sendt til Search Console og Bing.
- [ ] Lenke fra kodetank.no og fra appens innloggingsskjerm er på plass.
- [ ] `nettside/README.md` har taste-skillens avkryssingsliste ferdig utfylt.

---

## 9. Det som er valgt bort, og når det tas

| Valgt bort | Tas når |
|---|---|
| Prisside | eieren bestemmer en prismodell for hentefirma; da `/priser` med `Offer` i strukturerte data, etter mønsteret i Kodetank-planen |
| Tema-bryter på siden | noen ber om det; `data-theme` og tokens er allerede på plass, bryteren er ti linjer og `localStorage` |
| Engelsk | eieren ber om det; da `i18n` med `/en/` og `hreflang`, samme oppsett som kodetank.no |
| Kontaktskjema | `mailto:` gir for lite; da `POST /api/support` i API-et med en offentlig variant, og `/api`-proxy i `nginx.conf` etter `infra/web/`-mønsteret |
| Statistikk | eieren avgjør; da `Tracking.astro` med GTM og Consent Mode v2 som på kodetank.no, CSP utvidet, samtykkebanner, og en linje i `/personvern` |
| Brukerveiledning | det finnes en å publisere; da en innholdssamling som leser fra `docs/`, som i Kodetank-planen N9 |
| Kundesitater og logoer | en ekte kunde har gitt et sitat med navn og tillatelse |
| Blogg eller nyheter | det finnes tre ting å skrive om; da en samling `nyheter` i `content.config.ts` |
| Rollevalg via URL i demoen (`/demo?rolle=sjafor`) | besøkende faller av på innloggingen i demoen; da en prop i den utpakkede filen lest fra `location.search` |
| Animasjonsbibliotek | CSS og én observer ikke strekker til; da `motion` (vanilla) slik nabotavle.no bruker |
| Astros `security.csp` (stabil siden Astro 6) | `unsafe-inline` skal bort fra hodene; da flyttes CSP-en fra `nginx.conf` til Astro-konfigen, som skriver hasher for inline-skriptene selv |
| React-øyer | noe interaktivt ut over demoen trengs; ingen slik er planlagt |

---

## 10. Pussing fra andre skills, og hva som ble forkastet

Planen ble gått gjennom mot taste-skillen og de to andre designskillene etter første utkast. Det som passet produktet er ført inn over; resten er forkastet med grunn, så ingen tar det inn igjen senere uten å vite hvorfor.

**Tatt inn**

- Én telefonramme (`Telefon.astro`) for både skjermbilder og demo, med konsentriske radier (44 ute, 36 inne). Gir fysisk dybde uten glass eller glød, og gjør at demoen og bildene ser ut som samme ting.
- Appens egen kurve og varighet (`ra-up`) som eneste bevegelsesrytme på siden. Innganger 280 ms, mikrointeraksjoner 180 ms, utganger kortere enn innganger.
- Forskyvning på 60 ms mellom søsken i lister og bento.
- Berøringsmål 44 px, `touch-action: manipulation`, hopp-lenke, tabulære tall.
- Kontrast målt med formel, ikke antatt. Det avslørte at appens dempede grå er for lys på tonede kort (`--sf2`), i begge temaer bare i lyst.
- Kontroll av hero mot viewport: H1 på 42 tegn får plass på to linjer ved 56 px i 7/12 bredde; telefonen beskjæres på mobil så knappene ikke havner under folden.

**Forkastet**

- Laptop- eller nettleserramme rundt skjermbildene. Appen er en telefonflate; en laptopramme ville lyve om produktet.
- Flytende «pille»-nav løsrevet fra toppen, glassfilter og skjermfyllende meny. Taste-skillen setter 64–80 px enkel nav, og målgruppen er ikke et byrå.
- Eyebrow-merke foran hver H1 og H2. Taste-skillen begrenser til maks én per tre seksjoner; forsiden har tre.
- Display-serif i overskrifter, mesh-gradienter, lilla glød. Produktet har allerede en palett og en font.
- Store miljøtall for plattformen («tonn spart»). Det finnes ingen produksjonsdata, og oppdiktede totaler er akkurat det taste-skillen og kapittel 2 forbyr.
- Innganger på 800 ms med `blur`. For tregt for en side som skal føles rask, og `blur` koster på mobil.
- Demo av den ekte appen i dev-miljøet i stedet for prototypen. Dev sender ekte SMS-koder gjennom `Console`-leverandøren, krever ekte innlogging, og deler database med testene. Prototypen er pixel-lik appen (visuelle tester, 1 % terskel) og lagrer ingenting.

---

## 11. Kilder brukt i planen

- `IMPLEMENTERINGSPLAN.md` (1.1 prototypens format, 1.2 tokens, 1.4 roller, 1.5 skjermer, 1.6 forretningsregler, 1.7 mock som ble ekte, 2.8 Dokploy), `README.md`, `DEPLOY.md`, `dockploy-way.md`, `PONYTAIL-AUDIT.md` (funn 18, nginx med `map`).
- `frontend/src/styles.css` (tokens, `@font-face`, `ra-up`), `frontend/src/index.html`, `frontend/public/fonts/`, `frontend/public/icons/`, `frontend/e2e/visual/screens.ts` (46 skjermer), `frontend/e2e/reference/capture-prototype.spec.ts`, `frontend/e2e/helpers.ts`, `frontend/playwright.config.ts`, `frontend/src/app/app.routes.ts` (`/apply`, `/p/:id/label`).
- `backend/src/Returapp.Api/Seed/Seeder.cs` (12 kategorier, 4 tidsvinduer, fiktive firma), `Services/Weight.cs` (CO₂ 0,9), `Services/Notify.cs`, `Endpoints/Pickups.cs`, `Endpoints/Export.cs`, `Endpoints/Companies.cs`.
- `docs/design/Returapp-standalone.html` (analysert 28. september 2026: `ext_resources` til unpkg.com og fonts.googleapis.com, React 18.3.1, Babel 7.29, Figtree, `IOSDevice`), `docs/design/screens/` (46 skjermer × 2 temaer).
- `infra/web/Dockerfile` og `infra/web/nginx.conf` (nginx-unprivileged, `map $uri $cache_control`, headere på server-nivå), `infra/api/Dockerfile`, `.github/workflows/ci.yml`, `.dockerignore`.
- Repoet `kodetank-no` (`~/Documents/_git/kodetank-no`): `infra/Dockerfile`, `infra/nginx.conf`, `README.md` («Deploy (Dokploy)»), `astro.config.mjs`, `src/consts.ts`.
- Repoet `nabotavle` (`~/Documents/_git/nabotavle`): `infra/nettside/Dockerfile`, `apps/nettside/src/pages/demo.astro` (iframe opprettet ved klikk).
- Repoet `kodetank-lokal`: `docs/nettside-plan.md` v1.1 (malen for dette dokumentet).
- npm 28. september 2026: astro 7.3.5, @astrojs/sitemap 3.7.4, @astrojs/check 0.9.10, sharp 0.35.5.
- Taste-skillen (`design-taste-frontend`) for designlesning, dialer og de harde reglene i kapittel 4.7.
- Kontrastmålinger 28. september 2026 med WCAG 2-formelen på tokens fra `frontend/src/styles.css` (tallene i N8).

---

## 12. Validering av planen

Gjort 28. september 2026, før planen ble sjekket inn.

| Sjekk | Metode | Resultat |
|---|---|---|
| Alle stier i planen som skal finnes i dag, finnes | Skript: hver `kode`-sti som begynner på `frontend/`, `backend/`, `infra/`, `docs/`, `.github/` eller en rotfil, testet med `test -e`. Stier under `nettside/`, `infra/nettside/`, `docs/design/Returapp-demo.html` og `frontend/src/tokens.css` er unntatt fordi de lages av planen. | Alle finnes. Forbildene i `kodetank-no`, `nabotavle` og `kodetank-lokal` finnes lokalt. |
| Faktapåstander mot koden | `grep` | `POST /api/dev/reset-demo` (`Auth.cs:202`, brukt av `visual.spec.ts`), `Weight.Co2` = kg × 0,9, `GET /companies/{id}/stats`, `POST /api/support` i `Super.cs`, ikonene 192, 512 og maskable 512 i `frontend/public/icons/`, knappen «Meld henting uten konto» i `login.ts`, teksten «hvilken som helst kode» i prototypen, R-2030 er en hentet demo-ordre, 46 skjermer i `screens.ts`, 12 kategorier og 4 tidsvinduer i `Seeder.cs`. |
| Dockerfile-forbildet | Lest `infra/web/Dockerfile` | Bruker `node:24-alpine` og `nginx-unprivileged:alpine` med `EXPOSE 80` og `HEALTHCHECK`. Planen sa først Node 22 etter kodetank.no; rettet til 24 så nettsiden følger repoets eget valg. |
| Astro-konfigen | docs.astro.build, konfigurasjonsreferansen og sitemap-integrasjonen | `build.format: 'file'`, `trailingSlash: 'never'`, `prefetch.prefetchAll` og `defaultStrategy: 'hover'`, `site` og `sitemap({ filter })` finnes med de verdiene planen bruker. `security.csp` er stabil siden Astro 6 (kapittel 9 rettet). Sitemap-filen heter `sitemap-index.xml`, som i `robots.txt`. |
| `<Picture>` per tema | Astro-dokumentasjonen for `astro:assets` | `<Picture>` kan ikke velge kilde etter `prefers-color-scheme`; N4 rettet til `getImage()` og et håndskrevet `<picture>`. |
| npm-versjoner | `npm view` 28. september 2026 | astro 7.3.5 (`engines.node >=22.12.0`, så Node 24 i Dockerfile og CI holder), @astrojs/sitemap 3.7.4, @astrojs/check 0.9.10, sharp 0.35.5. nabotavle.no og kodetank.no ligger begge på Astro `^5.13`. |
| Kontrast | WCAG 2-formelen i et Python-skript på alle tokenpar planen bruker | Tallene i N8. Ett par under 4,5:1: `--mu` på `--sf2` (4,3:1); regel lagt inn. |
| Planens egne regler | `grep` | Ingen tankestreker i prosa (de to treffene er selve regelen, skrevet som kode). Ni seksjoner i kapittel 5, tre eyebrows, ti steg N1–N10 i rekkefølge, alle steg har «Gjør», «Filer», «Test», «Ferdig når» og «Innsjekk». |
| Prototypen | `grep` i `Returapp-standalone.html` | Laster React, ReactDOM og Babel fra unpkg.com og fonter fra fonts.googleapis.com via `ext_resources`. Bekrefter at N1 er nødvendig for CSP med `script-src 'self'`. |

---

## 13. Gjennomføring, med avvik fra planen

Gjort 28. september 2026 i ti innsjekk på `opd`, ett per steg, hvert testet før innsjekk. Avvikene («Endret») står her så planen og koden ikke spriker.

| Steg | Innsjekk | Endret |
|---|---|---|
| N1 | `98ba86e`, omgjort samme dag | Utpakkingen ble gjort (Babel og `IOSDevice` bort, 14 rotskjermer pixel-like), men eieren bestemte etterpå at demoen skal være `Returapp-standalone.html` uendret, med telefonrammen, åpnet i egen fane. Utpakkingsskriptet, `Returapp-demo.html` og demo-testene i `frontend/e2e/demo/` er derfor slettet. `kopier-inn.mjs` kopierer originalen og bytter bare `<title>`, `lang` og `robots` i kopien. |
| N2 | `92b25de` | Fontene kopieres fra `frontend/public/fonts/` av `skript/kopier-inn.mjs` i stedet for Astros Fonts API (samme filer som appen, null konfig). Astro 7 kjører `astro dev` og `astro preview` som daemoner (`astro dev stop`). |
| N3 | `431cecb` | Skjermbildeskriptet er Playwright-prosjektet `skjermbilder` i `frontend/` (`SKJERMBILDER=1`), startet fra `npm run skjermbilder` i `nettside/`, fordi `webServer`, `loginAs` og `screens.ts` ligger der. 12 skjermer × 2 temaer, 1206×2622. |
| N4 | `d986ffb` | `<Picture>` kan ikke velge kilde per tema; `Telefon.astro` bruker `getImage()` og et håndskrevet `<picture>` med `<source media>`. Bare WebP (AVIF gir lite på skjermbilder og koster byggetid). Tokens leses rett fra `../frontend/src/tokens.css` med `vite.server.fs.allow: ['..']`. |
| N5 | `7985c36`, omgjort samme dag | Ingen iframe: «Prøv demoen» er en lenke til `/demo/app` med `target="_blank"`. Bundlen pakker React, runtime og fonter ut til `blob:`-adresser og lager komponenten med `new Function`, så demo-dokumentet (og bare det) får `blob:` og `'unsafe-eval'` i CSP via en `map` i nginx; resten av siden har `frame-ancestors 'none'` og `X-Frame-Options DENY`. Nettleseren klager på `{{ routePoints }}` i prototypens `<polyline>` før runtime fyller den inn; testene tillater akkurat den meldingen. |
| N6 | `1c2b205` | `Seo.astro` ble skrevet ferdig her (FAQPage, BreadcrumbList, SoftwareApplication, OG) fordi sidene trengte propsene for typesjekk. Ny liten `Utsnitt.astro` for bildeutsnitt i bentoen; brede celler har tekst til venstre og telefonutsnitt til høyre. `.flate`-regelen i `global.css` gir dempet tekst og lenker nok kontrast på `--sf2`. |
| N7 | `98538a2` | Som planlagt. OG-bildene rendres fra `src/og/mal.html` med appens font og telefonrammen. |
| N8 | `f81f50d` | Playwright kjører mot `skript/server.mjs` (25 linjer, samme regler som nginx: `$uri`, `$uri.html`, 404 med status, gzip) fordi `astro preview` er en daemon. Lighthouse mot den: 100/100/100/100 mobil og desktop, LCP 1,7 s mobil (H1, simulert Slow 4G; planens mål var 1,5 s), CLS 0, TBT 0, 179 kB. CSS inlines ved bygg. |
| N9 | `2fcd5ea` | `nginx-unprivileged` som `infra/web/`. `try_files` gjør `$uri` om til `/demo/app.html`, så map-reglene matcher begge stavemåter. CI-jobben filtrerer på endringer med `git diff` mot `github.event.before`/PR-basen (jobbnivå har ikke `paths`). 21 tester grønne mot imaget. |
| N10 | `1e041c0` | `README.md`, `DEPLOY.md` (§ 1, 3, 4, 5, 6, 8) og `IMPLEMENTERINGSPLAN.md` (fase 14, 7.5). Lenken fra appens innloggingsskjerm og fra kodetank.no er ikke gjort; de er egne innsjekk (`app:` og repoet `kodetank-no`). |

Eierens rettelser 28. september etter gjennomgang: demoen er originalprototypen i egen fane (N1 og N5 over), og «Slik virker det» får full avstand over og 40 px under overskriften (`luft`-prop på `Seksjon.astro`). `/funksjoner` fikk samme åpning som de andre sidene: felles `Hero.astro` (mørkt bånd, telefon, knapper; brukes nå på forsiden, `/for/*` og `/funksjoner`), rollene som ett 2×2-rutenett i bentoens celler, og statusene som appens statuspiller med appens statusfarger.

Gjenstår for eieren: svarene i kapittel 1, DNS for `returapp.no`, `www` og `dev`, de to Dokploy-appene, postkassen `kontakt@returapp.no`, Search Console og Bing, lenke fra kodetank.no.
