import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Role, ROLE_ORDER, ROLES } from './roles';

export interface Me {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  org: string;
  roles: Record<Role, boolean>;
  companyId: string | null;
  company: { id: string; name: string } | null;
  postnr: string | null;
  theme: 'light' | 'dark';
  notif: { push: boolean; sms: boolean; email: boolean };
  vehicle: string | null;
  areas: string[] | null;
}

interface Session {
  accessToken: string;
  refreshToken?: string;
  guest: boolean;
  role: Role;
  user: Me | null;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: Me;
}

const KEY = 'ra.session';

export function rolesOf(user: Me | null): Role[] {
  return user ? ROLE_ORDER.filter((r) => user.roles[r]) : [];
}

/** Etter innlogging: flere roller → "Hvem er du i dag?", én rolle → rett inn. */
export function nextAfterLogin(user: Me): string {
  const roles = rolesOf(user);
  return roles.length > 1 ? '/roles' : ROLES[roles[0] ?? 'giver'].home;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private http = inject(HttpClient);
  private session = signal<Session | null>(load());
  private refreshing: Promise<string | null> | null = null;

  /** Mobilnummeret koden ble sendt til (vises på kode-skjermen). */
  readonly pendingPhone = signal(sessionStorage.getItem('ra.phone') ?? '');

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isGuest = computed(() => this.session()?.guest ?? false);
  readonly isLoggedIn = computed(() => !!this.session());
  readonly role = computed<Role>(() => this.session()?.role ?? 'giver');
  readonly roles = computed(() => (this.isGuest() ? (['giver'] as Role[]) : rolesOf(this.user())));
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);

  async sendCode(phone: string) {
    await firstValueFrom(this.http.post('/api/auth/otp/send', { phone }));
    this.pendingPhone.set(phone);
    sessionStorage.setItem('ra.phone', phone);
  }

  async verify(code: string): Promise<string> {
    const res = await firstValueFrom(this.http.post<TokenResponse>('/api/auth/otp/verify', { phone: this.pendingPhone(), code }));
    return this.start(res);
  }

  async loginEmail(email: string, password: string): Promise<string> {
    return this.start(await firstValueFrom(this.http.post<TokenResponse>('/api/auth/login', { email, password })));
  }

  async acceptInvite(token: string, name: string, password?: string): Promise<string> {
    return this.start(await firstValueFrom(this.http.post<TokenResponse>('/api/auth/invite/accept', { token, name, password })));
  }

  async guest(): Promise<string> {
    const res = await firstValueFrom(this.http.post<{ accessToken: string }>('/api/auth/guest', {}));
    this.set({ accessToken: res.accessToken, guest: true, role: 'giver', user: null });
    return ROLES.giver.home;
  }

  setRole(role: Role) {
    const s = this.session();
    if (s && s.role !== role) this.set({ ...s, role });
  }

  /** Én felles refresh om flere requests får 401 samtidig. Returnerer nytt access-token eller null. */
  refresh(): Promise<string | null> {
    const rt = this.session()?.refreshToken;
    if (!rt) return Promise.resolve(null);
    this.refreshing ??= firstValueFrom(this.http.post<TokenResponse>('/api/auth/refresh', { refreshToken: rt }))
      .then((res) => {
        const s = this.session();
        this.set({ accessToken: res.accessToken, refreshToken: res.refreshToken, guest: false, role: s?.role ?? rolesOf(res.user)[0], user: res.user });
        return res.accessToken;
      })
      .catch(() => null)
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async loadMe() {
    if (!this.session() || this.isGuest()) return;
    try {
      this.setUser(await firstValueFrom(this.http.get<Me>('/api/me')));
    } catch {
      /* 401 håndteres av interceptoren */
    }
  }

  async updateMe(patch: Partial<Me> & { phoneCode?: string }) {
    this.setUser(await firstValueFrom(this.http.patch<Me>('/api/me', patch)));
  }

  setUser(user: Me) {
    const s = this.session();
    if (!s) return;
    const roles = rolesOf(user);
    this.set({ ...s, user, role: roles.includes(s.role) ? s.role : (roles[0] ?? 'giver') });
  }

  logout() {
    const rt = this.session()?.refreshToken;
    if (rt) this.http.post('/api/auth/logout', { refreshToken: rt }).subscribe({ error: () => {} });
    this.set(null);
    // API-svar cachet av service workeren (dataGroups) tilhører brukeren som logget ut.
    globalThis.caches?.keys().then((keys) => keys.filter((k) => k.includes(':data:')).forEach((k) => caches.delete(k)));
  }

  private start(res: TokenResponse): string {
    const roles = rolesOf(res.user);
    this.set({ accessToken: res.accessToken, refreshToken: res.refreshToken, guest: false, role: roles[0] ?? 'giver', user: res.user });
    sessionStorage.removeItem('ra.phone');
    return nextAfterLogin(res.user);
  }

  private set(s: Session | null) {
    this.session.set(s);
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  }
}

function load(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
