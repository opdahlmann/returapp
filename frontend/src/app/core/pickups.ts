import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { co2, kg, relDay, relTime } from './format';
import { Status, STATUS } from './roles';

export interface Photo {
  fileId: string;
  thumbId: string;
  w: number;
  h: number;
}

export interface Pickup {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  title: string;
  desc: string;
  giverUserId: string | null;
  giverOrg: string;
  contact: string;
  phone: string;
  address: string;
  postnr: string;
  kommune: string;
  lat: number | null;
  lng: number | null;
  qty: number;
  unit: string;
  cond: string;
  dims: string;
  day: string | null;
  slot: string | null;
  unattended: boolean;
  status: Status;
  open: boolean;
  companyId: string | null;
  companyName: string | null;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  photos: Photo[];
  pickedPhotos: Photo[];
  estKg: number;
  pickedAt: string | null;
  pickedQty: number | null;
  pickedNote: string | null;
  deviation: { reason: string; note: string; at: string } | null;
  cancelledAt: string | null;
  statusLog: { status: Status; at: string; byUserId: string | null }[];
  createdAt: string;
  messageCount: number;
  lastMessage: { fromUserId: string; text: string; at: string } | null;
  suggestedDriverId?: string | null;
  suggestedDriverName?: string | null;
  suggestedCoversArea?: boolean;
  suggestedLoad?: number;
}

export interface CreatePickup {
  categoryId: string;
  desc: string;
  qty: number;
  unit: string;
  cond: string;
  dims: string;
  address: string;
  postnr: string;
  day: string | null;
  slot: string | null;
  unattended: boolean;
  contact: string;
  phone: string;
  photoIds: string[];
}

export const UNITS = ['stk', 'm²', 'lm', 'paller', 'kg'];
export const CONDS = ['Som ny', 'God', 'Brukbar', 'Slitt'];
export const SLOTS = ['07–09', '09–12', '12–15', '15–18'];
export const REASONS = ['Ikke funnet / ingen til stede', 'Varen var ødelagt', 'Feil mengde', 'Ikke plass i bilen', 'Giver avlyste'];
const ACTIVE: Status[] = ['ny', 'tildelt', 'planlagt', 'underveis'];

export const isActive = (p: Pickup) => ACTIVE.includes(p.status);
export const statusLabel = (p: Pickup) => STATUS[p.status][0];
export const statusBg = (p: Pickup) => STATUS[p.status][1];
export const statusFg = (p: Pickup) => STATUS[p.status][2];
export const qtyText = (q: number, unit: string) => `${String(q).replace('.', ',')} ${unit}`;
export const place = (p: Pickup) => `${p.address}, ${p.postnr} ${p.kommune}`.trim();
export const kgText = (p: Pickup) => kg(p.estKg);
export const co2Of = (p: Pickup) => co2(p.estKg);

/** "Ons 16. sep · 09–12", "Fleksibel · 07–15", "Ikke avtalt" – som prototypens when. */
export function when(p: Pickup, now = new Date()): string {
  const day = p.day ? relDay(p.day, now) : p.status === 'tildelt' ? 'Ikke avtalt' : 'Fleksibel';
  return p.slot ? `${day} · ${p.slot}` : day;
}

export interface TimelineRow {
  label: string;
  time: string;
  dot: string;
  fg: string;
}

/** Tidslinje som prototypen; hvor langt ordren kom leses fra statusloggen (så avvik etter planlagt viser planlagt som gjort). */
export function timeline(p: Pickup, now = new Date()): TimelineRow[] {
  if (p.status === 'avbrutt') return [{ label: 'Avbrutt av giver', time: p.cancelledAt ? relTime(p.cancelledAt, now) : '', dot: 'var(--mu)', fg: 'var(--mu)' }];
  const order = ['ny', 'tildelt', 'planlagt', 'hentet'];
  const rank = (s: Status) => (s === 'underveis' ? 2 : order.indexOf(s));
  const idx = Math.max(rank(p.status), ...p.statusLog.map((l) => rank(l.status)));
  const labels = [
    'Mottatt',
    `Tildelt ${p.companyName ?? ''}`,
    `Planlagt ${idx >= 2 ? when(p, now) : ''}`,
    `Hentet ${p.pickedAt ? relTime(p.pickedAt, now) : ''}`,
  ];
  const rows = labels.map((label, i) => ({
    label: label.trim(),
    time: i === 0 ? relTime(p.createdAt, now) : '',
    dot: i <= idx ? 'var(--pri)' : 'var(--bd)',
    fg: i <= idx ? 'var(--tx)' : 'var(--mu)',
  }));
  if (p.status === 'avvik' && p.deviation) rows.push({ label: 'Avvik: ' + p.deviation.reason, time: p.deviation.note, dot: 'var(--dan)', fg: 'var(--dan)' });
  return rows;
}

@Injectable({ providedIn: 'root' })
export class PickupApi {
  private http = inject(HttpClient);

  list(scope: 'mine' | 'company' | 'driver' | 'market' | 'all', params: Record<string, string> = {}) {
    return firstValueFrom(this.http.get<Pickup[]>('/api/pickups', { params: { scope, ...params } }));
  }

  get(id: string) {
    return firstValueFrom(this.http.get<Pickup>(`/api/pickups/${id}`));
  }

  create(body: CreatePickup) {
    return firstValueFrom(this.http.post<Pickup>('/api/pickups', body));
  }

  assign(id: string, body: { driverId: string | null; day: string | null; slot: string | null }) {
    return firstValueFrom(this.http.post<Pickup>(`/api/pickups/${id}/assign`, body));
  }

  market(id: string, open: boolean) {
    return firstValueFrom(this.http.post<Pickup>(`/api/pickups/${id}/market`, { open }));
  }

  counts() {
    return firstValueFrom(this.http.get<{ counts: Partial<Record<string, number>>; open: number }>('/api/pickups/counts'));
  }

  start(id: string) {
    return firstValueFrom(this.http.post<Pickup>(`/api/pickups/${id}/start`, {}));
  }

  complete(id: string, body: { qty: number; note: string; photoIds: string[] }) {
    return firstValueFrom(this.http.post<Pickup>(`/api/pickups/${id}/complete`, body));
  }

  deviation(id: string, reason: string, note: string) {
    return firstValueFrom(this.http.post<Pickup>(`/api/pickups/${id}/deviation`, { reason, note }));
  }

  cancel(id: string) {
    return firstValueFrom(this.http.post<Pickup>(`/api/pickups/${id}/cancel`, {}));
  }

  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(this.http.post<Photo>('/api/photos', form));
  }

  pdf(url: string) {
    return firstValueFrom(this.http.get(url, { responseType: 'blob' }));
  }
}
