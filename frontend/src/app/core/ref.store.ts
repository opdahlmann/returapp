import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface PostnrInfo {
  postnr: string;
  poststed: string;
  kommune: string;
  covered: boolean;
  companyId: string | null;
  companyName: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
  kgPerUnit: Record<string, number>;
}

/** Referansedata med cache: kategorier og postnummer-oppslag. */
@Injectable({ providedIn: 'root' })
export class RefStore {
  private http = inject(HttpClient);
  private postnrCache = new Map<string, Promise<PostnrInfo | null>>();
  private categoriesLoaded?: Promise<void>;
  readonly categories = signal<Category[]>([]);

  loadCategories(force = false): Promise<void> {
    if (force || !this.categoriesLoaded)
      this.categoriesLoaded = firstValueFrom(this.http.get<Category[]>('/api/categories')).then((c) => this.categories.set(c));
    return this.categoriesLoaded;
  }

  category(id: string | null | undefined): Category {
    return this.categories().find((c) => c.id === id) ?? { id: 'annet', name: 'Annet', icon: 'annet', order: 99, kgPerUnit: {} };
  }

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
