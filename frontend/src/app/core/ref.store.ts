import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface PostnrInfo {
  postnr: string;
  poststed: string;
  kommune: string;
  covered: boolean;
  companyId: string | null;
  companyName: string | null;
}

/** Referansedata med cache: postnummer-oppslag (og kategorier fra fase 4). */
@Injectable({ providedIn: 'root' })
export class RefStore {
  private http = inject(HttpClient);
  private postnrCache = new Map<string, Promise<PostnrInfo | null>>();

  postnr(nr: string | null | undefined): Promise<PostnrInfo | null> {
    if (!nr || !/^\d{4}$/.test(nr)) return Promise.resolve(null);
    if (!this.postnrCache.has(nr))
      this.postnrCache.set(nr, firstValueFrom(this.http.get<PostnrInfo>(`/api/postnr/${nr}`)).catch(() => null));
    return this.postnrCache.get(nr)!;
  }

  /** Etter endring av dekning må oppslag hentes på nytt. */
  clearPostnr() {
    this.postnrCache.clear();
  }
}
