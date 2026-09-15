import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Department } from './company';
import { Role } from './roles';

export interface PlatformStats {
  monthCount: number;
  totalKg: number;
  activeCompanies: number;
  users: number;
  pendingCompanies: { id: string; name: string; coverage: string[] }[];
  noCompany: number;
  openSupport: number;
  latestSupport: string | null;
}

export interface CompanyRow {
  id: string;
  name: string;
  city: string;
  orgnr: string;
  phone: string;
  status: 'aktiv' | 'venter' | 'avvist';
  since: string | null;
  createdAt: string;
  coverage: string[];
  departments: Department[];
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  orders: number;
}

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  org: string;
  roles: Record<Role, boolean>;
  companyId: string | null;
  companyName: string | null;
  active: boolean;
}

export interface Notice {
  id: string;
  text: string;
  to: 'alle' | 'hentefirma';
  createdAt: string;
}

export interface SupportCase {
  id: string;
  fromUserId: string | null;
  fromName: string;
  org: string;
  text: string;
  open: boolean;
  replies: { byUserId: string; text: string; at: string }[];
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SuperApi {
  private http = inject(HttpClient);
  stats = () => firstValueFrom(this.http.get<PlatformStats>('/api/stats/platform'));
  companies = () => firstValueFrom(this.http.get<CompanyRow[]>('/api/companies'));
  approve = (id: string) => firstValueFrom(this.http.post(`/api/companies/${id}/approve`, {}));
  reject = (id: string) => firstValueFrom(this.http.post(`/api/companies/${id}/reject`, {}));
  users = (q: string) => firstValueFrom(this.http.get<UserRow[]>('/api/users', { params: q ? { q } : {} }));
  patchUser = (id: string, body: object) => firstValueFrom(this.http.patch<UserRow>(`/api/users/${id}`, body));
  inviteUser = (body: object) => firstValueFrom(this.http.post('/api/users/invite', body));
  resetPassword = (id: string) => firstValueFrom(this.http.post(`/api/users/${id}/reset-password`, {}));
  notices = () => firstValueFrom(this.http.get<Notice[]>('/api/notices'));
  sendNotice = (text: string, to: 'alle' | 'hentefirma') => firstValueFrom(this.http.post<Notice>('/api/notices', { text, to }));
  support = () => firstValueFrom(this.http.get<SupportCase[]>('/api/support'));
  reply = (id: string, text: string) => firstValueFrom(this.http.post(`/api/support/${id}/reply`, { text }));
  close = (id: string) => firstValueFrom(this.http.post(`/api/support/${id}/close`, {}));
  setCompany = (pickupId: string, companyId: string) => firstValueFrom(this.http.post(`/api/pickups/${pickupId}/company`, { companyId }));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

/** "Aug 2023" for godkjente, "Søkte 9. sep" for søknader – som prototypen. */
export function sinceText(c: { since: string | null; createdAt: string; status: string }): string {
  if (c.since && c.status === 'aktiv') {
    const d = new Date(c.since);
    const m = MONTHS[d.getMonth()];
    return `${m.charAt(0).toUpperCase() + m.slice(1)} ${d.getFullYear()}`;
  }
  const d = new Date(c.createdAt);
  return `Søkte ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export const COMPANY_STATUS: Record<CompanyRow['status'], [string, string, string]> = {
  aktiv: ['Aktiv', 'var(--tint)', 'var(--tint-tx)'],
  venter: ['Venter godkjenning', 'var(--warn-bg)', 'var(--warn)'],
  avvist: ['Avvist', 'var(--dan-bg)', 'var(--dan)'],
};
