import { HttpErrorResponse } from '@angular/common/http';

const DAYS = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const DAYS_LONG = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** 720 → "720 kg", 1400 → "1,4 t" */
export function kg(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} t` : `${Math.round(n)} kg`;
}

export function co2(kgValue: number, factor = 0.9): number {
  return Math.round(kgValue * factor);
}

/** Tall med mellomrom som tusenskille: 1284 → "1 284" */
export function num(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (d: Date, now: Date) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);

/** "yyyy-mm-dd" (lokal dato) */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "I dag" | "I morgen" | "Ons 16. sep" */
export function relDay(date: string | Date, now = new Date()): string {
  const d = typeof date === 'string' ? parseIsoDate(date) : date;
  const diff = dayDiff(d, now);
  if (diff === 0) return 'I dag';
  if (diff === 1) return 'I morgen';
  if (diff === -1) return 'I går';
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** "I dag, 14:32" | "I går, 15:02" | "Tor 10. sep, 08:14" */
export function relTime(date: string | Date, now = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = dayDiff(d, now);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `I dag, ${time}`;
  if (diff === -1) return `I går, ${time}`;
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}, ${time}`;
}

/** "Fredag 11. september" */
export function longDate(d = new Date()): string {
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()}. ${MONTHS_LONG[d.getMonth()]}`;
}

/** Dag-chips i wizard og tildeling: I dag, I morgen + 4 påfølgende dager ("Man 14."). */
export function dayChips(now = new Date()): { v: string; label: string }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? 'I dag' : i === 1 ? 'I morgen' : `${DAYS[d.getDay()]} ${d.getDate()}.`;
    return { v: isoDate(d), label };
  });
}

/** "+4791234567" → "912 34 567" (norske nummer), ellers uendret */
export function phone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+47(\d{3})(\d{2})(\d{3})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function initials(name: string | null | undefined): string {
  return (name ?? '').split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
}

/** Feilmelding fra API (ProblemDetails.title) eller en generell tekst. */
export function errorText(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Ingen nettverk – prøv igjen';
    return err.error?.title ?? 'Noe gikk galt – prøv igjen';
  }
  return 'Noe gikk galt – prøv igjen';
}
