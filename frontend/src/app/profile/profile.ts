import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { roleOrg } from '../auth/roles';
import { AuthStore, Me } from '../core/auth.store';
import { errorText, initials, phone } from '../core/format';
import { RefStore } from '../core/ref.store';
import { Role, ROLES } from '../core/roles';
import { ThemeService } from '../core/theme';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { Toggle } from '../ui/toggle';
import { EditProfileSheet, PostnrSheet, SupportSheet, guestPostnr } from './profile-sheets';

export const APP_VERSION = '1.0.0';

@Component({
  selector: 'ra-profile',
  imports: [Icon, Toggle],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;align-items:center;gap:14px;padding:6px 0">
      <div style="width:64px;height:64px;border-radius:20px;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px">{{ ini() }}</div>
      <div style="flex:1"><div style="font-weight:800;font-size:18px">{{ who() }}</div><div style="font-size:13px;color:var(--mu)">{{ org() }}</div><div style="font-size:12px;color:var(--pri);font-weight:700;margin-top:2px">{{ roleLabel() }}</div></div>
      @if (!auth.isGuest()) {
        <button (click)="edit()" aria-label="Rediger profil" style="width:42px;height:42px;border-radius:13px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;color:var(--mu)"><ra-icon name="edit" /></button>
      }
    </div>
    @if (roleCards().length > 1) {
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Bytt rolle</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          @for (r of roleCards(); track r.id) {
            <button (click)="switchRole(r.id)" [style.border-color]="r.on ? 'var(--pri)' : 'var(--bd)'" [style.background]="r.on ? 'var(--tint)' : 'var(--sf)'" style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:14px;text-align:left;border:1.5px solid var(--bd)"><span style="color:var(--pri)"><ra-icon [name]="r.icon" [size]="24" /></span><span style="font-weight:700;font-size:13px;line-height:1.15">{{ r.l }}</span></button>
          }
        </div>
      </div>
    }
    @if (auth.role() === 'giver') {
      <button (click)="editPostnr()" style="display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><span style="color:var(--pri)"><ra-icon name="pin" /></span><div style="flex:1"><div style="font-weight:700">Mitt postnummer</div><div style="font-size:13px;color:var(--mu)">{{ postnr() || 'Ikke satt' }} {{ place.value()?.kommune ?? '' }} – styrer hvilke firma som får dine hentinger</div></div><span style="color:var(--mu)"><ra-icon name="chev" /></span></button>
    }
    <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:0 14px">
      <button (click)="theme.toggle()" role="switch" [attr.aria-checked]="isDark()" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;border:0;background:none;text-align:left;border-bottom:1px solid var(--bd)"><span style="color:var(--pri)"><ra-icon [name]="isDark() ? 'moon' : 'sun'" /></span><div style="flex:1;font-weight:700">{{ isDark() ? 'Mørk modus' : 'Lys modus' }}</div><ra-toggle [on]="isDark()" /></button>
      @if (user(); as u) {
        @for (n of notifs; track n.id) {
          <button (click)="toggleNotif(u, n.id)" role="switch" [attr.aria-checked]="u.notif[n.id]" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;border:0;background:none;text-align:left;border-bottom:1px solid var(--bd)"><span style="color:var(--pri)"><ra-icon name="bell" /></span><div style="flex:1"><div style="font-weight:700">{{ n.l }}</div><div style="font-size:12px;color:var(--mu)">{{ n.d }}</div></div><ra-toggle [on]="u.notif[n.id]" /></button>
        }
        <button (click)="support()" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;border:0;background:none;text-align:left"><span style="color:var(--pri)"><ra-icon name="lifebuoy" /></span><div style="flex:1;font-weight:700">Hjelp og support</div><span style="color:var(--mu)"><ra-icon name="chev" /></span></button>
      }
    </div>
    <button (click)="logout()" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;color:var(--dan);display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="logout" />Logg ut</button>
    <div style="text-align:center;font-size:12px;color:var(--mu)">Returapp {{ version }}</div>
  `,
})
export class Profile {
  protected auth = inject(AuthStore);
  protected theme = inject(ThemeService);
  private shell = inject(ShellStore);
  private router = inject(Router);
  private ref = inject(RefStore);
  private http = inject(HttpClient);
  private swPush = inject(SwPush);
  protected version = APP_VERSION;

  protected user = this.auth.user;
  protected isDark = computed(() => this.theme.theme() === 'dark');
  protected ini = computed(() => (this.auth.isGuest() ? '?' : initials(this.user()?.name) || '?'));
  protected who = computed(() => (this.auth.isGuest() ? 'Gjest' : this.user()?.name || phone(this.user()?.phone)));
  protected org = computed(() => roleOrg(this.user(), this.auth.role()));
  protected roleLabel = computed(() => ROLES[this.auth.role()].l);
  protected roleCards = computed(() => this.auth.roles().map((id) => ({ id, ...ROLES[id], on: id === this.auth.role() })));
  protected postnr = computed(() => (this.auth.isGuest() ? guestPostnr() : this.user()?.postnr) ?? '');
  protected place = resource({ params: () => this.postnr(), loader: ({ params }) => this.ref.postnr(params) });

  protected notifs = [
    { id: 'push', l: 'Push-varsler', d: 'Statusendringer og meldinger' },
    { id: 'sms', l: 'SMS', d: 'Når henting er planlagt og gjennomført' },
    { id: 'email', l: 'E-post', d: 'Kvittering og månedsrapport' },
  ] as const;

  protected switchRole(role: Role) {
    this.auth.setRole(role);
    this.router.navigateByUrl(ROLES[role].home);
    this.shell.toast('Byttet til ' + ROLES[role].l);
  }

  protected async toggleNotif(u: Me, key: 'push' | 'sms' | 'email') {
    try {
      if (key === 'push' && !u.notif.push) await this.subscribePush();
      await this.auth.updateMe({ notif: { ...u.notif, [key]: !u.notif[key] } });
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  /** Ber om tillatelse og registrerer abonnementet. Service worker er bare aktiv i produksjonsbygget (installert PWA). */
  private async subscribePush() {
    if (!this.swPush.isEnabled) return this.shell.toast('Push aktiveres når appen er installert på telefonen');
    const { publicKey } = await firstValueFrom(this.http.get<{ publicKey: string | null }>('/api/push/key'));
    if (!publicKey) return;
    const sub = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
    await firstValueFrom(this.http.post('/api/me/push', sub.toJSON()));
  }

  protected edit() {
    this.shell.openSheet(EditProfileSheet);
  }

  protected editPostnr() {
    this.shell.openSheet(PostnrSheet, { onSaved: () => this.place.reload() });
  }

  protected support() {
    this.shell.openSheet(SupportSheet);
  }

  protected logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
