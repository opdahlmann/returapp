import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Pickup } from './pickups';

export interface Department {
  name: string;
  type: 'hoved' | 'avdeling';
  address: string;
  phone: string;
  hours: string;
  accepts: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  city: string;
  orgnr: string;
  phone: string;
  status: 'aktiv' | 'venter' | 'avvist';
  since: string | null;
  coverage: string[];
  departments: Department[];
  driverCount: number;
  coveredPostnr: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  areas: string[];
  planned: number;
  done: number;
}

export interface CompanyStats {
  weekCount: number;
  weekKg: number;
  responseDays: number;
  monthName: string;
  monthCount: number;
  monthKg: number;
  noDeviationPct: number;
  co2Kg: number;
  perCategory: { name: string; kg: number }[];
}

export interface RouteView {
  driverId: string;
  date: string;
  km: number;
  sentAt: string | null;
  stops: Pickup[];
}

@Injectable({ providedIn: 'root' })
export class CompanyApi {
  private http = inject(HttpClient);

  get(id: string) {
    return firstValueFrom(this.http.get<CompanyInfo>(`/api/companies/${id}`));
  }
  drivers(id: string) {
    return firstValueFrom(this.http.get<Driver[]>(`/api/companies/${id}/drivers`));
  }
  stats(id: string) {
    return firstValueFrom(this.http.get<CompanyStats>(`/api/companies/${id}/stats`));
  }
  route(driverId: string | null, date?: string | null) {
    const params: Record<string, string> = {};
    if (driverId) params['driverId'] = driverId;
    if (date) params['date'] = date;
    return firstValueFrom(this.http.get<RouteView>('/api/routes', { params }));
  }
  saveRoute(driverId: string, date: string, pickupIds: string[]) {
    return firstValueFrom(this.http.put<RouteView>('/api/routes', { driverId, date, pickupIds }));
  }
  sendRoute(driverId: string, date: string) {
    return firstValueFrom(this.http.post<RouteView>('/api/routes/send', { driverId, date }));
  }
}

/** "923456789" → "923 456 789" */
export const orgnr = (s: string) => s.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');

/** CO₂ som i designet: "21 t" over ett tonn, ellers "540 kg". */
export const co2Text = (kgValue: number) => (kgValue >= 1000 ? `${Math.round(kgValue / 1000)} t` : `${kgValue} kg`);
