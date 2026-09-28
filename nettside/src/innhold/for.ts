// /for/byggeplass og /for/hentefirma: én mal, to innhold.
import { APPLY_URL, APP_URL } from '../consts';

export interface Gruppe {
  sti: string;
  tittel: string;
  beskrivelse: string;
  h1: string;
  ingress: string;
  bilde: string;
  alt: string;
  cta: { tekst: string; href: string };
  slik: { verb: string; tekst: string }[];
  faarH2: string;
  faar: string[];
  ekstra?: { h2: string; avsnitt: string[] };
  faq: { q: string; a: string }[];
}

export const grupper: Record<string, Gruppe> = {
  byggeplass: {
    sti: '/for/byggeplass',
    tittel: 'Returapp for byggeplassen',
    beskrivelse: 'Ta bilde, si hvor mye og hvor det står. Hentefirmaet som dekker postnummeret får beskjed. Følg status, få kvittering. Uten konto får du SMS.',
    h1: 'Det som ikke skal i containeren',
    ingress: 'Vinduer, dører, paller, innredning. Meld det i fem steg, så henter noen som kan bruke det.',
    bilde: 'giver-new-4',
    alt: 'Steg 4 i meldingen: adresse, postnummer, dag og tidsvindu',
    cta: { tekst: 'Meld henting', href: APP_URL },
    slik: [
      { verb: 'Meld', tekst: 'Kategori, bilder, mengde og stand, sted og tid. Fem steg, ett minutt.' },
      { verb: 'Følg', tekst: 'Se hvem som kommer og når. Send melding til sjåføren fra ordren.' },
      { verb: 'Få kvittering', tekst: 'Hentet mengde, bilder ved henting, anslått vekt og CO₂. PDF eller lenke på SMS.' },
    ],
    faarH2: 'Dette får byggeplassen',
    faar: [
      'Gratis henting av materialer som kan brukes igjen.',
      'Merkelapp med QR-kode, så sjåføren finner riktig vare.',
      'Kvittering per henting og historikk som CSV, Excel eller PDF til miljørapporten.',
      'Melding uten konto: bare mobilnummer, status på SMS.',
      'Beskjed når et hentefirma begynner å dekke kommunen din.',
    ],
    faq: [
      { q: 'Hva kan vi melde?', a: 'Tolv kategorier, fra paller og dører til isolasjon og metall. Hentefirmaet ser bildene og bestemmer om de tar det.' },
      { q: 'Må noen være til stede?', a: 'Nei, hvis du krysser av for det og sier hvor varen står. Ellers velger du dag og tidsvindu.' },
      { q: 'Hvor lang tid tar det?', a: 'Hentefirmaet får ordren med en gang. Du får beskjed når sjåføren er tildelt, når tidspunktet er avtalt, og når sjåføren er på vei.' },
    ],
  },
  hentefirma: {
    sti: '/for/hentefirma',
    tittel: 'Returapp for hentefirma',
    beskrivelse: 'Nye henteordre i innboksen, tildel sjåfør eller legg på børs, planlegg ruten, dokumenter hentingen med bilde, eksporter statistikk. Søk om å bli hentefirma.',
    h1: 'Oppdragene kommer til innboksen',
    ingress: 'Byggeplasser i kommunene dere dekker melder det de har til overs. Dere fordeler, henter og dokumenterer.',
    bilde: 'admin-inbox',
    alt: 'Innboksen med nye henteordre og forslag til sjåfør',
    cta: { tekst: 'Bli hentefirma', href: APPLY_URL },
    slik: [
      { verb: 'Fordel', tekst: 'Tildel sjåføren appen foreslår, velg en annen, eller legg ordren på børsen.' },
      { verb: 'Planlegg', tekst: 'Dag og tidsvindu per ordre. Ruteplan per sjåfør med stopp i rekkefølge.' },
      { verb: 'Dokumenter', tekst: 'Sjåføren bekrefter med bilde og mengde. Avvik meldes med årsak. Alt følger ordren.' },
    ],
    faarH2: 'Dette får hentefirmaet',
    faar: [
      'Innboks med nye ordre i kommunene dere dekker, med bilder, mengde og adresse.',
      'Oppdragsbørs der sjåførene tar oppdrag selv.',
      'Dekningsområde dere styrer selv, kommune for kommune.',
      'Statistikk: hentinger og kg per uke og måned, andel uten avvik, kg per kategori.',
      'Eksport av alle hentinger som CSV, Excel eller PDF.',
      'Sjåfører inviteres med SMS. Avdelinger og lager med åpningstider.',
    ],
    ekstra: {
      h2: 'Slik blir dere med',
      avsnitt: [
        'Søk i appen med firmanavn, org.nr, by, telefon, kontaktperson, e-post og kommunene dere dekker.',
        'Superbrukeren godkjenner søknaden. Dere får beskjed, og ordre i kommunene deres kommer til innboksen fra da av.',
        'Inviter sjåførene med SMS. De logger inn med mobilnummer og ser dagens stopp.',
      ],
    },
    faq: [
      { q: 'Hva koster det?', a: 'Det er ikke besluttet noen pris for hentefirma ennå. Ta kontakt, så avtaler vi.' },
      { q: 'Kan vi si nei til en ordre?', a: 'Ja. Dere ser bilder og mengde før dere tildeler. Passer det ikke, meldes avvik med årsak, og superbrukeren kan gi ordren til et annet firma.' },
      { q: 'Kan vi dekke flere kommuner?', a: 'Ja, så mange dere vil. Dekningen slås av og på i appen, og nye ordre kommer med en gang.' },
    ],
  },
};
