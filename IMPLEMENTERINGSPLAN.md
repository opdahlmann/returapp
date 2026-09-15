# Returapp – implementeringsplan

Mål: bygge Returapp som en fullverdig applikasjon (Angular 22 PWA + .NET 10 backend + MongoDB) der frontend er **visuelt identisk** med prototypen i `docs/design/Returapp-standalone.html`, og der alt som er "mock" i prototypen (toasts som later som om noe skjedde) er reell funksjonalitet med backend og database.

Planen er skrevet for å kunne utføres steg for steg, gjerne av flere utviklere eller agenter parallelt. Hver fase har en klar "ferdig når"-definisjon.

---

## 0. Status i dag

| Hva | Status |
|---|---|
| GitHub `opdahlmann/returapp` | Tomt repo (ingen commits) |
| Lokal mappe | Kun `docs/design/Returapp-standalone.html`, ikke `git init` |
| Node / npm | v26.3.1 / 11.16.0 |
| Angular CLI | 22.1.8 |
| .NET SDK | 10.0.102 |
| Docker | 29.3.0 |
| mongosh | 2.8.3 |
| Dev-database | MongoDB på annen server. Bruker legger inn tilkoblingsstreng i `.env.development` (ikke i git). |
| Publisering | Dokploy, Build Type Dockerfile (ingen Docker Compose). Branch `main` = prod, `opd` = dev. Se 2.8. |
| Domener | App: `app.returapp.no` (dev `dev-app.returapp.no`). API: `api.returapp.no` (dev `dev-api.returapp.no`). `returapp.no` uten subdomene er reservert for en egen nettside senere og er ikke en del av dette prosjektet. |

---

## 1. Analyse av designfilen

### 1.1 Hva filen faktisk er

`Returapp-standalone.html` er en selvpakkende bundle: en ~1 MB base64/gzip-manifest med React 18, Babel og fonten Figtree, pluss en HTML-mal med all markup. Utpakket består prototypen av:

| Del | Innhold |
|---|---|
| `template` (161 KB) | All markup for alle skjermer, som `<sc-if>`/`<sc-for>`-mal med `{{ }}`-bindinger og inline-styles |
| `Component` (34 KB JSX) | All tilstand, all logikk (`act()`-switch med ~70 actions), all utledet visningsdata (`renderVals()`) |
| `window.RA` (14 KB) | Demo-data: ikoner (SVG-paths), kategorier, firma, sjåfører, brukere, henteordre, supportsaker, postnr→kommune |
| CSS (5 KB) | Design-tokens for lys/mørk, fonter, to keyframes (`ra-up`, `ra-fade`) |
| `IOSDevice` (16 KB) | iPhone-ramme rundt prototypen. **Kun prototype-innpakning – skal ikke bygges.** Appen fyller viewporten. |

Prototype-props: `theme: light|dark`, `startLoggedIn`, `startRole: giver|driver|admin|super`.

### 1.2 Design-tokens (skal kopieres eksakt)

```css
[data-theme]         { --bg:#F3F4EF; --sf:#FFFFFF; --sf2:#EBEEE6; --tx:#182119; --mu:#66716A; --bd:#E1E4DC;
                       --pri:#2E7A45; --pri-tx:#FFFFFF; --tint:#DDEED9; --tint-tx:#1F5A31;
                       --warn:#8F5410; --warn-bg:#F7E7C8; --dan:#B23B33; --dan-bg:#F8DDDA;
                       --info:#2B5FA6; --info-bg:#DCE7F6;
                       --sh:0 1px 2px rgba(20,30,20,.05),0 8px 24px rgba(20,30,20,.05) }
[data-theme="dark"]  { --bg:#0F1512; --sf:#171E19; --sf2:#1F2822; --tx:#EDF1EA; --mu:#93A096; --bd:#28322B;
                       --pri:#5DBA72; --pri-tx:#0B1A0F; --tint:#1D3626; --tint-tx:#9BD9A9;
                       --warn:#E5B36A; --warn-bg:#3A2D14; --dan:#F08A80; --dan-bg:#42201D;
                       --info:#8DB4EE; --info-bg:#1B2C48; --sh:none }
```

- Font: **Figtree** 400–800 (self-hostes som woff2, ikke Google Fonts-CDN pga. PWA/offline). Fallback `system-ui, sans-serif`. Base 15px / line-height 1.4.
- Login-skjermene bruker faste farger uavhengig av tema: bakgrunn `#1B4D2B`, lime `#B7E39B`, tekst `#182119`, muted `#66716A`.
- Merkelappen er alltid hvit (`#fff`, `#182119`, `#2E7A45`, `#66716A`, `#E1E4DC`) – den skal skrives ut.
- Sidebakgrunn utenfor appen: `#E4E8E0`.
- Animasjoner: `ra-up` (translateY 28px → 0, .28s cubic-bezier(.2,.8,.2,1)) for sheet og toast; `ra-fade` .2s for overlay.
- Gjentatte mønstre (blir CSS-klasser i implementasjonen, se fase 3): kort (radius 18, border `--bd`, bg `--sf`, shadow `--sh`), primærknapp (h 54/52/50/46, radius 14/12, bg `--pri`), chip (h 38, radius 999, 1.5px border), statuspille (radius 999, 12px/700), ikonboks 44×44 radius 13 `--tint`, toggle 46×26, seksjonstittel 17px/800, label 12px/700 uppercase `.04em`.

### 1.3 Ikoner

Alle ikoner er inline SVG (24×24 viewBox, stroke currentColor, stroke-width 2, round caps/joins) definert som path-arrays i `RA.ICONS`. 50 UI-ikoner + 12 kategori-ikoner. Disse kopieres 1:1 til en `<ra-icon name size sw>`-komponent. Kategori-ikon lagres som ikon-nøkkel på kategorien i databasen (superbruker kan velge blant 15 ikoner: de 12 kategori-ikonene + `box`, `leaf`, `layers`).

### 1.4 Roller og navigasjon

Fire roller. En bruker kan ha flere roller (velger ved innlogging på "Hvem er du i dag?", kan bytte fra Profil). I tillegg **gjest** (giver uten konto).

| Rolle | Tabs (bunnmeny) | Stack-skjermer (med tilbakeknapp) |
|---|---|---|
| **giver** (Byggeplass / giver) | Hjem `g_home`, Hentinger `g_list`, Meldinger `g_msgs`, Profil | Meld henting `g_new` (5-stegs wizard), Detalj, Tråd, Kvittering, Merkelapp |
| **driver** (Sjåfør) | I dag `d_today`, Børs `d_market`, Rute `d_route`, Profil | Detalj, Henting `d_complete`, Tråd, Kvittering |
| **admin** (Retur-admin, per hentefirma) | Innboks `a_inbox`, Ruter `a_routes`, Firma `a_company`, Profil | Sjåfører, Dekningsområde, Avdelinger, Statistikk, Detalj, Tråd |
| **super** (Superbruker, plattform) | Oversikt `s_dash`, Ordre `s_orders`, Admin `s_admin`, Profil | Hentefirma, Brukere, Kategorier, Postnummer, Systemvarsel, Support, Detalj |

Header: tittel 24px/800 + valgfri undertittel. På rot-skjerm: bjelle-knapp + initialer-knapp (→ Profil). På stack-skjerm: tilbakeknapp. Bunnmeny vises kun på rot. Badges: Meldinger (antall tråder), Innboks (antall nye), Børs (antall på børs).

### 1.5 Skjermer, element for element

**Auth**
- `login`: logo, tittel "Retur*app*", "Enkel retur og gjenbruk fra byggeplassen". Segment Mobilnummer / E-post. SMS: `+47` + telefon → "Send meg kode på SMS". E-post: e-post + passord → "Logg inn", "Glemt passord?". Skille "eller". "Meld henting uten konto" (gjest).
- `code`: tilbake, "Skriv inn koden", "Vi sendte en 6-sifret kode til +47 …", 6-sifret input, "Bekreft", "Send ny kode". (Prototypens "Demo: hvilken som helst kode fungerer" fjernes.)
- `roles`: "Hvem er du i dag?" – ett kort per rolle brukeren har (ikon, navn, beskrivelse, "person · org"). Vises kun hvis >1 rolle, ellers rett inn. "Logg ut".

**Giver**
- `g_home`: Hei, {fornavn} / org · postnr. Hvis postnr ikke dekkes: gult varsel "Ingen henter i {postnr} {kommune} ennå" med "Tips et firma" (sheet `tip`) og "Varsle meg". Stor grønn CTA "Meld henting". "Gjenta forrige registrering" (ikke gjest). Grid 4 kolonner "Hva skal hentes?" med alle kategorier (trykk → wizard steg 2 med kategori valgt). "Pågående" (maks-liste av aktive egne ordre, "Se alle"). Miljøkort: "{kg} materialer holdt i bruk · {n} hentinger · ca {co2} kg CO₂ unngått". Gjest: stiplet kort "Uten konto får du kun SMS …" + "Opprett konto".
- `g_list`: segment Pågående / Historikk. Historikk har "Eksporter historikk" (sheet `export`). Kort per ordre: ikon, tittel, "id · sted", statuspille, klokke+tid, lastebil+sjåfør. Tom-tekst "Ingen hentinger her ennå."
- `g_msgs`: liste over tråder (ordre med meldinger): initialer-sirkel, sjåførnavn, id, siste melding. Tom-tekst.
- `g_new` wizard (undertittel "Steg n av 5", 5 progress-streker):
  1. "Hva slags ting er det?" – kategorigrid 3 kol.
  2. "{Kategori} – vis oss" – bildegrid 3 kol (bilder med fjern-X, "Ta bilde", "Galleri"), hint-tekst hvis ingen bilder, Beskrivelse (textarea).
  3. "Hvor mye, og i hvilken stand?" – Antall/mengde (numerisk), enhet-chips `stk, m², lm, paller, kg`, Tilstand 4-grid `Som ny, God, Brukbar, Slitt`, Mål (valgfritt).
  4. "Hvor og når kan det hentes?" – Adresse, Postnr (4 siffer) + Sted (auto fra postnr), varsel hvis ikke dekket, Dag-chips (`I dag, I morgen, + 4 neste dager`), Tidsvindu 4-grid `07–09, 09–12, 12–15, 15–18`, toggle "Kan hentes uten at noen er til stede", Kontaktperson.
  5. "Ser dette riktig ut?" – oppsummeringstabell (Kategori, Mengde · tilstand, Bilder, Hentested, Tid, Kontakt), tekst "Hentingen er gratis. Hentefirmaet som dekker {postnr} får beskjed nå …", "Meld henting".
  Navigasjon: Tilbake / Neste fra steg 2. Validering: steg 3 krever mengde, steg 4 krever adresse + 4-sifret postnr. Ved innsending: opprettes ordre, naviger til Detalj, toast.
  "Gjenta forrige registrering" åpner wizard på steg 5 forhåndsutfylt fra siste egne ordre.

**Sjåfør**
- `d_today` (undertittel = dagens dato): 3 tall-kort (stopp igjen, estimert km, på børsen). "Dagens stopp": nummererte kort med tittel, sted, tidsvindu-pille, mengde · kg, kontakt, evt. "Kan hentes uten at noen er til stede". Tom-tekst. "Gjort i dag": ferdige/avvik i dag.
- `d_market` (Oppdragsbørs): forklaringstekst, kort per åpent oppdrag (ikon, tittel, sted · kg, tid · tilstand) + "Ta oppdraget" (åpner assign-sheet i "fixed"-modus: velg dag/tidsvindu, sjåfør = meg).
- `d_route`: skjematisk kart (SVG med bakgrunnsveier + stiplet rute + nummererte punkter), "Skjematisk kart · {km} km", "Start navigasjon", liste over stopp (adresse, tidsvindu · tittel).
- `d_complete` (Henting): ordre-kort, "1. Dokumenter med bilde" (grid: bilder, "Ta bilde", "Skann lapp"), "2. Bekreft mengde" (−/+ stepper med "{enhet} · meldt {n}"), Merknad, "Bekreft hentet" (krever ≥1 bilde), "Meld avvik i stedet".

**Admin (hentefirma)**
- `a_inbox` (undertittel "{n} nye henteordre"): filterchips med antall (Nye, Tildelt, Planlagt, Hentet, Avvik). Kort: ikon, tittel, giver · sted, tid · kg · bilder, pille "På børs" eller sjåførnavn. Nye: "Tildel {foreslått sjåfør}" / "Annen" / børs-toggle-knapp. Tildelt: "Planlegg tidspunkt". Avvik: rødt varsel med årsak + notat.
- `a_routes` (Ruteplan): sjåfør-chips + datovelger, skjematisk kart, "{n} stopp · ca {km} km. Endre rekkefølge med pilene.", stopp-liste med opp/ned-piler, "Send rute til sjåfør".
- `a_company` (firmanavn som tittel): 3 tall-kort (hentinger denne uka, materialer i uka, snitt responstid), meny (Sjåfører, Dekningsområde, Avdelinger og lager, Statistikk og rapport), firmakort (navn, org.nr · sted · tlf, "Godkjent hentefirma siden …").
- `a_drivers`: kort per sjåfør (initialer, navn, kjøretøy · område, planlagt · hentet, ring-knapp), "Inviter sjåfør".
- `a_coverage`: forklaring, grid 3 kol med kommune-knapper (navn, "{n} postnr · Dekkes/Ikke dekket"), oppsummering "{n} postnummer dekkes nå".
- `a_depts`: kort per avdeling (navn, type, adresse · tlf, åpningstider · mottak), "Legg til avdeling".
- `a_stats`: 4 tall-kort (hentinger i mnd, tonn holdt i bruk, % uten avvik, CO₂), "Per kategori (kg)" horisontale stolper, "Eksporter rapport".

**Superbruker**
- `s_dash` (undertittel "Returapp · alle firma"): 4 tall-kort (hentinger i mnd [grønt], tonn, aktive hentefirma, brukere). "Trenger deg": firma venter godkjenning, henteordre uten dekning, åpne supportsaker.
- `s_orders`: filterchips Ubehandlet / Uten firma / Behandlet. Kort: ikon, tittel, id · sted · opprettet, firmanavn, statuspille. Nye: "Tildel firma" (sheet `company`).
- `s_admin`: meny (Hentefirma [badge ventende], Brukere og roller, Kategorier, Postnummer og dekning, Systemvarsel, Support).
- `s_companies`: kort per firma (navn, by · org.nr · siden, statuspille Aktiv/Venter godkjenning/Avvist, "Dekker: … · n ordre"). Venter: Godkjenn / Avvis. Aktiv: ring-knapp med nummer, "Detaljer".
- `s_users`: søk (navn, e-post, firma), kort per bruker (initialer, navn, org · e-post, roller), trykk → sheet `user`. "Inviter bruker".
- `s_cats`: forklaring, rad per kategori (ikon, navn, opp/ned), trykk → sheet `cat`. "Ny kategori" → sheet `catnew`.
- `s_postnr`: søk kommune, rad per kommune (navn, firmaer som dekker / "Ingen dekning", pille "{n} firma" grønn/rød).
- `s_notice`: forklaring, textarea, "Send til alle" / "Kun hentefirma", liste "Sendt" (tekst, tid · mottakere).
- `s_support`: åpne saker (fra · org, tid, tekst, "Svar", "Lukk sak"), "Lukket"-liste (dempet).

**Felles**
- `detail`: header (ikon 50px, "{kategori} · meldt {tid}", giver, statuspille), bildestripe (horisontal scroll 120×96), tidslinje (Mottatt → Tildelt {firma} → Planlagt {tid} → Hentet {tid}; avvik legges til i rødt; avbrutt erstatter alt), sjåførkort (navn, firma; giver får ring + chat), infotabell (Hentested, Tid, Mengde · tilstand, Mål?, Tilgang, Kontakt · tlf, Anslått vekt, Beskrivelse?). Rolle-avhengige handlinger:
  - giver: "Se kvittering" (hentet), "Merkelapp", "Avbryt henting" (aktiv).
  - driver: Naviger / Ring / Melding (3-grid), "Start henting" (planlagt/tildelt), "Fortsett henting" (underveis), "Se kvittering" (hentet), "Meld avvik" (aktiv).
  - admin: ny → forslagskort "Forslag: {sjåfør} dekker {sted} og har ledig kapasitet …", "Tildel sjåfør og planlegg", "Legg på børs / Fjern fra børs"; tildelt → "Planlegg tidspunkt"; planlagt → "Endre sjåfør eller tid"; alltid "Ring giver" + "Melding".
  - super: "Firma: {navn}", "Tildel / bytt hentefirma", "Overstyr sjåfør og tid" (hvis firma).
- `thread`: bobler (mine høyre grønn, deres venstre hvit), tid, input nederst med send-knapp, Enter sender. Tittel = motpart, undertittel "id · tittel".
- `receipt`: grønt kort "Hentet og bekreftet" ({tid} · {sjåfør}, {firma}), tabell (Referanse, Vare, Hentet mengde, Hentested, Giver, Dokumentasjon "{n} bilder ved henting"), miljøkort "{kg} holdt i bruk · ca {co2} kg CO₂", "PDF" / "Del".
- `label`: hvitt utskriftskort ("RETURAPP · HENTES", QR, id 26px, tittel + giver, instruks), "Skriv ut" / "Del".
- `profile`: initialer 64px, navn, org, rolle, rediger-knapp. "Bytt rolle" 2-grid. Giver: "Mitt postnummer" (sheet `postnr`). Innstillinger: tema-toggle (Lys/Mørk modus), Push-varsler / SMS / E-post toggles, "Hjelp og support". "Logg ut". Versjonstekst.

**Sheets (bunnark, overlay + `ra-up`)**
| Type | Innhold |
|---|---|
| `assign` | "Tildel og planlegg", id · tittel, sjåførliste (initialer, navn, kjøretøy · n stopp, "Foreslått"-pille) [skjules i fixed-modus: "Du tar oppdraget selv …"], Dag-chips, Tidsvindu-grid, "Bekreft – giver varsles" |
| `avvik` | "Meld avvik", årsaker (Ikke funnet / ingen til stede, Varen var ødelagt, Feil mengde, Ikke plass i bilen, Giver avlyste), Utdyp, "Send avvik" (rød) |
| `cancel` | "Avbryte hentingen?", "Ja, avbryt" (rød) / "Behold" |
| `postnr` | "Ditt postnummer", 4-sifret input, "Lagre" |
| `tip` | "Tips et hentefirma", input (firmanavn/tlf/e-post), "Send tips", "Del lenke til Returapp" |
| `user` | navn, org · e-post · tlf, 4 rolle-toggles, "Nullstill passord" / "Deaktiver", "Ferdig" |
| `cat` / `catnew` | navn-input, ikonvelger 5-grid (15 ikoner), "Lagre" / "Legg til" |
| `export` | CSV / Excel / PDF-rapport med beskrivelser |
| `company` | "Velg hentefirma", liste over aktive firma (navn, "Dekker …"), "Send ordre til firma" |

**Toast**: mørk pille nederst (over bunnmeny), 2,4 s, `ra-up`.

### 1.6 Domenemodell og forretningsregler (utledet fra logikken)

**Henteordre (Pickup)** – id `R-<løpenummer>`, kategori, tittel (`"{qty} {unit} {kategori}"`), beskrivelse, giver (org), kontaktperson, telefon, adresse, postnr, mengde, enhet, tilstand, mål, ønsket dag, tidsvindu, "uten tilstede", status, hentefirma, sjåfør, opprettet, anslått kg, bilder[], meldinger[], på børs (bool), hentet-tidspunkt, hentet mengde, avviksårsak, avviksnotat.

**Statusflyt**
```
ny ──(admin tildeler sjåfør uten tid)──▶ tildelt ──(planlegg tid)──▶ planlagt ──(sjåfør starter)──▶ underveis ──(bekreft ≥1 bilde)──▶ hentet
 │                                                                                                      │
 ├──(admin tildeler sjåfør + dag + tid)──▶ planlagt                                                     └──(meld avvik)──▶ avvik
 ├──(admin legger på børs)──▶ ny+open ──(sjåfør tar oppdraget + dag/tid)──▶ planlagt
 └──(giver avbryter, mens aktiv)──▶ avbrutt          aktiv = ikke hentet/avvik/avbrutt
```
Status-etiketter/farger: ny=Mottatt (info), tildelt=Tildelt (warn), planlagt=Planlagt (tint), underveis=Under henting (tint), hentet=Hentet (pri), avvik=Avvik (dan), avbrutt=Avbrutt (sf2/mu).

**Dekning**: postnr → kommune (reelt postnummerregister). Et hentefirma dekker et sett kommuner (admin slår på/av). Ved ny ordre: velg aktivt firma som dekker kommunen → `company` settes, status `ny`; ingen firma → `company = null` (superbruker ser under "Uten firma", giver får "vi varsler deg"). Kun aktive (godkjente) firma teller.

**Sjåførforslag**: sjåfør i firmaet hvis område matcher ordrens kommune (prototype: hardkodet kari/ola; reelt: `driver.areas[]` inneholder kommunen, ellers første sjåfør).

**Børs**: admin toggler `open`. Sjåfører i samme firma ser `open && ny`. "Ta oppdraget" → sjåfør = meg, dag+tid → `planlagt`.

**Fullføring**: krever ≥1 bilde; hentet mengde justerbar; kg skaleres `kg * hentetQty/qty`; kvittering til giver (e-post/SMS etter preferanser).

**Vekt og CO₂**: prototype `kg = qty * 18`, `co2 = kg * 0.9`. Reelt: kg-faktor per kategori+enhet (konfigurerbar på kategori), CO₂-faktor global konfig. Formatering: ≥1000 kg → "1,4 t".

**Rute**: sjåførens `planlagt|underveis`-ordre for valgt dato, rekkefølge lagres (admin flytter opp/ned). Km-estimat: prototype `stopp × 7,4`. Reelt: sum av luftlinje mellom geokodede adresser × 1,3 (enkel, ingen ekstern avhengighet) – oppgraderes til ruting-API ved behov. Kartet er skjematisk i designet og forblir skjematisk (punkter plassert etter fast POS-tabell) – ikke et ekte kart.

**Meldinger**: én tråd per ordre mellom giver og sjåfør/admin. Admin kan skrive i tråden.

**Superbruker**: godkjenn/avvis firma, tildel/bytt firma på ordre (nullstiller sjåfør, status ny), roller per bruker, kategorier (navn, ikon, rekkefølge), postnr-oversikt, systemvarsel (alle / kun hentefirma), support (svar, lukk).

**Statistikk** (hardkodet i prototypen, skal beregnes): per firma – hentinger denne uka, kg denne uka, snitt responstid (opprettet → planlagt), hentinger per måned, kg per måned, % uten avvik, CO₂, kg per kategori. Plattform – hentinger per måned, tonn totalt, aktive firma, antall brukere, ordre uten dekning, åpne supportsaker, ventende firma.

### 1.7 Alt som er "mock" i prototypen og skal bli ekte

| Prototype-toast | Reell funksjon |
|---|---|
| "Ingen nye varsler" (bjelle) | Varselliste (in-app notifications) |
| "Lenke for nytt passord er sendt" | Passord-reset via e-post |
| "Ny kode sendt" / kode-verifisering | SMS-OTP via SMS-leverandør |
| "Du får beskjed når noen dekker {postnr}" | Lagre "varsle meg"-abonnement, trigges når dekning endres |
| "Tips sendt" | Lagre tips, varsle superbruker |
| "Delingslenke kopiert" | Web Share API / clipboard med reell URL |
| "Åpner veibeskrivelse i kart" / "Åpner hele ruten" | `geo:`/Google Maps-URL med adresse(r) |
| "Ringer …" | `tel:`-lenke |
| "Skanner merkelapp" | Kamera + QR-dekoding, kobler til ordre |
| "Kvittering lastet ned som PDF" / "Merkelapp delt som PDF" / "Sendt til skriver" | Print-stylesheet + `window.print()`; PDF fra backend for e-post |
| "{CSV/Excel/PDF} sendes til e-post" | Reell eksport: CSV (stdlib), Excel (xlsx), PDF-rapport; lastes ned direkte |
| "Invitasjon sendt på SMS" (sjåfør) / "Invitasjon – skjema" (bruker) | Invitasjonsflyt: skjema → SMS/e-post med lenke → bruker opprettes med rolle |
| "Ny avdeling – skjema åpnes" | Avdeling-CRUD |
| "Rediger profil" | Profil-redigering (navn, tlf, e-post, org) |
| "Åpner hjelpesenter" | Support-skjema (oppretter supportsak) |
| "Svar sendt til {bruker}" | Svar på supportsak (e-post/in-app) |
| "Bruker deaktivert" / "Nullstill passord" | Reell deaktivering / reset-lenke |
| "Rute sendt til Kari" | Lagre rute + push/SMS til sjåfør |
| "Velg dato" / sjåfør-chips i Ruteplan | Reell datovelger (`<input type="date">`) og sjåførfilter |
| "Åpner firmaprofil" | Firmadetalj-visning for superbruker |
| Hardkodede tall (14, 6,2 t, 52, 94 %, 12, 1 284 …) | Beregnet av backend |
| Hardkodede avdelinger, DAYS-liste, "Fredag 11. september", "Ons 16." | Fra database / dagens dato |
| Bilder = teller | Reelle bilder (kamera/galleri), lagres som dokumenter i MongoDB (`files`), vises som thumbnails |
| Fake QR (hash-mønster) | Ekte QR med URL til ordren |

### 1.8 Avvik og uklarheter i designet (besluttet slik)

- Prototypens `kommune()` er en prefiks-heuristikk. **Beslutning:** importer Brings postnummerregister (gratis CSV) til `postnr`-collection.
- Designet viser bare firmaet "Ombruksfabrikken" for admin. **Beslutning:** admin er alltid knyttet til ett firma (`user.companyId`); alle admin-skjermer filtreres på det.
- Sjåfør "kari" er hardkodet. **Beslutning:** driver-skjermer filtreres på innlogget bruker; sjåfør er en bruker med rolle `driver` + `companyId` + `vehicle` + `areas`.
- Giver-rollen har `org` ("Skanska – Tangen brygge"). **Beslutning:** fritekst `org` på bruker; ordre kopierer `giverOrg`, `contact`, `phone` ved opprettelse.
- Gjest: prototypen sender gjesten rett til Hjem uten å be om telefon. **Beslutning:** gjest-token er anonymt (`guest=true`, tilfeldig `gid`-claim, 24 t). Telefon og navn samles i wizard steg 4 (for gjest vises "Kontaktperson" som to felt: navn + mobil, begge påkrevd; for innloggede ett felt forhåndsutfylt "Navn · tlf" som i designet). Ordren lagrer `guestId` + `guestPhone`; gjest får SMS ved planlagt/hentet. "Opprett konto" → `/login` (SMS-innlogging med samme nummer gir tilgang til ordrene via `guestPhone`-match).
- Rollekortene på "Hvem er du i dag?" viser i prototypen ulike personer per rolle. Reelt: `user.name · {firmanavn for driver/admin | user.org for giver | "Returapp" for super}`. Skjermen vises alltid etter innlogging når brukeren har >1 rolle (som i designet).
- Sheets som ikke finnes i designet men trengs for mock-knappene (Inviter sjåfør, Legg til avdeling, Rediger profil, Inviter bruker, Svar på supportsak, Ny supportsak, "Varsle meg" for gjest uten telefon) bygges med samme sheet-mønster: tittel 20px/800, undertittel 13px `--mu`, inputs `.input-50`, primærknapp 52px.
- Statistikk-tallene i prototypen (52, 23,4 t, 94 %, 1 284 …) er hardkodet. Reelt beregnes de. Demo-seeden får en generert historikk (~60 hentede ordre siste 2 måneder for Ombruksfabrikken) så tallene er meningsfulle, men ikke identiske. Visuell test aksepterer tallavvik (fase 12.3).
- Tema lagres per bruker (og i `localStorage` for gjest/før innlogging).
- "Meldinger"-tab for giver viser tråder med minst én melding. Beholdes.
- Stack-navigasjon i prototypen (in-memory) erstattes av Angular Router med ekte URL-er (deep-links, tilbakeknapp i nettleser fungerer), men visuelt identisk header/tilbakeknapp.

---

## 2. Arkitektur og tekniske valg

Prinsipp: **færrest mulig bevegelige deler**. Ingen lag som ikke tjener et konkret behov i designet. Ting som kan løses med plattformen (nettleser, .NET, MongoDB) løses der.

**Ingen lagring på lokal disk (krav).** Appen kjører i containere, så backend skriver aldri til filsystemet:
- Alle bilder og filer lagres som dokumenter i MongoDB (binærfelt i collection `files`). Et dokument kan være maks 16 MB, derfor er maks opplasting 10 MB, og originaler skaleres ned ved opplasting (se 2.2). Ingen GridFS, S3 eller volum.
- PDF, CSV og xlsx genereres i minnet og strømmes rett i responsen (eller legges ved e-post). De mellomlagres aldri som filer.
- Dev-varianter av SMS og e-post logger til stdout og holder de siste meldingene i minnet (for `/dev/last-sms`, `/dev/last-mail` og tester). Ingen `.mail-out/`-mappe.
- Logging går kun til stdout. Postnummerregisteret er bygget inn i assemblyen (embedded resource), ikke en fil som leses fra disk.
- Håndheves: i CI kjøres API-containeren med `docker run --read-only --tmpfs /tmp` under e2e (fase 12), så et utilsiktet skriv til disk feiler testene. I Dokploy kjører imaget som ikke-root-brukeren `app` uten skriverett til `/app`, og ingen volumer monteres.

### 2.1 Oversikt

```
┌──────────────────────────┐   HTTPS/JSON    ┌──────────────────────────┐   MongoDB.Driver   ┌───────────┐
│ Angular 22 PWA           │ ◀────────────▶  │ .NET 10 Minimal API      │ ◀───────────────▶ │ MongoDB   │
│ standalone + signals     │   JWT Bearer    │ ett prosjekt, endpoints  │                    │ (dev: ekstern server) │
│ service worker (offline) │                 │ gruppert per område      │                    │ bilder som dokumenter │
└──────────────────────────┘                 └──────────────────────────┘                    └───────────┘
                                                      │  SMS (OTP, varsler)   E-post (kvittering, reset)   Web Push (VAPID)
```

### 2.2 Valg (med begrunnelse, kort)

| Område | Valg | Hvorfor / hva som er droppet |
|---|---|---|
| Backend | Ett prosjekt `Returapp.Api`, Minimal API, endpoints i én fil per område | Ingen Clean Architecture-lag, ingen MediatR, ingen repository-abstraksjon over MongoDB.Driver. Modeller er `record`/POCO. |
| Database | `MongoDB.Driver` direkte, collections listet i 2.5 | Indekser opprettes ved oppstart. Løpenummer via `counters`-collection (`findOneAndUpdate $inc`). |
| Bilder og filer | Dokumenter i collection `files` (`data` = BinData, maks 16 MB per dokument) | Krav: ingen lokal disk (se prinsippet over). Enklere enn GridFS: ett dokument per fil, vanlig `Find`/`InsertOne`. Maks opplasting 10 MB. Ved opplasting (ImageSharp): originalen skaleres ned til maks 2048 px på lengste side (JPEG, kvalitet 85, EXIF inkl. GPS fjernes), thumbnail 400 px lagres som eget dokument. Et mobilbilde havner da på ~0,3–0,8 MB i databasen. |
| Auth | JWT access-token (15 min) + refresh-token (30 d, lagret hashet i `users.refreshTokens`) | Innebygd `JwtBearer`. Passord: `PasswordHasher<T>` fra `Microsoft.Extensions.Identity.Core` (kun hashing, ikke hele Identity). OTP: 6 siffer, 5 min TTL, maks 5 forsøk. |
| SMS | `ISmsSender` med to implementasjoner: `ConsoleSmsSender` (dev, logger koden) og en leverandør (Twilio eller norsk leverandør – velges av bruker i fase 2) | Interface er berettiget fordi det finnes to implementasjoner fra dag én. |
| E-post | Innebygd `System.Net.Mail.SmtpClient` (STARTTLS, vedlegg i minnet) via miljøvariabler – ingen MailKit-pakke; dev: `ConsoleMailSender` logger til stdout + buffer i minnet | Ingen filer på disk. |
| Push | Web Push (VAPID) med `WebPush`-pakken, PWA service worker | Fase 9. SMS/e-post kommer først. |
| Sanntid chat | Polling hvert 5. sek mens tråd er åpen | Én linje i frontend. Oppgrader til SignalR (innebygd i ASP.NET) hvis behovet oppstår. |
| PDF | "Skriv ut": print-CSS + `window.print()`. PDF-filer (kvittering som e-postvedlegg, merkelapp for "Del", rapport): `QuestPDF` i backend | Native der det holder; QuestPDF er ett bibliotek for alle tre PDF-typene. |
| CSV | `string.Join`, ingen pakke. Excel: `ClosedXML` (kun hvis reell Excel med oppsummeringsark kreves – designet lover det, så den tas med) | |
| QR | Frontend `qrcode` (npm, ~20 kB) genererer SVG av `{App__BaseUrl}/p/R-2041`, i prod `https://app.returapp.no/p/R-2041`. Skanning: `BarcodeDetector` (Chrome/Android) med fallback `@zxing/browser` for iOS | |
| Kart | Skjematisk SVG som i designet. Navigasjon: `https://www.google.com/maps/dir/?api=1&destination=…` / `maps://` | Ingen kart-SDK. |
| Geokoding (km-estimat) | Kartverket adresse-API (gratis, ingen nøkkel) ved opprettelse av ordre → lat/lng lagres | Km = sum luftlinje × 1,3. `// ponytail: luftlinje, bytt til ruting-API ved behov` |
| Frontend state | Angular signals i services (`AuthStore`, `PickupStore`, …) | Ingen NgRx. |
| Styling | Global `styles.css` med tokens, reset og keyframes fra prototypen. Markupen kopieres **ordrett med prototypens inline-styles** inn i Angular-malene (bindinger byttes til signaler). Gjentatte elementer er komponenter (`ra-icon`, `ra-toggle`, sheet-host, toast). Side- og sheet-komponenter har `host: display:contents` og `router-outlet{display:none}`, så flex/gap blir identisk med prototypen. | Ingen Tailwind, ingen komponentbibliotek, ingen utility-klasser: ordrett kopi er enklest å verifisere piksel for piksel. |
| Ruting | Angular Router, én rute-fil, lazy-loadede rolle-områder, `canMatch`-guards per rolle | Offentlig: `/login`, `/code`, `/roles`, `/invite/:token`, `/reset/:token`, `/apply` (firmasøknad). Rolle-tabs: `/g/home|list|msgs|new`, `/d/today|market|route`, `/a/inbox|routes|company|drivers|coverage|depts|stats`, `/s/dash|orders|admin|companies|users|cats|postnr|notice|support`. Felles: `/p/:id` (detalj), `/p/:id/thread|receipt|label|complete`, `/profile`, `/notifications`. QR-koden peker på `/p/:id`; uinnlogget → login → tilbake. |
| Tester backend | xUnit + `WebApplicationFactory` mot den ene dev-databasen (`.env.development`) | Ekte Mongo, ingen mocks. Ingen testdatabaser, ingen Testcontainers, ingenting droppes – testene isolerer seg med egne data merket med en kjøre-id. |
| Tester frontend | Vitest (Angular 22 standard) for logikk/komponenter, Playwright for e2e og skjermbilde-sammenligning mot prototypen | |
| CI | GitHub Actions: build + test begge sider, `docker build` av begge imagene, Playwright e2e mot containerne bygget fra `infra/` | |
| Kjøring lokalt | `dotnet run` + `ng serve` (proxy `/api` → API). Imagene kan testes lokalt med `docker build` / `docker run` | Ingen Docker Compose. |
| Publisering | Dokploy: én applikasjon per image, Build Type Dockerfile, bygger fra git (se 2.8) | Ingen compose, ingen image-registry/GHCR, ingen deploy-workflow. |

### 2.3 Repo-struktur

```
returapp/
├── IMPLEMENTERINGSPLAN.md
├── README.md
├── DEPLOY.md                  # Dokploy-runbook: apper, felt, variabler, røyktest, feilsøking
├── .gitignore                 # .env, .env.* (men ikke *.example), node_modules, bin, obj, dist, .DS_Store
├── .dockerignore              # .git, .env*, bin, obj, node_modules, dist, docs – holder hemmeligheter og byggrester ute av imagene
├── .env.development.example   # alle variabler, uten hemmeligheter (mal, sjekkes inn)
├── .env.development           # IKKE i git – lokal konfig inkl. dev-databasen
├── infra/
│   ├── api/Dockerfile         # .NET publish → aspnet, port 8080, USER app, HEALTHCHECK /ready
│   └── web/Dockerfile         # ng build → nginx, port 80
│       web/nginx.conf         # SPA-fallback + /api-proxy til ${API_UPSTREAM}
├── .github/workflows/ci.yml
├── docs/
│   ├── design/Returapp-standalone.html   (uendret)
│   └── design/screens/        # referanse-skjermbilder fra prototypen (fase 12)
├── backend/
│   ├── Returapp.slnx
│   ├── global.json            # SDK 10.0.102 – samme versjon som SDK-imaget i infra/api/Dockerfile
│   ├── src/Returapp.Api/
│   │   ├── Program.cs         # .env.{miljø}-loader, konfig-validering, DI, auth, endpoints, indekser, seed
│   │   ├── Db.cs              # MongoClient + typed collections
│   │   ├── Models/            # Pickup.cs, User.cs, Company.cs, Category.cs, ... (records)
│   │   ├── Endpoints/         # Auth.cs, Pickups.cs, Companies.cs, Users.cs, Categories.cs,
│   │   │                      # Postnr.cs, Messages.cs, Routes.cs, Stats.cs, Export.cs,
│   │   │                      # Notifications.cs, Support.cs, Photos.cs
│   │   ├── Services/          # Sms.cs, Mail.cs, Push.cs, Otp.cs, Jwt.cs, Weight.cs, Geo.cs, Pdf.cs
│   │   └── Seed/              # postnr.tsv (Bring, embedded resource), demo-seed (kun dev)
│   └── tests/Returapp.Api.Tests/
│       ├── ApiFixture.cs      # WebApplicationFactory mot dev-databasen, RunId for egne testdata
│       ├── Auth/  Pickups/  Coverage/  Stats/  Export/  ...
└── frontend/
    ├── angular.json, package.json, ngsw-config.json, playwright.config.ts
    ├── proxy.conf.json        # ng serve: /api → http://localhost:5080 (samme som nginx i container)
    ├── public/                # manifest.webmanifest, ikoner, fonts/figtree-*.woff2
    ├── src/
    │   ├── styles.css         # tokens, fonter, utility-klasser, keyframes, print-CSS
    │   ├── app/
    │   │   ├── app.routes.ts
    │   │   ├── core/          # api.ts (HttpClient mot relativ /api), auth.store.ts, token.interceptor.ts,
    │   │   │                  # guards.ts, format.ts (nb-NO dato/kg/CO₂), theme.ts
    │   │   ├── shell/         # shell.component (header + innhold + tabs), sheet.component, toast.service
    │   │   ├── ui/            # icon, chip, toggle, status-pill, card-list-item, stat-card, photo-grid,
    │   │   │                  # timeline, schematic-map, empty-state, qr
    │   │   ├── auth/          # login, code, roles
    │   │   ├── giver/         # home, list, msgs, new (wizard)
    │   │   ├── driver/        # today, market, route, complete
    │   │   ├── admin/         # inbox, routes, company, drivers, coverage, depts, stats
    │   │   ├── super/         # dash, orders, admin, companies, users, cats, postnr, notice, support
    │   │   ├── pickup/        # detail, thread, receipt, label (felles for alle roller)
    │   │   ├── profile/
    │   │   └── sheets/        # assign, avvik, cancel, postnr, tip, user, cat, export, company
    └── e2e/                   # Playwright: flows per rolle + visual/*.spec.ts
```

### 2.4 Miljøvariabler og `.env`

Samme nøkler overalt, bare kilden varierer:

| Hvor | Kilde |
|---|---|
| Lokalt (`dotnet run`) | `.env.development` i repo-roten (gitignorert). En loader i `Program.cs` (≈10 linjer, ingen pakke) går oppover fra `AppContext.BaseDirectory` til første mappe som har `.env.{ASPNETCORE_ENVIRONMENT}` og leser `KEY=VALUE`-linjer før `WebApplication.CreateBuilder`. Variabler som allerede er satt vinner. Standard `builder.Configuration["Mongo:ConnectionString"]` fungerer da via `Mongo__ConnectionString`-konvensjonen. |
| Dokploy | Environment-feltet per app (se 2.8 og `DEPLOY.md`). Ingen `.env`-fil i imaget. |
| Tester | Samme `.env.development` som lokalt (i CI: repo-secrets `MONGO_CONNECTION_STRING`/`MONGO_DATABASE`). `ApiFixture` setter `ASPNETCORE_ENVIRONMENT=Development`, `App__DevEndpoints=true` og Console-sendere. Testene bruker den ene dev-databasen og oppretter aldri egne databaser. |

`ASPNETCORE_URLS` står ikke i `.env`-filene. Lokalt kommer port 5080 fra `launchSettings.json`, i container gjelder `ASPNETCORE_HTTP_PORTS=8080` fra Dockerfilen. Derfor kan samme fil brukes med `docker run --env-file .env.development`. Kommentarer står på egne linjer (ingen inline-kommentarer etter verdier).

`.env.development.example` (innsjekket mal, kopieres til `.env.development`):
```
# MongoDB (dev-database på annen server). Fjern authMechanism=DEFAULT hvis Compass har lagt den på.
Mongo__ConnectionString=mongodb://user:pass@host:27017/?authSource=admin
Mongo__Database=returapp_dev

# JWT
Jwt__Secret=<min 32 tilfeldige tegn>
Jwt__Issuer=returapp
Jwt__AccessMinutes=15
Jwt__RefreshDays=30

# SMS: Console (dev, logger koden) | Twilio
Sms__Provider=Console
Sms__From=Returapp
Twilio__AccountSid=
Twilio__AuthToken=

# E-post: Console (dev, logger e-posten) | Smtp
Mail__Provider=Console
Mail__From=noreply@returapp.no
Smtp__Host=
Smtp__Port=587
Smtp__User=
Smtp__Pass=

# Web Push (genereres i fase 9: dotnet run --project src/Returapp.Api -- vapid)
Push__PublicKey=
Push__PrivateKey=
Push__Subject=mailto:drift@returapp.no

# App (BaseUrl brukes i QR, delingslenker og e-post; SeedDemo seeder demo-data hvis databasen er tom)
App__BaseUrl=http://localhost:4200
App__SeedDemo=true
App__Co2Factor=0.9
# /api/dev/last-sms og /api/dev/last-mail (leser OTP-koder) – ALDRI true på en offentlig server
App__DevEndpoints=true

```

Forskjell mellom dev og prod i Dokploy er kun verdier: `Mongo__Database`, `App__BaseUrl`, `App__SeedDemo` (`false` i prod), `Sms__Provider`/`Mail__Provider` og egne hemmeligheter. `App__DevEndpoints` settes aldri i Dokploy.

Frontend har ingen konfig eller hemmeligheter. Den kaller alltid relativ `/api`: lokalt via `proxy.conf.json`, i container via nginx. Ingen `environment.ts` med API-URL, ingen CORS i API-et.

### 2.5 Datamodell (MongoDB-collections)

Alle dokumenter har `_id` (ObjectId, unntatt der annet er nevnt), `createdAt`, `updatedAt` (UTC). Navn i kode er engelsk, tekst mot bruker er norsk.

| Collection | Felter (utvalg) | Indekser |
|---|---|---|
| `users` | `name, email?, phone?, passwordHash?, org, roles: {giver,driver,admin,super}: bool, companyId?, postnr?, theme, notif: {push,sms,email}, vehicle?, areas?: string[] (kommuner, for sjåfør), active, refreshTokens: [{hash, expires}], pushSubscriptions: [...]` | unik `email` (sparse), unik `phone` (sparse), `companyId` |
| `companies` | `name, city, orgnr, phone, status: aktiv|venter|avvist, since, coverage: [kommune], departments: [{name, type: hoved|avdeling, address, phone, hours, accepts}]` | `status`, `coverage` |
| `pickups` | `_id: "R-2041"` (string), `seq, categoryId, title, desc, giverUserId?, guestPhone?, giverOrg, contact, phone, address, postnr, kommune, lat?, lng?, qty, unit, cond, dims, day (ISO-dato eller null=fleksibel), slot, unattended, status, companyId?, driverId?, open, photos: [{fileId, thumbId, w, h}], estKg, pickedAt?, pickedQty?, pickedPhotos: [...], pickedNote?, deviation?: {reason, note, at}, cancelledAt?, statusLog: [{status, at, byUserId}], messages: [{fromUserId, text, at}]` | `giverUserId`, `companyId+status`, `driverId+status`, `open+status`, `postnr`, `createdAt` |
| `categories` | `_id: string ("vinduer")`, `name, icon, order, kgPerUnit: {stk, m2, lm, paller, kg}` | `order` |
| `postnr` | `_id: "4608"`, `poststed, kommunenr, kommune` | `kommune` |
| `counters` | `_id: "pickup"`, `seq` | |
| `otps` | `phone, codeHash, expires, attempts` | TTL på `expires` |
| `routes` | `driverId, date (yyyy-mm-dd), pickupIds: [], sentAt?` | unik `driverId+date` |
| `notifications` | `userId, type, title, body, pickupId?, readAt?` | `userId+createdAt` |
| `notices` | `text, to: alle|hentefirma, sentByUserId` | |
| `support` | `fromUserId?, fromName, org, text, open, replies: [{byUserId, text, at}]` | `open` |
| `tips` | `postnr, text, fromUserId?` | |
| `coverageAlerts` | `postnr, userId? / phone?, notifiedAt?` | `postnr` |
| `invites` | `tokenHash, role, companyId?, phone?/email?, expires, usedAt?` | TTL |
| `passwordResets` | `userId, tokenHash, expires` | TTL |
| `files` | `_id, contentType, size, w?, h?, data (BinData, ≤ 16 MB), ownerUserId?, guestId?, pickupId?, kind: original|thumb, orphanExpires?` – originaler (nedskalert) og thumbnails (400 px) som separate dokumenter | `pickupId`, TTL på `orphanExpires` |

Push-abonnementer ligger i `users.pushSubscriptions`. Pickups har i tillegg `guestId?` (fra gjest-token) ved siden av `guestPhone`.

Seed (kun når `App__SeedDemo=true` og `users` er tom): kategoriene fra designet i samme rekkefølge, postnr-registeret, og demo-dataene fra `RA` (firmaene Ombruksfabrikken/Gjenbrukslageret Oslo/Sirkula Sør, brukerne u1–u7 med passord `demo1234`, ordrene R-2028…R-2044 med relative datoer i forhold til i dag, supportsakene) pluss ~60 genererte, hentede historikk-ordre siste 60 dager (deterministisk seed så tester kan regne på dem). Da ser dev-miljøet ut som prototypen fra første start.

### 2.6 API (alle under `/api`, JSON, JWT der ikke annet er sagt – unntak: `/health` og `/ready` ligger på rota)

**Auth** – `POST /auth/otp/send {phone}`, `POST /auth/otp/verify {phone, code}` → tokens + roller, `POST /auth/login {email, password}`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/guest` → anonymt gjest-token (`gid`), `POST /auth/forgot {email}`, `POST /auth/reset {token, password}`, `GET /auth/invite/{token}` (navn/rolle/firma til invitasjonssiden), `POST /auth/invite/accept {token, name, password?}`, `GET /me`, `PATCH /me {name, org, phone, phoneCode, email, postnr, theme, notif}` (nytt mobilnummer krever `phoneCode` fra `POST /auth/otp/send` til det nye nummeret), `POST /me/push {subscription}`.

**Pickups** – `GET /pickups?scope=mine|company|driver|market|all&status=&filter=` (scope avgjøres og valideres av rolle), `GET /pickups/{id}`, `POST /pickups` (giver/gjest), `POST /pickups/{id}/cancel`, `POST /pickups/{id}/assign {driverId?, day?, slot?}` (admin/super; sjåfør kun med egen id fra børs), `POST /pickups/{id}/market {open}`, `POST /pickups/{id}/company {companyId}` (super), `POST /pickups/{id}/start`, `POST /pickups/{id}/complete {qty, note, photoIds}`, `POST /pickups/{id}/deviation {reason, note}`, `GET/POST /pickups/{id}/messages`, `POST /photos` (multipart → `{fileId, thumbId}`), `GET /photos/{id}`, `GET /pickups/{id}/receipt.pdf`, `GET /pickups/{id}/label.pdf`, `GET /pickups/counts?scope=company` (antall per status).

**Referanse** – `GET /categories`, `POST/PATCH/DELETE /categories` + `PUT /categories/order` (super), `GET /postnr/{nr}` → `{poststed, kommune, covered: bool, companyName?}` (offentlig), `GET /postnr/kommuner?q=` (super-oversikt med firma per kommune).

**Firma** – `GET /companies` (super; admin får eget), `POST /companies/apply` (offentlig søknad), `POST /companies/{id}/approve|reject`, `GET/PATCH /companies/{id}`, `PUT /companies/{id}/coverage {kommuner}`, `GET/POST/PATCH/DELETE /companies/{id}/departments`, `GET /companies/{id}/drivers`, `POST /companies/{id}/invite-driver {phone, name}`, `GET /companies/{id}/stats?period=week|month`.

**Ruter** – `GET /routes?driverId=&date=`, `PUT /routes {driverId, date, pickupIds}`, `POST /routes/send`.

**Super** – `GET /users?q=`, `PATCH /users/{id} {roles, active}`, `POST /users/invite`, `POST /users/{id}/reset-password`, `GET /stats/platform`, `GET /pickups?scope=all&filter=ubehandlet|utenfirma|behandlet`, `GET/POST /notices`, `GET /notices/active` (alle roller, siste 24 t), `GET /support`, `POST /support` (alle), `POST /support/{id}/reply`, `POST /support/{id}/close`, `GET/POST /tips`, `POST /coverage-alerts`.

**Eksport** – `GET /export/pickups.csv|.xlsx|.pdf?scope=mine|company&from=&to=`.

**Varsler** – `GET /notifications`, `POST /notifications/read`.

**Drift** – `GET /health` på rota, ikke under `/api` (liveness, rører ikke databasen), `GET /ready` på rota (databaseping, 200/503 – helsesjekk i Dokploy og røyktest på `https://api.returapp.no/ready`), `POST /client-errors` (frontend-feil), `GET /dev/last-sms?phone=` og `GET /dev/last-mail?to=` (**kun** når `App__DevEndpoints=true`, som bare settes lokalt og i CI; brukes av e2e-tester for å hente OTP/lenker).

Autorisasjon: én `Require(role)`-hjelper + eierskapssjekk inne i endpointet (giver ser bare egne, admin/driver bare eget firma, super alt). Ingen policy-rammeverk.

### 2.7 Frontend-arkitektur (detaljer)

- **Shell** (`shell.component`): rendrer header (tittel/undertittel fra rute-data eller fra siden via `ShellStore.setTitle()`), `<router-outlet>`, bunnmeny (tabs for aktiv rolle, badges fra stores), `<ra-sheet>` og `<ra-toast>`. Tilbakeknapp = `Location.back()`. Rot-ruter markeres med `data: { root: true }`.
- **Stores** (signals): `AuthStore` (user, role, guest, tokens), `PickupStore` (cache per scope, `refresh()`), `RefStore` (kategorier, postnr-oppslag), `ShellStore` (title, sub, sheet, toast).
- **Sheet** åpnes via `ShellStore.openSheet(type, data)`; hvert sheet er en komponent i `sheets/`, rendret dynamisk (`NgComponentOutlet`). Overlay-klikk lukker.
- **Toast**: `ShellStore.toast(msg)`, 2 400 ms, samme stil som designet.
- **Formatering** (`format.ts`): `kg(720) → "720 kg"`, `kg(1400) → "1,4 t"`, `co2(kg)`, `relDay(date) → "I dag" | "I morgen" | "Ons 16. sep"`, `relTime(date) → "I dag, 14:32" | "I går 15:02" | "Tor 10. sep, 08:14"`, alt med `Intl.DateTimeFormat('nb-NO')`. Dag-chips i wizard/assign genereres: `I dag, I morgen, + 4 påfølgende dager` som `"Ons 16."`.
- **Ikoner**: `<ra-icon name="truck" [size]="22" [sw]="2">` med path-tabellen fra designet kopiert 1:1 til `icons.ts`.
- **Tema**: `data-theme` på `<html>`; `ThemeService` leser bruker → localStorage → `prefers-color-scheme`.
- **PWA**: `@angular/pwa`, `ngsw-config.json` med app-shell + fonter prefetch, API `freshness` for `/api/**` (5 s timeout, fallback cache) slik at lister vises offline. Skrivende handlinger krever nett (viser toast "Ingen nett" – ingen offline-kø i første versjon; `// ponytail: ingen offline-kø, legg til Background Sync hvis sjåfører faktisk mister dekning`).
- **Layout**: appen fyller viewporten (`100dvh`), maks bredde 480px sentrert på desktop med bakgrunn `#E4E8E0` som i prototypen (uten iPhone-ramme). Safe-area-insets brukes i header/bunnmeny/sheet i stedet for prototypens faste `padding-top:58px`/`padding-bottom:30px`.

### 2.8 Publisering med Dokploy

Returapp publiseres med **Dokploy, uten Docker Compose**. Mønsteret følger oppskriften «The Dokploy way», tilpasset Returapp. Runbook med ferdige variabellister og feilsøking: `DEPLOY.md`.

**Grunnregler**
1. Én Dokploy-applikasjon per image, **Build Type = Dockerfile** (ikke Compose, Nixpacks eller Railpack – de leter etter `.env` i kildemappa og feiler). Returapp har to images, `api` og `web`, og maks to filer per app i repoet: `infra/api/Dockerfile`, `infra/web/Dockerfile` + `infra/web/nginx.conf`.
2. **Build Context Path = `.`** (repo-roten), Dockerfile Path = `infra/<app>/Dockerfile`.
3. Dockerfilene bygger **production som standard**. Dev-miljøet er de samme filene med andre miljøvariabler og egne domener.
4. Frontend kaller API-et **same-origin på `/api`**. nginx i `web`-imaget proxyer til API-containeren. Ingen CORS, ingen absolutte API-URL-er i frontend, ingen Traefik-path-regler.
5. **Ingen `.env` i imaget.** Runtime-konfig er ekte miljøvariabler i Dokploy.
6. **Ingen volumer.** Filer ligger i MongoDB (prinsippet i kap. 2), databasen står på egen server, containerne er tilstandsløse.
7. **TLS termineres i Traefik** (Let's Encrypt, HTTP→HTTPS-redirect i domeneinnstillingen). Containerne lytter på ren HTTP (nginx `:80`, Kestrel `:8080`). API-et bruker `UseForwardedHeaders` og slår aldri på `UseHttpsRedirection()`.

**Miljøer**

| Miljø | Branch | Dokploy-apper | Domene |
|---|---|---|---|
| prod | `main` | `returapp-web` | `app.returapp.no` |
| prod | `main` | `returapp-api` | `api.returapp.no` |
| dev | `opd` | `returapp-dev-web` | `dev-app.returapp.no` |
| dev | `opd` | `returapp-dev-api` | `dev-api.returapp.no` |

`returapp.no` uten subdomene er reservert for en egen nettside som publiseres senere. Den er ikke en del av dette prosjektet, og ingen Returapp-app skal bruke apex-domenet.

Hvert domene får eget Let's Encrypt-sertifikat i Traefik (ingen wildcard). DNS: A-record for `app`, `dev-app`, `api` og `dev-api` → Dokploy-vertens IP.

Angular-appen bruker **aldri** API-domenet. Den kaller relativ `/api` på sitt eget domene, og nginx proxyer internt til API-containeren via `API_UPSTREAM` (tjenestenavn på `dokploy-network`, ikke det offentlige domenet). Dermed trengs ingen CORS. API-domenet brukes til helsesjekk og overvåkning (`https://api.returapp.no/health` og `/ready`), og er klart for integrasjoner som trenger en fast adresse (f.eks. leveringsrapporter fra SMS-leverandør). Klient-IP blir riktig på begge veier: direkte via Traefik og via nginx, som sender Traefiks `X-Forwarded-For` videre uendret, gir én hop til API-et i begge tilfeller (`ForwardLimit = 1`).

**De to feltene i Dokploy** – en variabel i feil felt gjør ingenting:

| Felt | Tilsvarer | Returapp | Etter endring |
|---|---|---|---|
| Environment | `docker run -e` | `api`: nøklene fra 2.4 (uten `App__DevEndpoints`). `web`: kun `API_UPSTREAM` | Redeploy |
| Build-time Arguments | `docker build --build-arg` | Ingen i Returapp. Dockerfilene har `ARG DOTNET_CONFIGURATION=Release`, `ARG ASPNETCORE_ENV=Production` og `ARG NG_CONFIGURATION=production` med prod som default | Rebuild |

Dev bygges også som production, fordi service worker og push kun er aktive i production-bygget og skal kunne testes i dev.

**API-imaget (`infra/api/Dockerfile`)**
- `mcr.microsoft.com/dotnet/sdk:10.0.102` (pinnet til nøyaktig samme versjon som `backend/global.json`; en flytende `sdk:10.0` kan krysse feature-båndet og få `dotnet restore` til å feile) → `dotnet publish -c ${DOTNET_CONFIGURATION}` → `mcr.microsoft.com/dotnet/aspnet:10.0` (MCR, ingen Docker Hub-ratelimit).
- `ENV ASPNETCORE_HTTP_PORTS=8080 ASPNETCORE_ENVIRONMENT=${ASPNETCORE_ENV}` (ikke `ASPNETCORE_URLS`, som gir en overstyringsadvarsel i aspnet-imaget), `EXPOSE 8080`, `USER app` (ikke-root, ingen skriverett i `/app`).
- `curl` installeres for `HEALTHCHECK CMD curl -fsS http://localhost:8080/ready || exit 1`. Swarm-tjenesten i Dokploy blir da `unhealthy` hvis databasen ikke nås, og en ny versjon som ikke blir frisk kan rulles tilbake.
- `.dockerignore` i repo-roten holder `.env*`, `bin`, `obj`, `node_modules` og `docs` ute av byggkonteksten.
- Påkrevd konfig valideres ved oppstart: mangler `Mongo__ConnectionString`, `Mongo__Database` eller `Jwt__Secret` (≥ 32 tegn), nekter API-et å starte med en tydelig feilmelding i Logs-fanen. Det er med vilje – feilen kommer med én gang, ikke ved første request.
- `UseForwardedHeaders` med `XForwardedFor | XForwardedProto`, `ForwardLimit = 1` og tømte `KnownProxies`/`KnownIPNetworks` (containeren nås kun via Traefik eller nginx på `dokploy-network`). Riktig klient-IP trengs av rate-limiteren på `/auth/*`.

**Web-imaget (`infra/web/Dockerfile` + `infra/web/nginx.conf`)**
- `public.ecr.aws/docker/library/node:24-alpine` (ECR Public, ingen Docker Hub-ratelimit) → `npm ci` mot innsjekket lockfile → `ng build --configuration ${NG_CONFIGURATION}` → `public.ecr.aws/nginx/nginx:alpine`.
- `COPY infra/web/nginx.conf /etc/nginx/templates/default.conf.template` og `ENV API_UPSTREAM=http://api:8080 NGINX_ENVSUBST_FILTER=^API_UPSTREAM$`. Filteret er viktig: uten det bytter envsubst ut **alle** `$…`, også nginx sine egne variabler.
- `nginx.conf`:
  ```nginx
  resolver 127.0.0.11 valid=10s ipv6=off;          # Docker-DNS, slås opp per request
  client_max_body_size 10m;                         # bildeopplasting (nginx-standard er 1 MB)
  location ^~ /api/ {
      set $api_upstream ${API_UPSTREAM};            # variabel → nginx starter selv om API-et er nede
      proxy_pass $api_upstream;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $http_x_forwarded_for;     # Traefiks verdi videre uendret
      proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto; # https fra Traefik, ikke nginx sin http
  }
  location = /index.html { add_header Cache-Control "no-cache"; }
  location ~ ^/(ngsw\.json|ngsw-worker\.js|manifest\.webmanifest)$ { add_header Cache-Control "no-cache"; }
  location / { try_files $uri $uri/ /index.html; }  # SPA-fallback; hashede js/css/fonter caches lenge
  ```
  Avvik fra oppskriften: den bruker `$proxy_add_x_forwarded_for` og `$scheme`. Bak Traefik legger det Traefik-IP-en sist, så alle brukere får samme IP i rate-limiteren, og API-et tror requesten kom over `http`. Derfor sendes Traefiks egne verdier videre uendret.
- `HEALTHCHECK CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1` (busybox-wget finnes i alpine).
- Environment i Dokploy: `API_UPSTREAM=http://<API-appens tjenestenavn>:8080`. Dokploy lar deg ikke velge containernavn, men Docker-DNS slår opp tjenestenavnet Dokploy genererer. Det leses i API-appens Logs-fane (`<tjenestenavn>.1.<id>`). Networks-seksjonen røres ikke (`dokploy-network`).

**Lokalt**
- Utvikling: `dotnet run --project backend/src/Returapp.Api` (leser `.env.development`, port 5080) + `npm start` i `frontend/` (proxy `/api` → 5080).
- Teste imagene som i Dokploy: `docker build -f infra/api/Dockerfile -t returapp-api .` → `docker run --rm --read-only --tmpfs /tmp --env-file .env.development -p 8080:8080 returapp-api`, og tilsvarende `infra/web` med `-e API_UPSTREAM=http://host.docker.internal:8080 -p 8081:80`.

**MongoDB-fallgruver**
- Fjern `authMechanism=DEFAULT` fra tilkoblingsstrengen (Compass legger den på, .NET-driveren støtter den ikke). `directConnection=true` er riktig mot én server.
- Returapp bruker ikke transaksjoner (løpenummer via `$inc`, enkeltdokument-oppdateringer, foreldreløse bilder ryddes med TTL). Standalone Mongo uten replica set holder derfor. Innføres transaksjoner senere, må Mongo kjøre som (ett-node) replica set.

**Hemmeligheter**: Dokploy lagrer Environment i klartekst. Prod og dev har ulike hemmeligheter og ulike databaser. Nøkler som har ligget et sted de ikke skulle, roteres.

---

## 3. Faser og steg

Rekkefølgen er valgt slik at noe kjørbart finnes etter hver fase, og slik at frontend og backend kan jobbes parallelt fra fase 3 (API-kontrakten i 2.6 er avtalen). Hvert steg er ment å være én commit/PR-størrelse.

### Fase 0 – Repo og fundament (½ dag)

1. `git init`, `git remote add origin git@github.com:opdahlmann/returapp.git`, branch `main`.
2. `.gitignore` (root): `.env`, `*/.env`, `node_modules/`, `bin/`, `obj/`, `dist/`, `.angular/`, `.DS_Store`, `playwright-report/`, `test-results/`.
3. `.env.development.example` (innhold fra 2.4). `README.md` med "kom i gang" (kopier `.env.development.example` → `.env.development`, fyll inn Mongo, `dotnet run`, `npm start`).
4. ~~`docker-compose.yml`~~ – utgår. Publisering skjer med Dokploy og Dockerfiles (2.8). Fila ble laget i fase 0 og fjernet igjen 2026-09-15.
5. `.github/workflows/ci.yml`: to jobber (backend: `dotnet test`; frontend: `npm ci && npm test && npm run build`) + en e2e-jobb (fase 12).
6. Første commit. **→ Her stopper Claude og ber brukeren fylle inn `.env.development` med dev-databasen.** Alt videre backend-arbeid verifiseres mot den.

*Ferdig når:* repo er pushet, `.env.development` finnes lokalt og er ignorert av git, CI kjører (grønt på tomme prosjekter).

### Fase 1 – Backend-skjelett, Mongo, seed, testharness (1 dag)

1. `dotnet new sln` (gir `Returapp.slnx` i .NET 10), `global.json` med SDK `10.0.102`, `dotnet new web -n Returapp.Api` (Minimal API), `dotnet new xunit -n Returapp.Api.Tests`. Pakker legges til i fasen de brukes: `MongoDB.Driver` (fase 1), `Microsoft.AspNetCore.Authentication.JwtBearer` (fase 2), `SixLabors.ImageSharp` (fase 5). `PasswordHasher<T>` ligger allerede i ASP.NET Core-rammeverket, så `Microsoft.Extensions.Identity.Core` trengs ikke som pakke. Test: `Microsoft.AspNetCore.Mvc.Testing`.
2. `.env`-loader i `Program.cs` etter 2.4 (leser `.env.{ASPNETCORE_ENVIRONMENT}` fra repo-roten hvis den finnes, satte variabler vinner). Påkrevd konfig (`Mongo__*`, `Jwt__Secret` ≥ 32 tegn) valideres ved oppstart.
3. `Db.cs`: `MongoClient`, `IMongoDatabase`, typed collections, `EnsureIndexes()` (alle indekser fra 2.5; API-et kjører med `InvariantCulture`, ellers blir indeksnavn locale-avhengige – nb-NO gir `createdAt_−1` med U+2212 og kolliderer med containerens `createdAt_-1`), `NextPickupId()` (`counters`, `$inc`, returnerer `"R-{seq}"`, startverdi 2045 så demo-data og nye ordre ikke kolliderer).
4. Modeller i `Models/` som records med `[BsonId]`/`[BsonElement]` der navn avviker. Enum-lignende statuser som `string`-konstanter (`PickupStatus.Ny = "ny"` …) – samme verdier som prototypen.
5. `GET /health` → 200 `{ ok: true }` (liveness, ingen DB). `GET /ready` → databaseping, 200 eller 503. Begge på rota, ikke under `/api`. Ingen CORS (same-origin, 2.8). `UseForwardedHeaders` som i 2.8, ingen `UseHttpsRedirection`. Global feilhåndtering → `ProblemDetails` (innebygd, ingen stack traces). `launchSettings.json`: `http://localhost:5080` (matcher `proxy.conf.json` i fase 3).
5b. `infra/api/Dockerfile` etter 2.8. CI får en jobb som kjører `docker build -f infra/api/Dockerfile .`. Verifiser lokalt med `docker run --read-only --tmpfs /tmp --env-file .env.development` → `/ready` gir 200 mot dev-databasen.
6. Seed: `Seed/postnr.csv` (Bring: Postnummerregister, tab-separert `postnr, poststed, kommunenr, kommune, kategori`) importeres hvis `postnr` er tom. Demo-seed (kategorier, firma, brukere, ordre, support) når `App__SeedDemo=true` og tom DB. Datoer i demo settes relativt til i dag (R-2041 planlagt = neste onsdag osv.) slik at skjermene ser ut som prototypen.
7. Testharness: `ApiFixture : WebApplicationFactory<Program>` mot den ene dev-databasen fra `.env.development` (CI: secrets). Setter `ASPNETCORE_ENVIRONMENT=Development`, `App__DevEndpoints=true`, `Sms__Provider=Console`, `Mail__Provider=Console`, `App__SeedDemo=true`. **Ingen testdatabaser, ingen Testcontainers, ingenting droppes.** Testene lager egne data merket med `ApiFixture.RunId` (egne firma/brukere/tellere), sletter kun det de selv har laget, og asserter relativt til egne data – slik tåler de delte demo-data og parallelle kjøringer. Tester endrer aldri demo-data destruktivt (f.eks. kategori-rekkefølge) uten å sette dem tilbake. Hjelpere: `LoginAs("jonas.hem@skanska.no")` → `HttpClient` med Bearer; `LastSms(phone)` / `LastMail(to)` leser fra minnebufferen i Console-senderne.
8. Tester: `Health_returns_ok`, `Ready_returns_ok_when_db_reachable`, `Seed_creates_categories_in_design_order`, `Seed_imports_postnr_with_title_case_kommune`, `NextSeq_is_unique_under_parallel_calls` (100 parallelle kall på egen teller → 1…100, telleren slettes), `Pickup_counter_starts_after_demo_ids`, `Phone_normalizes_to_e164`.

*Ferdig når:* `dotnet run` svarer på `/ready` mot dev-DB, `dotnet test` er grønt mot dev-databasen, API-imaget bygger og starter med `--read-only`. Brukeren kan da opprette `returapp-dev-api` i Dokploy (branch `opd`) etter `DEPLOY.md`, og `https://dev-api.returapp.no/ready` gir 200.

### Fase 2 – Autentisering, roller, gjest, invitasjon (1–2 dager)

1. `Services/Jwt.cs`: utsted access-token (claims: `sub`, `roles`, `companyId`, `guest`), refresh-token (random 32 byte, SHA-256-hash lagres på bruker med utløp).
2. `Services/Otp.cs`: generer 6 siffer, lagre hash + utløp 5 min + attempts i `otps`, `ISmsSender` → `ConsoleSmsSender` (logger `[SMS] +47… : 123456`) og `TwilioSmsSender` (HTTP mot Twilio REST, ingen SDK-pakke – ett `HttpClient.PostAsync`). Rate-limit: maks 3 sendinger per telefon per 10 min (teller i `otps`).
3. `Endpoints/Auth.cs`: alle endepunkter fra 2.6. `verify`: ukjent telefon → opprett bruker med rolle `giver` (navn settes senere i profil); ved hver vellykket SMS-innlogging adopteres gjest-ordre med samme `guestPhone` (`giverUserId` settes) slik at "Opprett konto" gir gjesten historikken sin. `login`: e-post + `PasswordHasher.Verify`. `guest`: returnerer anonymt token med `guest=true` og `gid`-claim (24 t), ingen bruker. `GET /dev/last-sms` og `GET /dev/last-mail` registreres kun når `App__DevEndpoints=true` (lokalt og i tester, aldri i Dokploy – de avslører OTP-koder). `forgot`/`reset`: token 1 t via e-post (`IMailSender` → `ConsoleMailSender` logger og holder siste e-poster i minnet, `SmtpMailSender` via innebygd `SmtpClient`). `invite/accept`: bruker opprettes/oppdateres med rolle(r) fra invitasjonen og `companyId`.
4. `Require(ctx, "admin")`-hjelper og `CurrentUser(ctx)` (leser claims). Gjest tillates kun på: `POST /pickups` (krever `contact` + `phone` i body), `GET /pickups?scope=mine` (matcher `guestId`), `GET /pickups/{id}` (egen `guestId`), `POST /pickups/{id}/cancel` (egen), `GET /categories`, `GET /postnr/{nr}`, `POST /coverage-alerts {postnr, phone}`, `POST /tips`.
5. `GET /me` returnerer bruker + `roles`-objekt + `company` (navn) slik at frontend kan vise "Hvem er du i dag?"-kortene (`who · org`).
6. Tester: OTP-flyt ende til ende (send → les kode fra `ConsoleSmsSender`-buffer i test → verify → 200 med roller), feil kode ×5 → 429/låst, login med feil passord → 401, refresh roterer token og gammelt avvises, gjest kan opprette ordre men får 403 på `/pickups?scope=company`, admin fra firma A får 404 på ordre i firma B, invitasjon gir riktig rolle + companyId, passord-reset-token engangs.
7. Rate-limit på `/api/auth/*` (innebygd `RateLimiter`, fast vindu per klient-IP, `App__AuthRateLimitPerMinute`, standard 30) legges inn allerede her, ikke i fase 13. Refresh-tokens per bruker begrenses til de 10 siste (`$push` med `$slice`), så gamle innlogginger ikke fyller dokumentet.
8. Testene «gjest får 403 på `/pickups?scope=company`» og «admin fra firma A får 404 på ordre i firma B» krever pickup-endepunktene og ligger derfor i fase 5.

*Ferdig når:* alle auth-flyter fra login-, kode- og rolleskjermen kan kjøres med `curl`, tester grønne.

### Fase 3 – Frontend-fundament: PWA, design-system, shell, auth-skjermer (2 dager)

1. `npx @angular/cli@22 new frontend --standalone --style=css --routing --ssr=false` (global `ng` på maskinen er v19), `ng add @angular/pwa`. `proxy.conf.json` (`/api` → `http://localhost:5080`) brukes av `npm start`. `package.json`-scripts: `start`, `build`, `test` (vitest), `e2e` (playwright). Prettier følger med CLI-en; ESLint legges ikke til før noen savner det.
2. Fonter: last ned Figtree 400/500/600/700/800 woff2 (latin + latin-ext) til `public/fonts/`, `@font-face` i `styles.css` med `font-display: swap`. Manifest: navn "Returapp", theme `#1B4D2B`, bakgrunn `#F3F4EF`, ikon = logo-SVG fra login-skjermen rastrert til 192/512 px (+ maskable).
3. `styles.css`: tokens (1.2), reset fra prototypen (`button{font:inherit;cursor:pointer;color:inherit}`, placeholder-farge, `a`), keyframes og `.app`-flaten (maks 480px, `100dvh`). Print-CSS kommer i fase 5. **Endret:** ingen utility-klasser – malene får prototypens inline-styles ordrett (se 2.2). Fast topp/bunn-padding fra prototypen beholdes som `max(58px, env(safe-area-inset-top))` / `max(30px, env(safe-area-inset-bottom))`, så desktop-viewport blir identisk med prototypen.
4. `ui/icon`: `icons.ts` (path-tabellen kopiert 1:1 fra `RA.ICONS`), `<ra-icon>`.
5. `core/`: `HttpClient` direkte mot relativ `/api` (ingen `api.ts`-wrapper), `http.ts` (token-interceptor + `authGuard`/`roleGuard`), `ref.store.ts` (postnummer-oppslag med cache), `token.interceptor.ts` (Bearer + 401 → refresh → retry én gang → logout), `auth.store.ts` (signals: `user`, `role`, `isGuest`, `roles[]`, `login/verify/guest/logout/switchRole`), `guards.ts` (`authGuard`, `roleGuard('admin')`), `theme.ts`, `format.ts`.
6. `shell/`: `shell.component` (header med tittel/undertittel/tilbake/bjelle/initialer, innhold-scroll med `padding:4px 20px 120px`, bunnmeny med badges), `sheet.component` (overlay + ark med `ra-up`, `max-height:82%`), `toast` (i `ShellStore`). Tabs-definisjon per rolle = `TABS` fra prototypen (samme rekkefølge, etiketter, ikoner).
7. `auth/`: `login` (segment SMS/E-post, gjest, "Glemt passord?" → sheet med e-post → `POST /auth/forgot`), `code` (6 siffer, `inputmode=numeric`, autofokus, "Send ny kode" med 30 s nedtelling), `roles` (kort per rolle brukeren har, tekst `navn · org` per 1.8), `invite/:token` og `reset/:token` (samme grønne login-stil: navn + passord / nytt passord). Etter verify: 1 rolle → rett inn på rollens første tab; >1 → `/roles` (alltid, som i designet).
8. `app.routes.ts`: `/login`, `/code`, `/roles`, og for hver rolle en lazy `loadChildren` med `canMatch: roleGuard`. Rot-ruter får `data: { root: true, tab: 'g_home', title: … }`. `/p/:id`, `/p/:id/thread|receipt|label` og `/profile` er felles og tilgjengelige for alle roller (visningen inne tilpasser seg `AuthStore.role`).
9. `profile/`: hele profilskjermen (initialer, navn/org/rolle, rediger-sheet, bytt rolle 2-grid, "Mitt postnummer" for giver, tema-toggle, 3 varsel-toggles, hjelp og support → oppretter supportsak via sheet, logg ut, versjon). Lagrer via `PATCH /me`.
10. Tester (Vitest): `format.ts` (kg/co2/relDay/relTime med faste datoer), `AuthStore` (verify → rolle-valg-logikk), `ShellStore` (toast timer, sheet åpne/lukke), `ra-icon` rendrer riktig antall paths. Playwright: login via SMS (dev-kode leses fra `GET /api/dev/last-sms`, som kun finnes når `App__DevEndpoints=true`), rolle-valg, tema-bytte persisterer.

11. `infra/web/Dockerfile` + `infra/web/nginx.conf` etter 2.8. CI-jobben bygger også dette imaget. Verifiser lokalt: web-containeren mot API-containeren gir innlogging via `/api`, dyp lenke (`/p/R-2041`) laster appen (SPA-fallback), opplasting på 9 MB går gjennom proxyen.

*Ferdig når:* man kan logge inn (SMS og e-post), velge rolle, se tom shell med riktig header/tabs for alle 4 roller, profil fungerer, lys/mørk er pixel-lik prototypen. Brukeren kan da opprette `returapp-dev-web` i Dokploy, slik at dev-miljøet kjører fra `opd` på `https://dev-app.returapp.no`.

### Fase 4 – Kategorier, postnummer, dekning (1 dag)

Backend
1. `Endpoints/Categories.cs`: `GET` (sortert på `order`), `POST/PATCH/DELETE` + `PUT /order` (super). `kgPerUnit`-standard per kategori (initialverdi 18 kg/stk som prototypen; superbruker kan justere senere – felt finnes, UI i sheet `cat` får et ekstra "kg per enhet"-felt bare hvis brukeren ønsker det; ellers holdes designet uendret og verdien redigeres via API).
2. `Endpoints/Postnr.cs`: `GET /postnr/{nr}` → `{poststed, kommune, covered, companyId, companyName}`. `covered` = finnes aktivt firma med kommunen i `coverage`. `GET /postnr/kommuner?q=` → per kommune (alle kommuner som har minst ett postnr i registeret **eller** minst ett firma), antall postnr, firmaer.
3. `PUT /companies/{id}/coverage` (admin for eget firma, super for alle). Ved endring: finn `coverageAlerts` for postnr i nye kommuner → send SMS/e-post "Nå henter {firma} i {postnr}" → sett `notifiedAt`. Ordre uten firma i disse postnr får `companyId` satt og status forblir `ny` (admin får dem i innboksen) + notifikasjon til giver.
4. `Services/Weight.cs`: `EstimateKg(category, unit, qty)` = `kgPerUnit[unit] * qty`, `Co2(kg)` = `kg * 0.9` (faktor i config `App__Co2Factor`).
5. Tester: postnr-oppslag (4608 → Kristiansand), dekning på/av endrer `covered`, coverageAlert utløses ved ny dekning, kategori-rekkefølge, kg-estimat.

Frontend
6. `RefStore` (kategorier + postnr-oppslag med cache). Superbruker `s_cats` (rader, opp/ned, sheet `cat`/`catnew` med ikonvelger 5×3) og `s_postnr` (søk, rader med pille). Admin `a_coverage` (3-kol kommune-grid, "{n} postnummer dekkes nå"). Kommunelisten for admin = alle kommuner i fylkene firmaet holder til i eller dekker (fylke = to første siffer i **kommunenummeret** fra postnummerregisteret – like enkelt som postnr-prefiks, men gir ekte fylker), pluss de firmaet allerede dekker. Dekkede kommuner først, deretter alfabetisk (nb-NO). `GET /api/companies/{id}/coverage` gir listen og antall postnummer.

*Ferdig når:* superbruker kan administrere kategorier og se dekning, admin kan slå kommuner på/av, `GET /postnr/4878` svarer "ikke dekket" til Sirkula er godkjent og dekker Grimstad.

### Fase 5 – Henteordre: wizard, bilder, detalj, liste, merkelapp, kvittering (3 dager)

Backend
1. `Endpoints/Photos.cs`: `POST /photos` (multipart, maks 10 MB → 413 over det, kun image/* verifisert ved dekoding i ImageSharp; leses til `MemoryStream`, aldri temp-fil – `FormOptions.MemoryBufferThreshold` settes til 10 MB så ASP.NET ikke bufrer til disk; original skaleres til maks 2048 px JPEG → dokument i `files`, thumbnail 400 px → eget dokument; returnerer `{fileId, thumbId, w, h}`), `GET /photos/{id}` (leser dokumentet og returnerer `data` med riktig `Content-Type` og cache-headers; krever token – giver egne, firma sine, super alle). Opplastede bilder som aldri knyttes til en ordre ryddes: `files` med `pickupId = null` eldre enn 24 t slettes via TTL-indeks på `orphanExpires` (feltet fjernes når bildet knyttes til ordre).
2. `Endpoints/Pickups.cs`:
   - `POST /pickups`: validering (kategori finnes, qty > 0, unit i liste, cond i liste, postnr 4 siffer og i register, adresse ≥ 3 tegn), `kommune` fra register, `companyId` fra dekning, `estKg` fra `Weight`, `title = "{qty} {unit} {kategorinavn lower}"`, `statusLog: [{ny}]`, geokoding (Kartverket `https://ws.geonorge.no/adresser/v1/sok?sok=…&postnummer=…`, best-effort, timeout 2 s), `NextPickupId()`. Gjest: `guestId` fra claim, `contact`/`phone` påkrevd i body → `guestPhone`. Etter lagring: notifikasjon til firmaets admin(er) ("Ny henteordre R-2045"), til giver SMS/e-post-bekreftelse (etter preferanser; gjest alltid SMS).
   - `GET /pickups` med `scope`: `mine` (giverUserId, eller guestId for gjest, eller guestPhone = brukerens telefon for gjest-ordre som er "adoptert" etter kontoopprettelse) + `filter=aktive|ferdige`; `company` (+`status`); `driver` (driverId = meg, `date`); `market` (companyId = mitt, `open && ny`); `all` (super, `filter=ubehandlet|utenfirma|behandlet`). Returnerer DTO med utledede felter som frontend trenger (`statusLabel` beregnes i frontend; backend gir `driverName`, `companyName`, `categoryName`, `categoryIcon`, `kommune`, `photoCount`, `lastMessage`, `suggestedDriverId/Name`).
   - `GET /pickups/{id}` (eierskap), `POST /pickups/{id}/cancel` (giver, kun aktiv → `avbrutt`, notifiser firma).
2b. `Services/Notify.cs`: én hjelper `Notify(userIds | guestPhone, type, title, body, pickupId)` som skriver til `notifications` og sender SMS/e-post etter mottakerens `notif`-preferanser. Alle hendelser i fase 5–8 går gjennom denne; fase 9 legger bare til push.
3. `Endpoints/Export.cs` – kun `receipt.pdf` og `label.pdf` i denne fasen (QuestPDF: samme innhold som skjermene; brukes for e-postvedlegg og "Del"). Kvittering sendes på e-post ved `hentet` (fase 7) hvis `notif.email`.
4. Tester: opprett ordre som giver (id `R-2045`, company `omb`, status `ny`, estKg), opprett i postnr uten dekning → `companyId=null` og synlig i `scope=all&filter=utenfirma`, gjest-ordre, validering (400 på manglende qty), giver ser ikke andres ordre, cancel på hentet → 409, bildeopplasting lagrer original + thumbnail som to dokumenter i `files` (ingen filer skrevet til disk), fil over 10 MB → 413, ikke-bilde → 400, bilde uten tilknytning har `orphanExpires`, `receipt.pdf` returnerer `application/pdf`.

Frontend
5. `PickupStore`: `list(scope, params)`, `get(id)`, `create(dto)`, `cancel(id)`, cache med `refresh()`; polling ikke nødvendig her.
6. `giver/home`: alle elementer fra 1.5 (varsel uten dekning med "Tips et firma"/"Varsle meg" → `POST /coverage-alerts` – for gjest åpnes et lite sheet som ber om mobilnummer først, CTA, gjenta, kategorigrid, "Pågående" med alle aktive egne ordre + "Se alle", miljøkort, gjestekort med "Opprett konto" → `/login`). Undertittel `org · postnr` (gjest: "Meld henting uten konto"). Gjest uten postnr: dekningsvarselet vises ikke før postnr er kjent (skrives i wizard).
7. `giver/new` (wizard): fem steg som i designet; state i en `signal<WizardState>` i komponenten; `?cat=` query for direkte steg 2; `?repeat=1` for forhåndsutfylling fra siste egne ordre (steg 5). Bilder: `<input type="file" accept="image/*" capture="environment">` for "Ta bilde", uten `capture` for "Galleri"; opplasting starter umiddelbart med thumbnail-visning og fjern-X; maks 6. Postnr-felt slår opp sted via `RefStore` (debounce 300 ms) og viser varsel hvis ikke dekket. Dag-chips genereres fra dagens dato. Validering og toasts identiske med prototypen. Innsending → `/p/{id}` + toast (`"Henting meldt – {firma} er varslet"` / `"Registrert – vi varsler deg når noen dekker området"`).
8. `giver/list` (segment, eksport-knapp på Historikk → sheet `export`, kort) og `giver/msgs` (tråder = ordre med `lastMessage`).
9. `pickup/detail`: felles komponent; rolle-seksjoner vises etter `AuthStore.role`. Tidslinje etter samme regler som prototypen (idx-beregning, avvik-rad, avbrutt erstatter). Bildestripe med ekte thumbnails (klikk → fullskjerm `<dialog>` med original). Ring = `<a href="tel:">`. Handlinger for admin/driver/super kobles i fase 6–8, men knappene rendres nå.
10. `pickup/label`: QR (`qrcode` → SVG, 180 px) med `App.baseUrl/p/{id}`, "Skriv ut" → `window.print()` med `.print-area`, "Del" → `navigator.share({url})` med fallback clipboard + toast "Delingslenke kopiert".
11. `pickup/receipt`: som designet; "PDF" → åpner `GET /pickups/{id}/receipt.pdf` (blob → `window.open`), "Del" → share/clipboard.
12. Sheets `cancel`, `postnr`, `tip`, `export` (eksport-valg kaller `GET /export/pickups.{csv|xlsx|pdf}?scope=mine` – implementeres fase 10, til da toast "Kommer").
13. Tester: Vitest på wizard-validering og dag-chip-generering; Playwright: full "Meld henting"-flyt med bildeopplasting (testfil), verifiser detalj-siden, avbryt, merkelapp viser QR med riktig URL.

*Ferdig når:* en giver kan registrere en henting med bilder fra mobil (PWA på telefon mot dev-API), se den i liste og detalj, skrive ut merkelapp, avbryte.

### Fase 6 – Admin (hentefirma): innboks, tildeling, børs, ruter, firma, sjåfører, avdelinger, statistikk (3 dager)

Backend
1. `POST /pickups/{id}/assign {driverId?, day, slot}`: admin/super: driver må tilhøre firmaet; `day && slot` → `planlagt`, ellers `tildelt`; `open=false`; `statusLog`; notifikasjon til sjåfør (push/SMS) og giver ("Planlagt ons 16. sep 09–12 · Kari Aasen", SMS hvis `notif.sms`, gjest alltid SMS). Sjåfør: kun `driverId = meg` og ordren må være `open && ny` i eget firma (børs).
2. `POST /pickups/{id}/market {open}` (admin), `GET /pickups?scope=company&status=` med tellere per status i respons-header eller eget `GET /pickups/counts?scope=company` (én query med `$group`).
3. Sjåførforslag i DTO: første sjåfør i firmaet med `areas` som inneholder ordrens kommune, ellers sjåføren med færrest planlagte stopp den dagen.
4. `Endpoints/Routes.cs`: `GET /routes?driverId&date` → `pickupIds` i lagret rekkefølge (+ sjåførens planlagt/underveis-ordre den dagen som ikke er i lista, lagt til bakerst – samme regel som prototypens `routeIds()`), `km` (luftlinje × 1,3 mellom geokodede punkter, 0 hvis mangler koordinater), `PUT /routes` (rekkefølge), `POST /routes/send` (push + SMS til sjåfør "Ruten for {dato} er klar: {n} stopp", `sentAt`).
5. `Endpoints/Companies.cs`: `GET /companies/{id}` (admin eget), `PATCH` (navn, tlf, by), departments CRUD, `GET /companies/{id}/drivers` (users med `driver` og `companyId`, + `today` = planlagt/underveis i dag, `done` = hentet totalt), `POST /companies/{id}/invite-driver {name, phone}` → `invites` + SMS med lenke `App.baseUrl/invite/{token}`.
6. `GET /companies/{id}/stats?period=week|month`: hentinger (hentet i perioden), kg i perioden, snitt responstid (gjennomsnitt `planlagt.at - ny.at` i dager, 1 desimal), hentinger i måned, kg totalt måned, % uten avvik (`hentet / (hentet + avvik)`), CO₂, kg per kategori (topp 4 + "Annet"), aggregert med én `$facet`-pipeline.
7. Tester: assign uten tid → tildelt, med tid → planlagt, sjåfør fra annet firma → 400, børs-toggle, sjåfør tar oppdrag fra børs → planlagt og `open=false`, sjåfør kan ikke ta ordre som ikke er på børs, rute-rekkefølge lagres og manglende ordre legges bakerst, stats-tall mot deterministisk seed (testen beregner fasit fra seed-definisjonen, ikke hardkodede tall), invite-driver oppretter invitasjon.

Frontend
8. `admin/inbox`: filterchips med tellere, kort med "På børs"/sjåfør-pille, handlingsrad for `ny` (Tildel {forslag} → sheet `assign` med `driver` forhåndsvalgt / Annen / børs-ikonknapp), "Planlegg tidspunkt" for `tildelt`, avviksrad. Undertittel "{n} nye henteordre".
9. Sheet `assign`: sjåførliste med "Foreslått", dag-chips (6), tidsvindu (4), "Bekreft – giver varsles". `fixed`-modus for sjåfør (fase 7). Toast som prototypen.
10. `admin/routes`: sjåfør-chips (fra `/companies/{id}/drivers`), datovelger (`<input type="date">` stylet som chip med kalender-ikon og tekst "Ons 16."), skjematisk kart (`ui/schematic-map`: samme SVG-veier som designet, punkter fra `POS`-tabellen, stiplet polyline), "{n} stopp · ca {km} km", liste med opp/ned (`PUT /routes` ved hver flytting), "Send rute til sjåfør". Tom-tilstand når valgt sjåfør ikke har stopp: "{navn} har ingen planlagte stopp {dato}." (prototypens toast-tekst, vist som stiplet tomkort).
11. `admin/company` (tittel = firmanavn, 3 stat-kort, meny med beregnede undertekster: "{n} aktive · inviter flere", "{n} postnummer – styrer …", avdelingsbyer kommaseparert, firmakort), `admin/drivers` (kort, ring-lenke, "Inviter sjåfør" → sheet med navn+telefon), `admin/depts` (kort per avdeling, "Legg til avdeling" → sheet med navn/type/adresse/telefon/åpningstider/mottak), `admin/stats` (4 stat-kort, stolper med prosent = kg/maks, "Eksporter rapport" → sheet `export` med `scope=company`).
12. Detalj-handlinger for admin: forslagskort, "Tildel sjåfør og planlegg", "Legg på børs/Fjern fra børs", "Planlegg tidspunkt", "Endre sjåfør eller tid", "Ring giver", "Melding".
13. Tester: Playwright admin-flyt: ny ordre i innboks → tildel Kari ons 09–12 → status Planlagt → vises i Ruteplan → flytt opp/ned → send rute; stats-siden viser tall fra API.

*Ferdig når:* admin i Ombruksfabrikken kan gjøre alt designet viser, med ekte tall, og en sjåfør får varsel.

### Fase 7 – Sjåfør: i dag, børs, rute, henting, avvik (2 dager)

Backend
1. `POST /pickups/{id}/start` (driver = meg, status `planlagt|tildelt` → `underveis`; giver får push/SMS "Kari er på vei" hvis `notif`).
2. `POST /pickups/{id}/complete {qty, note, photoIds}`: krever ≥1 bilde (400 ellers), `pickedAt=now`, `pickedQty`, `estKg = estKg * qty/opprinnelig qty` (avrundet), status `hentet`, `statusLog`. Etterpå: kvittering til giver (e-post med `receipt.pdf` hvis `notif.email`; SMS med lenke hvis `notif.sms`/gjest), notifikasjon til admin.
3. `POST /pickups/{id}/deviation {reason, note}`: driver/admin, aktiv ordre → `avvik`; notifikasjon til admin og giver ("Avvik meldt – admin og giver er varslet"). Årsakene valideres mot lista i designet.
4. `GET /pickups?scope=driver&date=today` gir `stops` (planlagt/underveis i dag, i rutens rekkefølge) og `doneToday` (hentet/avvik med `pickedAt`/`deviation.at` i dag). `GET /pickups?scope=market`.
5. `POST /pickups/{id}/scan` – ikke nødvendig: skanning i frontend leser URL-en i QR-en og navigerer til `/p/{id}`; på `d_complete` bekrefter skanningen at riktig ordre er åpen (toast "Merkelapp bekreftet: R-2041" / "Feil merkelapp – dette er R-2037").
6. Tester: start → underveis; complete uten bilde → 400; complete med 20 av 24 → kg 600; deviation på hentet → 409; scope=driver viser bare mine; market viser bare eget firma.

Frontend
7. `driver/today`: 3 stat-kort (stopp igjen, km fra `/routes`, antall på børsen), "Dagens stopp" (nummererte kort, tidsvindu-pille, mengde · kg, kontakt, "uten tilstede"-merke), tom-tilstand, "Gjort i dag". Undertittel = dagens dato (`"Fredag 11. september"` via `Intl`).
8. `driver/market`: kort + "Ta oppdraget" → sheet `assign` i fixed-modus ("Du tar oppdraget selv …", dag/tid) → `POST assign {driverId: me}`.
9. `driver/route`: skjematisk kart, "Start navigasjon" → Google Maps-dir-URL med alle stopp som waypoints (`/maps/dir/?api=1&destination=…&waypoints=…`), stoppliste.
10. `driver/complete` (`/p/{id}/complete`): ordrekort, bildegrid ("Ta bilde" med `capture`, "Skann lapp" → `ui/qr-scanner` (BarcodeDetector → fallback `@zxing/browser`) i `<dialog>`), stepper med "{enhet} · meldt {n}", merknad, "Bekreft hentet" (validering ≥1 bilde med toast som prototypen) → `/p/{id}/receipt` + toast, "Meld avvik i stedet" → sheet `avvik`.
11. Sheet `avvik` (5 årsaker, utdyp, rød knapp) → etter sending: tilbake til rot-tab + toast.
12. Detalj-handlinger for driver: Naviger (`maps`-URL for adressen) / Ring (`tel:`) / Melding, Start henting, Fortsett henting, Se kvittering, Meld avvik.
13. Tester: Playwright sjåfør-flyt på mobil-viewport (Pixel 7-profil): I dag → stopp → Start henting → ta bilde (testfil) → juster mengde → Bekreft → kvittering; børs → Ta oppdraget → vises i I dag; meld avvik → status Avvik i admin-innboks.

*Ferdig når:* en sjåfør gjennomfører en henting fra telefonen, giver får kvittering på e-post/SMS.

### Fase 8 – Superbruker: oversikt, ordre, firma, brukere, systemvarsel, support (2 dager)

Backend
1. `GET /stats/platform`: hentinger denne måneden, tonn totalt (alle hentet), aktive firma, antall aktive brukere, ventende firma (liste med navn og kommuner for "Trenger deg"-kortet), ordre uten firma (ny), åpne supportsaker (antall + siste tekst).
2. `POST /companies/{id}/approve|reject` (super) – `approve` setter `status=aktiv`, `since=now`, sender e-post/SMS til firmaets admin, og kjører samme "ny dekning"-logikk som fase 4.3 for firmaets kommuner. `POST /companies/apply` (offentlig skjema – lenkes fra "Tips et firma"/"Del lenke": navn, org.nr, by, telefon, kontaktperson, e-post, kommuner) → `status=venter` + supportnotifikasjon til super.
3. `POST /pickups/{id}/company {companyId}` (super): setter firma, nullstiller sjåfør, status `ny`, `open=false`, notifiserer nytt firma.
4. `GET /users?q=` (søk i navn/e-post/org, case-insensitiv regex på indekserte felt, maks 50), `PATCH /users/{id} {roles, active, companyId?}` (kan ikke fjerne egen `super`), `POST /users/invite {name, email|phone, roles, companyId?}`, `POST /users/{id}/reset-password` (sender reset-lenke).
5. `GET/POST /notices` (`to: alle|hentefirma`): lagres, sendes som push til alle med abonnement (filtrert på rolle admin/driver for `hentefirma`), og vises som banner i appen (`GET /notices/active` – siste 24 t) – bannerplass: øverst i innholdet, samme stil som varselkortet (`--warn-bg`).
6. `GET /support` (åpne + lukkede), `POST /support` (alle roller, fra profil "Hjelp og support"), `POST /support/{id}/reply {text}` (e-post/SMS + in-app notifikasjon til avsender), `POST /support/{id}/close`. `GET/POST /tips`.
7. Tester: approve aktiverer dekning og tildeler ventende ordre uten firma i Grimstad til Sirkula; reject; bytt firma nullstiller sjåfør; rollebytte; kan ikke fjerne egen super-rolle; deaktivert bruker får 401 ved refresh; notis til hentefirma når bare admin/driver; support-svar lagres og lukk.

Frontend
8. Offentlig `/apply`-side ("Søk som hentefirma": navn, org.nr, by, telefon, kontaktperson, e-post, kommuner) i login-stil; lenkes fra "Del lenke til Returapp" i tips-sheetet. `super/dash` (4 stat-kort, "Trenger deg" med 3 kort → navigerer til `s_companies`, `s_orders?filter=utenfirma`, `s_support`), `super/orders` (filterchips, kort med firmanavn, "Tildel firma" → sheet `company`), `super/admin` (meny med badge), `super/companies` (kort, Godkjenn/Avvis, ring-lenke, "Detaljer" → detaljvisning med kontaktinfo, dekning, avdelinger, sjåfører, ordretall), `super/users` (søk, kort, sheet `user` med rolle-toggles + Nullstill passord + Deaktiver/Aktiver, "Inviter bruker" → sheet med navn/e-post-eller-telefon/roller/firma), `super/notice` (textarea, to knapper, "Sendt"-liste), `super/support` (åpne med "Svar" → sheet med textarea, "Lukk sak"; lukkede dempet).
9. Detalj-handlinger for super: "Firma: {navn}", "Tildel / bytt hentefirma", "Overstyr sjåfør og tid" (sheet `assign` med sjåfører fra ordrens firma).
10. Tester: Playwright super-flyt: godkjenn Sirkula → postnr-oversikt viser Grimstad med 1 firma → ordre R-2044 får firma; brukerroller; systemvarsel vises som banner hos giver.

*Ferdig når:* alle superbruker-skjermer virker mot ekte data; "Trenger deg"-tallene stemmer.

### Fase 9 – Meldinger og varsler (1–2 dager)

Backend
1. `GET /pickups/{id}/messages` (giver: egen ordre; driver/admin: eget firma; super: alle) og `POST` `{text}` (maks 2000 tegn). Melding lagres i `pickups.messages` med `fromUserId`. Mottaker(e) får push + in-app notifikasjon; giver uten push får SMS hvis `notif.sms` (maks 1 SMS per 10 min per tråd for å unngå spam).
2. `notifications`: opprettes ved alle hendelser nevnt i fasene (ny ordre, tildelt, planlagt, på vei, hentet, avvik, avbrutt, melding, support-svar, dekning, systemvarsel). `GET /notifications` (siste 50), `POST /notifications/read`.
3. Web Push: `WebPush`-pakke, VAPID-nøkler som miljøvariabler (`.env.development` lokalt, Environment i Dokploy; kommando `-- vapid` genererer), `POST /me/push` lagrer abonnement, `Services/Push.cs` sender (fjerner abonnement ved 404/410). Notifikasjonens `data.url` peker til riktig skjerm (`/p/{id}` osv.).
4. Tester: melding fra giver synlig for sjåfør, ikke for annen giver; push-abonnement lagres; notifikasjon opprettes ved assign; SMS-throttling.

Frontend
5. `pickup/thread`: bobler (mine = `fromUserId === me`), tid (`relTime`), input med send-knapp, Enter sender, autoscroll til bunn, polling hvert 5. sek mens siden er aktiv (`interval` + `takeUntilDestroyed`). Tittel = motpart (giver: sjåførnavn eller firmanavn; ellers kontaktperson), undertittel "id · tittel".
6. Bjelle → `/notifications`-side (enkel liste: ikon, tittel, tekst, tid; uleste markert; trykk navigerer). Bjellen får prikk ved uleste. Tom-tilstand "Ingen nye varsler" (samme tekst som prototypens toast).
7. Service worker: `push`-event viser notifikasjon, `notificationclick` åpner `data.url`. Profil-toggle "Push-varsler" ber om tillatelse og registrerer abonnement (`SwPush.requestSubscription`).
8. Systemvarsel-banner i shell (fra `GET /notices/active`), kan lukkes (husk i `sessionStorage`).
9. Tester: Playwright: giver sender melding → sjåfør ser den (to kontekster); badge på Meldinger-tab.

*Ferdig når:* chat fungerer mellom giver og sjåfør, push kommer på Android/desktop, in-app varsler fungerer for alle.

### Fase 10 – Eksport, PDF og deling (1 dag)

1. `GET /export/pickups.csv?scope=mine|company&from&to`: UTF-8 med BOM, `;`-separert (norsk Excel), kolonner: Referanse, Opprettet, Status, Kategori, Tittel, Mengde, Enhet, Tilstand, Adresse, Postnr, Kommune, Giver, Kontakt, Hentefirma, Sjåfør, Planlagt dag, Tidsvindu, Hentet, Hentet mengde, Anslått kg, CO₂ kg, Avvik.
2. `.xlsx` (ClosedXML): ark "Hentinger" (samme kolonner) + ark "Per kategori" (kg, antall, CO₂ per kategori).
3. `.pdf` (QuestPDF): forside med periode og miljøeffekt (kg, CO₂, antall), tabell per kategori, liste over hentinger, én kvitteringsside per hentet ordre.
3b. Alle tre formater bygges i `MemoryStream` og returneres med `Results.File(bytes, mime, filnavn)`. Ingenting skrives til disk.
4. Frontend sheet `export`: valg → `GET` som blob → `URL.createObjectURL` → `<a download>` (fungerer i PWA) + toast "CSV-fil lastet ned". `receipt`/`label` "Del" bruker Web Share med fil hvis `navigator.canShare({files})`, ellers lenke.
5. Tester: CSV har riktig antall rader og BOM; xlsx åpnes av ClosedXML og har 2 ark; pdf > 1 KB og starter med `%PDF`; admin får bare eget firma i eksporten.

*Ferdig når:* alle tre formater lastes ned fra giver-historikk og admin-statistikk.

### Fase 11 – PWA, offline, ytelse, tilgjengelighet (1 dag)

1. `ngsw-config.json`: `app` (prefetch: index, js, css, fonter, manifest, ikoner), `assets` (lazy), `dataGroups`: `/api/categories`, `/api/postnr/**` (performance, 1 d), `/api/pickups**`, `/api/me`, `/api/notifications` (freshness, timeout 3 s, 1 t). Bilder `/api/photos/**` (performance, 7 d, maks 200).
2. "Ny versjon tilgjengelig"-toast via `SwUpdate` med "Oppdater"-knapp.
3. Offline: `navigator.onLine` + `ShellStore.online`-signal; skrivende knapper viser toast "Ingen nettverk – prøv igjen" i stedet for å feile stille.
4. Ytelse: lazy routes per rolle, `@defer` på skjematisk kart og QR, `NgOptimizedImage` for thumbnails, budsjett i `angular.json` (initial < 500 kB). Lighthouse PWA-sjekk ≥ 90.
5. Tilgjengelighet uten å endre utseende: alle ikon-knapper får `aria-label` (bjelle, tilbake, ring, opp/ned, fjern bilde, send), toggles er `role="switch" aria-checked`, sheet er `role="dialog" aria-modal` med fokusfelle og Escape lukker, statuspiller har tekst (allerede), kontrast i mørk modus verifiseres (tokenene er gitt – ikke endres; avvik dokumenteres).
6. iOS: `apple-touch-icon`, `viewport-fit=cover`, `100dvh`, `-webkit-tap-highlight-color: transparent`. Designet bruker 15px på noen inputs, som gir auto-zoom ved fokus på iOS. Løsning: `@supports (-webkit-touch-callout: none) { input, textarea { font-size: 16px } }` – 1px større kun på iOS, ingen zoom-blokkering (zoom-blokkering er et tilgjengelighetsbrudd). Dokumentert avvik.
7. Tester: Playwright offline-modus (`context.setOffline(true)`) viser cachet liste og toast ved lagring; Lighthouse-kjøring i CI (`@lhci/cli`, PWA-kategori ≥ 90).

### Fase 12 – Visuell verifisering mot prototypen og e2e-dekning (2 dager)

Målet "helt lik" verifiseres systematisk, ikke etter skjønn.

1. **Referansebilder**: Playwright-script `e2e/reference/capture-prototype.spec.ts` åpner `docs/design/Returapp-standalone.html`, klikker seg gjennom hver skjerm/sheet i hver rolle i lys og mørk modus (login → SMS → kode → rolle → tabs → detaljer → sheets), og lagrer skjermbilder av **app-flaten inne i iPhone-rammen** (klipp til `402×874`-elementet) til `docs/design/screens/{rolle}/{skjerm}-{tema}.png`. ~90 bilder. Sjekkes inn.
2. **Sammenligning**: `e2e/visual/*.spec.ts` seeder samme demo-data, fryser klokken (`page.clock.setFixedTime` til samme dato som prototypen antar: fredag 11. september 2026) og tar skjermbilde av appen i viewport `402×874` for hver skjerm, `expect(page).toHaveScreenshot(referanse, { maxDiffPixelRatio: 0.02 })`. Fonter er identiske (self-hostet Figtree), så avvik blir reelle layout-avvik.
3. Kjente, aksepterte avvik (listet i `e2e/visual/ALLOWED_DIFFS.md`): statuslinje/iPhone-ramme finnes ikke; safe-area-padding i stedet for faste 58/30 px (på desktop-viewport blir det samme tall – testen kjører uten insets); ekte bilder i stedet for bilde-ikon; ekte QR i stedet for hash-mønster; relative datoer avhenger av frossen dato; beregnede statistikk-tall avviker fra prototypens hardkodede; gjest-wizard har to kontaktfelt; prototypens "Demo: hvilken som helst kode"-tekst er fjernet; "Returapp 2.0 · prototype" → "Returapp {versjon}". For skjermer med tall/bilder maskeres disse områdene (`mask: [locator]`) i stedet for å heve terskelen.
4. Alle diffs over terskel fikses i CSS/markup til testen er grønn. Denne fasen er også der utility-klassene fra fase 3 finjusteres.
5. **E2E-dekning** (Playwright, mot containerne bygget fra `infra/`: API med `--read-only --tmpfs /tmp`, `App__SeedDemo=true` og `App__DevEndpoints=true`, web på `http://localhost:8080` med `API_UPSTREAM` til API-containeren på et felles docker-nettverk, databasen er den ene dev-databasen – ingen Mongo-container): én spec per rolle som går gjennom hele designets flyt (giver: meld henting m/bilde → merkelapp → melding → avbryt; driver: børs → i dag → henting → kvittering → avvik; admin: innboks → tildel → rute → send → stats → dekning → sjåfører → avdelinger; super: godkjenn firma → tildel firma → brukere → kategori → varsel → support), pluss auth-spec (SMS, e-post, gjest, glemt passord, invitasjon) og tema/PWA-spec.
6. CI: e2e-jobben bygger begge imagene, starter API (mot dev-databasen via secrets) og web på ett docker-nettverk med `docker run` (ingen compose), venter på API-containerens `/ready`, kjører Playwright (chromium + webkit for iOS-lignende) og laster opp rapport som artifact. Siden API-et kjører `--read-only`, feiler e2e hvis noe skriver til disk.

*Ferdig når:* alle visuelle tester er grønne (eller avviket står i `ALLOWED_DIFFS.md` med begrunnelse), alle e2e-flyter grønne i CI.

### Fase 13 – Produksjon i Dokploy og drift (½ dag)

Dockerfilene finnes fra fase 1 og 3, og dev-miljøet kjører allerede fra `opd`. Denne fasen setter opp prod og driftsrutiner. Alle steg står også i `DEPLOY.md`.

1. DNS for `app.returapp.no` og `api.returapp.no` peker på Dokploy-vertens IP **før** første deploy (ellers feiler Let's Encrypt). `dev-app` og `dev-api` er satt opp fra fase 1/3.
2. `returapp-api`: Build Type Dockerfile, branch `main`, Dockerfile Path `infra/api/Dockerfile`, Build Context `.`, port 8080, domene `api.returapp.no` (HTTPS på, Let's Encrypt, HTTP→HTTPS-redirect). Environment med prod-verdier: egen database, `App__SeedDemo=false`, `App__BaseUrl=https://app.returapp.no`, ekte `Sms__Provider`/`Mail__Provider`, egne hemmeligheter, uten `App__DevEndpoints`. Deploy, og noter tjenestenavnet fra Logs-fanen.
3. `returapp-web`: branch `main`, `infra/web/Dockerfile`, port 80, domene `app.returapp.no` (HTTPS på, Let's Encrypt, HTTP→HTTPS-redirect), Environment `API_UPSTREAM=http://<tjenestenavn>:8080`. Deploy. Auto-deploy ved push til `main` slås på for begge.
4. Helsesjekk og rollback: `HEALTHCHECK` i imagene (API: `/ready`). I Dokploy settes Swarm update config til rollback når en ny versjon ikke blir frisk.
5. Røyktest: `https://api.returapp.no/health` → 200, `https://api.returapp.no/ready` → 200, `https://app.returapp.no/p/R-2041` laster appen (SPA-fallback), logg inn (beviser `/api`-proxyen), last opp et bilde (beviser 10 MB-grensen gjennom Traefik → nginx → API og lagring i Mongo), `docker service ls` → alle `1/1`.
6. Logging: innebygd `ILogger` til stdout (JSON i prod via `builder.Logging.AddJsonConsole()`), leses i Dokploy sin Logs-fane. Serilog trengs ikke. Feil fra frontend: `ErrorHandler` som POSTer til `/api/client-errors` (kun melding + url + versjon).
7. Backup: `mongodump`-cron kjører på databaseserveren, utenfor appen og Dokploy. Dokumenteres i `DEPLOY.md`.
8. Sikkerhet-sjekkliste:
   - TLS og HTTP→HTTPS i Traefik, HSTS-header fra nginx.
   - `Jwt__Secret` ≥ 32 tegn, validert ved oppstart.
   - Rate-limit på `/auth/*` per klient-IP (innebygd `RateLimiter`, krever riktig `X-Forwarded-For` som i 2.8).
   - Maks body 10 MB i både nginx og API.
   - Ingen CORS (same-origin), `App__DevEndpoints` aldri satt i Dokploy.
   - Ingen stack traces (ProblemDetails), `X-Content-Type-Options: nosniff`, bilder med korrekt MIME og `Content-Disposition: inline`.
   - Containere kjører som ikke-root, ingen volumer.
   - Hemmeligheter kun i Dokploy Environment (klartekst – roteres ved mistanke om lekkasje).

---

## 4. Teststrategi (oppsummert)

| Nivå | Verktøy | Hva | Kjøres |
|---|---|---|---|
| Backend integrasjon | xUnit + `WebApplicationFactory` mot dev-databasen | Hvert endepunkt: lykkes-sti, validering, autorisasjon (rolle + eierskap), statusoverganger, notifikasjons-sideeffekter (fanges i minnebufferen til `ConsoleSmsSender`/`ConsoleMailSender`/`FakePush` i test), aggregeringer mot kjent seed | `dotnet test`, CI |
| Backend enhet | xUnit | `Weight`, `Jwt`, `Otp`, `.env`-loader, CSV-formatering, km-beregning | samme |
| Frontend enhet | Vitest | `format.ts`, stores, wizard-validering, tidslinje-logikk, dag-chips, sheet/toast | `npm test`, CI |
| Frontend komponent | Vitest + Angular TestBed | Detalj-side viser riktige handlinger per rolle × status (tabell-test: 4 roller × 7 statuser), innboks-filtre, stat-kort-formatering | samme |
| E2E | Playwright (chromium, webkit) | Flyter per rolle, auth, PWA/offline | CI e2e-jobb |
| Container | `docker build` + `docker run --read-only` i CI | Begge imagene bygger, API starter uten skrivbar disk, nginx-proxy, SPA-fallback og 10 MB-opplasting virker (e2e går gjennom web-containeren) | CI |
| Visuell | Playwright `toHaveScreenshot` | ~90 skjermer × lys/mørk mot prototype-referanser | CI e2e-jobb |
| Ytelse/PWA | Lighthouse CI | PWA ≥ 90, performance ≥ 80 på mobil | CI (ikke blokkerende første gang) |

Regel: ingen fase er ferdig uten testene sine grønne. Mocking begrenses til eksterne tjenester (SMS, e-post, push, geokoding); database mockes aldri, og det opprettes aldri egne testdatabaser – alt testes mot den ene dev-databasen med egne, merkede testdata.

---

## 5. Risikoer og åpne beslutninger

| # | Punkt | Anbefaling / hva som må avklares |
|---|---|---|
| 1 | SMS-leverandør | Må velges før fase 2 kan testes reelt (dev fungerer med Console). Twilio er enklest å integrere uten SDK; norske alternativer (f.eks. Sveve, Link Mobility) har lignende HTTP-API. |
| 2 | E-postutsending i prod | SMTP-konto (f.eks. Postmark/SendGrid/eget). Dev skriver til fil. |
| 3 | Push på iOS | Krever at appen er lagt til hjemskjerm (iOS 16.4+). SMS er fallback for givere. |
| 4 | Bildevolum i databasen | Filer ligger i MongoDB (krav). Nedskalering til 2048 px holder snittet under 1 MB per bilde, og foreldreløse opplastinger slettes etter 24 t. Følg med på databasestørrelse og backup-tid. Ved behov kan kvalitet/oppløsning justeres i `Photos.cs`, som er eneste sted som håndterer filer. |
| 5 | Km-estimat | Luftlinje × 1,3 er "ca". Bytt til ruting-API (f.eks. OSRM/Google) hvis admin trenger nøyaktige tall. |
| 6 | Postnummerregister | Brings CSV endres årlig; legg inn kommando `-- import-postnr <fil>` for oppdatering. |
| 7 | Kg-faktorer per kategori | Prototypen bruker 18 kg × antall uansett. Reelle faktorer må fylles inn av fagperson; feltet finnes. |
| 8 | Multi-admin per firma | Modellen støtter det (flere brukere med `admin` + samme `companyId`); designet viser bare én. |
| 9 | "Excel"-eksport | Krever ClosedXML (ekstra pakke). Kan droppes til fordel for CSV hvis ingen ber om det – designet lover det, så den er med. |
| 10 | Ekte kart | Designet er eksplisitt "Skjematisk kart". Ekte kart (Leaflet/Mapbox) er bevisst utelatt. |
| 11 | Gjest-ordre og personvern | Telefonnummer lagres på ordren; sletting/anonymisering etter N måneder bør avtales (GDPR). Legg inn `-- anonymize --older-than 12m`-kommando i fase 13. |
| 12 | Hemmeligheter i Dokploy | Dokploy lagrer Environment i klartekst. Egne hemmeligheter for dev og prod, roteres ved mistanke om lekkasje. |
| 13 | Cloudflare foran Traefik | Hvis domenet proxyes gjennom Cloudflare, ser Traefik Cloudflare sin IP. Da må Traefik stole på Cloudflare-IP-ene (eller API-et lese `CF-Connecting-IP`), ellers treffer rate-limiteren alle brukere samtidig. |

---

## 6. Estimat

| Fase | Innhold | Estimat |
|---|---|---|
| 0 | Repo, env, CI-skjelett | 0,5 d |
| 1 | Backend-skjelett, Mongo, seed, testharness, API-image | 1,25 d |
| 2 | Auth, roller, gjest, invitasjon | 1,5 d |
| 3 | Frontend-fundament, design-system, shell, auth-skjermer, profil, web-image | 2,25 d |
| 4 | Kategorier, postnr, dekning | 1 d |
| 5 | Henteordre: wizard, bilder, detalj, liste, merkelapp, kvittering | 3 d |
| 6 | Admin | 3 d |
| 7 | Sjåfør | 2 d |
| 8 | Superbruker | 2 d |
| 9 | Meldinger og varsler | 1,5 d |
| 10 | Eksport/PDF/deling | 1 d |
| 11 | PWA/offline/ytelse/a11y | 1 d |
| 12 | Visuell verifisering + e2e | 2 d |
| 13 | Produksjon i Dokploy og drift | 0,5 d |
| | **Sum** | **~22,5 dagsverk** (frontend og backend kan gå parallelt fra fase 3 → ~14 kalenderdager med to i arbeid) |

---

## 7. Validering av planen

Planen ble validert i to omganger etter at den var skrevet ferdig.

### 7.1 Dekningssjekk mot prototypen (maskinell)

Alle `data-act`, `data-type` (sheets), `sc.*` (skjermer) og `data-to` (navigasjonsmål) ble trukket ut av prototypens markup og sammenlignet med planen:

| Hva | I prototypen | Dekket i planen |
|---|---|---|
| Skjermer (`sc.*`) | 33 (inkl. login/code/roles/app) | 33 – alle i 1.5 og i fasene 3–9 |
| Sheets (`data-type`) | 10 | 10 – alle i 1.5-tabellen og fasene 5–8 |
| Actions (`data-act`) | 60 unike | 60 – hver action har et endepunkt/steg (mock-actions i 1.7) |
| Mock-toasts (`data-act="mock"`) | 26 unike tekster | 26 – alle i 1.7 med reell erstatning |
| Navigasjonsmål (`data-to`) | 17 | 17 – alle har rute i 2.2 |
| Hardkodede tekster/tall | "2 aktive · inviter flere", "Vennesla, Kristiansand", "Sirkula Sør – Arendal og Grimstad", "Siste: bilder på iPhone", "Ons 16.", "Fredag 11. september", stat-tall | Alle beregnes (6.11, 8.1, 7.7, 6.10) |

### 7.2 Konsistenssjekk (gjennomlesing) – funn og rettelser

| # | Funn | Rettelse |
|---|---|---|
| 1 | `GET /api/dev/last-sms` ble brukt i fase 3-tester uten å være definert | Lagt til under "Drift" i 2.6 og i fase 2.3 (kun Development), pluss `last-mail` |
| 2 | Gjest-token krevde telefon i `POST /auth/guest`, men prototypen sender gjesten rett inn uten telefon | Anonymt gjest-token med `gid`; telefon samles i wizard steg 4; `guestId` lagt til i datamodellen; adopsjon av gjest-ordre ved SMS-innlogging (1.8, 2.5, 2.6, fase 2, fase 5) |
| 3 | 2.2 sa kvittering/merkelapp = kun print-CSS, men fase 5 lagde `receipt.pdf`/`label.pdf` med QuestPDF (trengs til e-postvedlegg og "Del") | 2.2 omformulert: print-CSS for "Skriv ut", QuestPDF for alle PDF-filer |
| 4 | Frontend-ruter manglet: `/p/:id/complete`, `/notifications`, `/invite/:token`, `/reset/:token`, `/apply` | Lagt til i 2.2 og i fase 3.7 / 8.8 |
| 5 | `GET /p/{id}` i backend var overflødig (QR peker på frontend-ruten) | Fjernet fra 2.6 |
| 6 | `GET /pickups/counts` (fase 6.2) og `GET /notices/active` (fase 8.5) manglet i API-oversikten | Lagt til i 2.6 |
| 7 | Fase 6-test påsto "14 hentinger denne uka i seed" – seeden fra prototypen har bare 1 hentet ordre | Seed utvidet med ~60 genererte historikk-ordre (2.5, 1.8); testen regner fasit fra seed-definisjonen |
| 8 | Fase 3.7 "husk rolle i localStorage og hopp over rolleskjermen" avviker fra designet, som alltid viser "Hvem er du i dag?" | Fjernet; skjermen vises alltid ved >1 rolle |
| 9 | Fase 5.6 "Pågående maks 3" – prototypen viser alle aktive | Rettet til alle aktive |
| 10 | Fase 11.6 foreslo `maximum-scale=1` (blokkerer zoom, WCAG-brudd) | Erstattet med 16px input-font kun på iOS |
| 11 | Sheets som ikke finnes i designet (inviter sjåfør, avdeling, rediger profil, inviter bruker, support-svar, ny supportsak, gjest-varsle-meg) var nevnt spredt uten designregel | Samlet i 1.8 med felles sheet-mønster |
| 12 | Rollekortene på rolleskjermen viser ulike personer i prototypen; uklart hva som vises reelt | Definert i 1.8 (`navn · org/firma`) |
| 13 | `pushSubs` sto som egen collection-rad selv om den er embedded | Rad fjernet, presisert under tabellen |
| 14 | Backend-port for `environment.ts` (5080) var ikke satt i backend-fasen | Lagt til i fase 1.5 |
| 15 | Tester krevde Docker (Testcontainers) uten fallback for maskiner uten Docker | `TEST_MONGO`-fallback til egen testdatabase (fase 1.7) |
| 16 | Ruteplan manglet tom-tilstand for sjåfør uten stopp (prototypens toast "Ola har ingen planlagte stopp ons 16.") | Lagt til i fase 6.10 |
| 17 | Visuell test ville feile på beregnede tall og ekte bilder | Maskering av tall/bilde-områder i fase 12.3 |

### 7.3 Sjekk av tekniske forutsetninger

| Forutsetning | Status |
|---|---|
| Angular 22 CLI installert (22.1.8) | OK – `ng new` med standalone, signals, Vitest og `@angular/pwa` støttes |
| .NET 10 SDK (10.0.102) | OK – Minimal API, `RateLimiter`, `JwtBearer`, `ProblemDetails` er innebygd |
| Docker (29.3.0) | OK – lokal test av imagene og CI (ingen compose, ingen Testcontainers) |
| Dokploy | Brukerens server. DNS for `dev-api`/`dev-app.returapp.no` må være på plass før dev-miljøet opprettes (etter fase 1/3), `api`/`app.returapp.no` før fase 13 |
| Dev-MongoDB på annen server | Venter på bruker (fase 0.6). Backend må kunne nå serveren fra utviklingsmaskinen; hvis TLS/IP-allowlist kreves, legges det i `Mongo__ConnectionString` |
| Prototypens datoer | Prototypen er datert fredag 11. september 2026 (ukedager stemmer med kalenderen); seed og visuelle tester bruker relative datoer / frossen klokke |
| Eksterne tjenester som krever avtale | SMS-leverandør, SMTP – begge har `Console`/`File`-varianter for dev, så ingen fase blokkeres |

### 7.4 Rekkefølge- og avhengighetssjekk

- Fase 3 (frontend-fundament) trenger bare fase 2s `GET /me` + auth-endepunkter → kan starte parallelt med fase 2 mot API-kontrakten.
- Fase 5 (henteordre) trenger fase 4 (kategorier, postnr) – riktig rekkefølge.
- Fase 6 (admin) og 7 (sjåfør) deler `assign`-sheet og `/routes` – fase 6 først, fase 7 gjenbruker.
- Fase 9 (varsler) forutsetter at hendelsene i 5–8 kaller én felles `Notify(userIds, type, …)`-hjelper. **Presisering:** hjelperen opprettes allerede i fase 5 (skriver til `notifications` og kaller SMS/e-post); fase 9 legger bare til push og frontend. Dette unngår omskriving.
- Fase 12 (visuell) kan starte referansefangst (12.1) allerede i fase 3, siden den bare trenger prototypen.

### 7.5 Endringer etter validering

| Dato | Endring | Berørte steder |
|---|---|---|
| 2026-09-15 | Krav fra bruker: ingen lagring på lokal disk (appen kjører i containere). Alle bilder og filer lagres som dokumenter i MongoDB (`files`, maks 16 MB per dokument) i stedet for GridFS. Dev-e-post logges i stedet for å skrives til `.mail-out/`. Eksport/PDF genereres i minnet. `api`-containeren kjører `read_only`. | 1.7, 2 (prinsipp), 2.1, 2.2, 2.4, 2.5, fase 0, 1, 2, 5, 10, 13, 4 (teststrategi), 5 (risiko 4) |
| 2026-09-15 | Publisering med Dokploy i stedet for Docker Compose: `infra/api/Dockerfile`, `infra/web/Dockerfile` + `nginx.conf`, Build Context `.`, frontend same-origin `/api` (ingen CORS, ingen `environment.ts`-URL), `.env.development` i repo-roten i stedet for `backend/.env`, `/api/health` + `/api/ready`, dev-endepunkter bak `App__DevEndpoints`, `UseForwardedHeaders`, e2e mot containere med `--read-only`. `main` = prod, `opd` = dev. `docker-compose.yml` slettet. | 0, 2 (prinsipp), 2.2, 2.3, 2.4, 2.6, 2.8 (ny), fase 0, 1, 2, 3, 9, 12, 13, 4, 5 (risiko 12–13), 6, 7.3, `DEPLOY.md` (ny) |
| 2026-09-15 | Domener besluttet: `app.returapp.no` / `dev-app.returapp.no` (Angular), `api.returapp.no` / `dev-api.returapp.no` (API). `returapp.no` er reservert for en egen nettside senere. API-et får eget domene, men appen bruker fortsatt same-origin `/api`. `/health` og `/ready` flyttet til rota av API-et. | 0, 2.2, 2.3, 2.6, 2.8, fase 1, 3, 12, 13, 5 (risiko 14 fjernet), 7.3, `DEPLOY.md` |
| 2026-09-15 | Tester kjører mot den ene dev-databasen (`Returapp2Dev`): ingen Testcontainers, ingen testdatabaser, ingen `mongo:8`-container i e2e, ingenting droppes. Tester isolerer seg med `RunId`-merkede data. Koding stoppes hvis databasen ikke nås. `RETURAPP_SKIP_DOTENV`/`TEST_MONGO` fjernet. | 2.2, 2.3, 2.4, fase 1, 12, 4, 7.3 |
| 2026-09-15 | Fase 1 funn: `ASPNETCORE_HTTP_PORTS` i stedet for `ASPNETCORE_URLS` i Dockerfilen; `InvariantCulture` i API-et (locale-avhengige Mongo-indeksnavn); `.dockerignore` i repo-roten. | 2.3, 2.4, 2.8, fase 1 |
| 2026-09-15 | Fase 2 funn: SMTP via innebygd `SmtpClient` (ingen MailKit), `GET /auth/invite/{token}`, bytte av mobilnummer i profil krever SMS-kode (hindrer overtakelse av SMS-innlogging), rate-limit på `/api/auth/*` flyttet fra fase 13 til fase 2, maks 10 refresh-tokens per bruker, to pickup-avhengige autorisasjonstester flyttet til fase 5. | 2.2, 2.6, fase 2 |
| 2026-09-15 | Fase 3 funn: inline-styles kopiert ordrett i stedet for utility-klasser; `display:contents` på side-/sheet-komponenter; Figtree som to variable woff2-filer (latin/latin-ext); `GET /api/postnr/{nr}` og `POST /api/support` trukket frem fra fase 4/8 (profilen trenger dem); `DELETE /api/dev/test-user` (kun dev) så e2e rydder egne SMS-brukere; «Bytt rolle» viser brukerens egne roller (prototypen viser alle fire); Playwright kjører mot `ng serve` + API eller mot containerne (`E2E_BASE_URL`). Verifisert: 6 e2e-tester grønne både mot dev-server og mot api+web-containere, nginx 413 over 10 MB, visuell sammenligning av login/kode/roller/profil lys+mørk mot prototypen. | 2.2, fase 3 |
| 2026-09-15 | Fase 4 funn: admin-kommuneliste per fylke (kommunenr) i stedet for postnr-prefiks; `Services/Notify.cs` (in-app + SMS/e-post etter preferanser og hendelsestype) laget allerede i fase 4 fordi ny dekning skal varsle; `POST /api/coverage-alerts` (gjest med mobil eller innlogget) laget her sammen med utløseren; sletting av kategori i bruk gir 409; `GET /api/postnr/kommuner` uten søk viser kommuner med dekning, søknad eller ordre. Verifisert: 27 backend-tester, 9 e2e (flytt/legg til kategori, postnr-søk, admin slår Birkenes av/på og `/api/postnr/4760` følger), visuell sammenligning av s_admin, s_cats, kategori-sheet, s_postnr og a_coverage. | fase 4 |
| 2026-09-15 | Alt arbeid etter fase 0 gjøres i branch `opd`. Brukere som opprettes (seed/test) dokumenteres øverst i `README.md` med brukernavn, passord og rolle. Kun testdata i databasen. | Fase 1 og videre |

### 7.6 Konklusjon

Planen dekker alle skjermer, handlinger og sheets i prototypen for alle fire roller pluss gjest, definerer datamodell og API som er tilstrekkelig for alt som i dag er mock, har tester på alle nivåer inkludert pixel-sammenligning mot prototypen, og har ingen kjente interne motsigelser etter rettelsene over. Første konkrete handling er fase 0: `git init`, `.env.development.example` og at brukeren fyller inn dev-databasen i `.env.development`.
