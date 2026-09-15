import { Injectable, signal, Type } from '@angular/core';

export interface SheetRef {
  component: Type<unknown>;
  inputs?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ShellStore {
  /** Tittel/undertittel satt av siden; null = bruk rutens data.title. Nullstilles ved hver navigasjon. */
  readonly title = signal<string | null>(null);
  readonly sub = signal<string | null>(null);
  readonly toastText = signal('');
  readonly sheet = signal<SheetRef | null>(null);
  /** Badges på bunnmenyen, nøkkel = Tab.badge */
  readonly badges = signal<Record<string, number>>({});
  private toastTimer?: ReturnType<typeof setTimeout>;

  header(title: string, sub?: string | null) {
    this.title.set(title);
    this.sub.set(sub ?? null);
  }

  toast(message: string) {
    clearTimeout(this.toastTimer);
    this.toastText.set(message);
    this.toastTimer = setTimeout(() => this.toastText.set(''), 2400);
  }

  openSheet(component: Type<unknown>, inputs?: Record<string, unknown>) {
    this.sheet.set({ component, inputs });
  }

  closeSheet() {
    this.sheet.set(null);
  }

  setBadge(key: string, n: number) {
    this.badges.update((b) => ({ ...b, [key]: n }));
  }
}
