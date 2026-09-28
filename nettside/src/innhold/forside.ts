// All synlig tekst på forsiden. Kilder per påstand: docs/nettside-plan.md kapittel 3.
import { APPLY_URL, APP_URL } from '../consts';

export const hero = {
  h1: 'Enkel retur og gjenbruk fra byggeplassen.',
  ingress: 'Ta bilde, si hvor mye og hvor det står. Et hentefirma i nærheten får beskjed, henter og bekrefter.',
};

export const demo = {
  eyebrow: 'Demo',
  h2: 'Se den før dere bestemmer dere',
  tekst: 'Åpner i en egen fane. Fiktive firma og hentinger, hvilken som helst kode logger inn, ingenting lagres.',
};

export const slik = {
  h2: 'Slik virker det',
  steg: [
    { verb: 'Meld', tekst: 'Velg kategori, ta bilder, si hvor mye og i hvilken stand, og når det kan hentes. Fem steg.', bilde: 'giver-new-2', alt: 'Steg 2 i meldingen: bilder av vinduene og beskrivelse' },
    { verb: 'Hent', tekst: 'Sjåføren ser dagens stopp, starter hentingen, tar bilde av det som hentes og bekrefter mengden.', bilde: 'driver-complete', alt: 'Sjåførens henteskjerm med bilder og mengde' },
    { verb: 'Bekreft', tekst: 'Giveren får kvittering med anslått vekt og CO₂, som PDF eller som lenke på SMS.', bilde: 'giver-receipt', alt: 'Kvittering: hentet og bekreftet, 480 kg holdt i bruk' },
  ],
};

export const bento = {
  h2: 'Alt som trengs, ingenting mer',
  celler: [
    { tittel: 'Meld henting', tekst: 'Bilder fra kamera eller galleri, 12 kategorier, og «gjenta forrige» når sted og kontakt er som sist.', bilde: 'giver-new-4', alt: 'Steg 4: adresse, postnummer, dag og tidsvindu', bred: true },
    { tittel: 'Dekning', tekst: 'Postnummeret gir kommunen. Hentefirmaet som dekker den, får ordren. Dekker ingen, kan du be om beskjed når noen gjør det.' },
    { tittel: 'Oppdragsbørs', tekst: 'Firmaets sjåfører tar oppdrag selv, med dag og tidsvindu.', bilde: 'driver-market', alt: 'Oppdragsbørsen med åpne oppdrag' },
    { tittel: 'Ruteplan', tekst: 'Dagens stopp i rekkefølge, sendt til sjåføren med ett trykk.' },
    { tittel: 'Merkelapp og kvittering', tekst: 'QR-kode på varen som sjåføren skanner. Kvittering som PDF, delt rett fra mobilen.' },
    { tittel: 'Statistikk og eksport', tekst: 'Kg og CO₂ per kategori, andel uten avvik. Alle hentinger som CSV, Excel eller PDF.', bilde: 'admin-stats', alt: 'Statistikk for hentefirmaet: kg per kategori', bred: true },
  ],
};

export const forHvem = {
  eyebrow: 'For hvem',
  h2: 'To sider av samme henting',
  kort: [
    { tittel: 'Byggeplass', tekst: 'Materialer som ikke skal i containeren. Meld dem i fem steg, følg status, få kvittering. Uten konto får du SMS.', cta: 'Meld henting', href: APP_URL, lenke: '/for/byggeplass', lenketekst: 'Mer for byggeplassen' },
    { tittel: 'Hentefirma', tekst: 'Nye henteordre i innboksen. Tildel sjåfør eller legg på børs, planlegg ruten, dokumenter hentingen med bilde.', cta: 'Bli hentefirma', href: APPLY_URL, lenke: '/for/hentefirma', lenketekst: 'Mer for hentefirma' },
  ],
};

// Eksempel fra demo-kvitteringen R-2030 (Seeder.cs), ikke produksjonsdata. CO₂-faktoren står i Services/Weight.cs.
export const miljo = {
  eyebrow: 'Miljø',
  h2: 'Hver henting får et tall',
  tall: [
    { verdi: '480 kg', etikett: 'holdt i bruk' },
    { verdi: '432 kg', etikett: 'CO₂-anslag' },
    { verdi: '3', etikett: 'bilder ved henting' },
  ],
  tekst: [
    'Eksempel fra én henting i demoen: seks glassvegger fra et kontorbygg.',
    'Vekten anslås per kategori og enhet. CO₂ regnes som 0,9 kg per kg materiale holdt i bruk. Begge er anslag, og kvitteringen sier det.',
  ],
};

export const aerlig = {
  h2: 'Ærlig snakk: dette gjør den ikke',
  punkter: [
    'Ingen betaling eller oppgjør. Prisen, om det er noen, avtales utenfor appen.',
    'Kartet er skjematisk. Navigasjon skjer i telefonens egen kartapp.',
    'Ingen henting der ingen hentefirma dekker kommunen. Men «varsle meg» virker, og du kan tipse et firma.',
    'Ingen app i App Store eller Google Play. Den legges på hjemskjermen fra nettleseren.',
    'Ingen garanti for at alt blir hentet. Hentefirmaet bestemmer hva de tar.',
  ],
};

export const faq = [
  { q: 'Koster det noe?', a: 'Nei, ikke for byggeplassen. Hentingen er gratis å melde. Hva hentefirmaet eventuelt tar for jobben, avtaler dere med dem.' },
  { q: 'Hvem henter?', a: 'Et hentefirma som er godkjent i Returapp og dekker kommunen din: ombruksaktører, gjenbrukslagre og lignende. Firmaet får ordren, og du ser hvem som kommer.' },
  { q: 'Hva om ingen dekker postnummeret mitt?', a: 'Ordren legges hos superbrukeren, som prøver å finne et firma. Du kan be om beskjed når noen begynner å dekke kommunen, og tipse et firma du kjenner.' },
  { q: 'Trenger jeg konto?', a: 'Nei. Du kan melde en henting med bare mobilnummeret og få status på SMS. Med konto får du oversikt, meldinger med sjåføren og kvitteringene samlet.' },
  { q: 'Hva skjer med bildene?', a: 'De lagres i Returapp og vises bare for deg, hentefirmaet som har ordren og superbrukeren. De brukes til å vurdere varen og dokumentere hentingen.' },
  { q: 'Hvordan blir vi hentefirma?', a: 'Søk i appen med navn, org.nr, kontaktperson og kommunene dere dekker. Superbrukeren godkjenner, og dere får nye ordre i innboksen.' },
  { q: 'Virker den på mobil uten app-butikk?', a: 'Ja. Returapp er en nettapp som legges på hjemskjermen. Listen over hentinger er tilgjengelig uten nett, og varsler kommer som push.' },
];

export const cta = {
  h2: 'Har dere noe som skal ut?',
  tekst: 'Meld det i dag. Er dere et hentefirma, søk om å bli med.',
};
