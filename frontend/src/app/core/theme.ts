import { effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from './auth.store';

type Theme = 'light' | 'dark';

/** Tema: brukerens valg (lagres på bruker) → localStorage (gjest/før innlogging) → systemets preferanse. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private auth = inject(AuthStore);
  readonly theme = signal<Theme>(initial());

  constructor() {
    effect(() => document.documentElement.setAttribute('data-theme', this.theme()));
    effect(() => {
      const userTheme = this.auth.user()?.theme;
      if (userTheme) this.theme.set(userTheme);
    });
  }

  toggle() {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem('ra.theme', next);
    if (this.auth.user()) this.auth.updateMe({ theme: next }).catch(() => {});
  }
}

function initial(): Theme {
  const saved = localStorage.getItem('ra.theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
