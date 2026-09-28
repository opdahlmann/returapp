// Funksjoner per rolle. Kilde: IMPLEMENTERINGSPLAN.md 1.4 til 1.6 og endepunktene i backend/.
export const tittel = 'Funksjoner: melding, børs, rute, kvittering';
export const beskrivelse = 'Fem steg for giver, innboks og oppdragsbørs for hentefirma, dagens stopp og henting med bilde for sjåfør, kvittering med kg og CO₂-anslag.';

export const h1 = 'Fire roller, én henting';
export const ingress = 'Giveren melder, hentefirmaet fordeler, sjåføren henter. Superbrukeren holder plattformen i gang.';

export const roller = [
  {
    navn: 'Byggeplass',
    bilde: 'giver-new-4',
    alt: 'Steg 4 i meldingen: hvor og når det kan hentes',
    punkter: [
      'Meld henting i fem steg: kategori, bilder, mengde og stand, sted og tid, oppsummering.',
      'Bilder fra kamera eller galleri. Mål og beskrivelse når det trengs.',
      'Dag og tidsvindu: 07–09, 09–12, 12–15 eller 15–18. Eller «kan hentes uten at noen er til stede».',
      '«Gjenta forrige registrering» når sted og kontakt er som sist.',
      'Status i sanntid, meldinger med sjåføren, merkelapp med QR-kode.',
      'Kvittering med anslått vekt og CO₂ som PDF. Historikk som CSV, Excel eller PDF.',
      'Uten konto: meld med mobilnummer og få status på SMS.',
    ],
  },
  {
    navn: 'Hentefirma',
    bilde: 'admin-inbox',
    alt: 'Innboksen med nye henteordre og forslag til sjåfør',
    punkter: [
      'Innboks med nye ordre, filtrert på status. Forslag til sjåfør som dekker området.',
      'Tildel sjåfør og planlegg dag og tidsvindu, eller legg ordren på børsen.',
      'Ruteplan: dagens stopp per sjåfør i rekkefølge, sendt til sjåføren.',
      'Dekningsområde: slå kommuner av og på. Nye ordre i kommunen kommer til dere.',
      'Sjåfører inviteres med SMS. Avdelinger og lager med adresse og åpningstider.',
      'Statistikk: hentinger og kg per uke og måned, andel uten avvik, kg per kategori.',
      'Eksport av alle hentinger som CSV, Excel eller PDF.',
    ],
  },
  {
    navn: 'Sjåfør',
    bilde: 'driver-today',
    alt: 'Sjåførens dag: stopp igjen, kilometer og børsen',
    punkter: [
      'I dag: stopp igjen, anslått kilometer, og hva som ligger på børsen.',
      'Oppdragsbørs: ta oppdrag selv, med dag og tidsvindu.',
      'Rute med skjematisk kart og stoppliste. Navigasjon i telefonens kartapp.',
      'Henting: minst ett bilde, bekreft mengde, merknad. Eller meld avvik med årsak.',
      'Ring eller send melding til giveren fra ordren.',
    ],
  },
  {
    navn: 'Superbruker',
    punkter: [
      'Godkjenn eller avvis hentefirma som har søkt.',
      'Ordre uten dekning: tildel eller bytt hentefirma.',
      'Brukere og roller, kategorier med ikon og rekkefølge, postnummer og dekning.',
      'Systemvarsel til alle eller bare hentefirma. Supportsaker med svar og lukking.',
    ],
  },
];

export const kategorier = ['Paller', 'Dører', 'Vinduer', 'Elektro', 'Innredning', 'Møbler', 'Kjøkken', 'Sanitær/VVS', 'Trevirke', 'Isolasjon', 'Metall/stål', 'Annet'];

// Statuspillene bruker appens egne farger for hver status (IMPLEMENTERINGSPLAN.md 1.6).
export const statuser: { navn: string; tekst: string; farge: 'info' | 'warn' | 'tint' | 'pri' | 'dan' | 'mu' }[] = [
  { navn: 'Mottatt', tekst: 'Ordren er meldt og ligger hos hentefirmaet som dekker kommunen.', farge: 'info' },
  { navn: 'Tildelt', tekst: 'En sjåfør har fått ordren, tidspunkt er ikke avtalt.', farge: 'warn' },
  { navn: 'Planlagt', tekst: 'Dag og tidsvindu er satt. Giveren får beskjed.', farge: 'tint' },
  { navn: 'Under henting', tekst: 'Sjåføren er på vei. Giveren får beskjed.', farge: 'tint' },
  { navn: 'Hentet', tekst: 'Bekreftet med bilde og mengde. Kvittering sendes.', farge: 'pri' },
  { navn: 'Avvik', tekst: 'Noe stemte ikke ved henting. Årsak og notat følger ordren.', farge: 'dan' },
  { navn: 'Avbrutt', tekst: 'Giveren trakk ordren mens den var aktiv.', farge: 'mu' },
];
