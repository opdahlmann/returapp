import { ChangeDetectionStrategy, Component, computed, effect, inject, resource } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { co2, errorText, kg } from '../core/format';
import { isActive, Pickup, PickupApi, statusBg, statusFg, statusLabel, when } from '../core/pickups';
import { RefStore } from '../core/ref.store';
import { guestPostnr } from '../profile/profile-sheets';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { NotifySheet, TipSheet } from './giver-sheets';

@Component({
  selector: 'ra-giver-home',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notCovered()) {
      <div style="border-radius:20px;padding:18px;background:var(--warn-bg);color:var(--warn);display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:16px"><ra-icon name="alert" />Ingen henter i {{ postnr() }} {{ kommune() }} ennå</div>
        <div style="font-size:14px;line-height:1.45">Du kan likevel melde inn ting – vi varsler deg så snart et hentefirma dekker området. Kjenner du et firma som burde hente her?</div>
        <div style="display:flex;gap:8px">
          <button (click)="tip()" style="flex:1;height:44px;border:0;border-radius:12px;background:var(--warn);color:#fff;font-weight:700;font-size:14px">Tips et firma</button>
          <button (click)="notify()" style="flex:1;height:44px;border:1.5px solid var(--warn);border-radius:12px;background:transparent;color:var(--warn);font-weight:700;font-size:14px">Varsle meg</button>
        </div>
      </div>
    }
    <button routerLink="/g/new" style="display:flex;align-items:center;gap:14px;text-align:left;padding:18px;border-radius:20px;border:0;background:var(--pri);color:var(--pri-tx);box-shadow:var(--sh)">
      <div style="width:48px;height:48px;border-radius:15px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center"><ra-icon name="plus" /></div>
      <div style="flex:1"><div style="font-weight:800;font-size:17px">Meld henting</div><div style="font-size:13px;opacity:.85;margin-top:2px">Ta bilde, velg kategori – ferdig på ett minutt</div></div>
      <ra-icon name="chev" />
    </button>
    @if (!auth.isGuest()) {
      <button (click)="repeat()" style="display:flex;align-items:center;gap:12px;text-align:left;padding:14px 16px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)">
        <span style="color:var(--pri)"><ra-icon name="repeat" /></span><div style="flex:1"><div style="font-weight:700">Gjenta forrige registrering</div><div style="font-size:13px;color:var(--mu)">Samme sted og kontakt, endre bare det som er nytt</div></div><span style="color:var(--mu)"><ra-icon name="chev" /></span>
      </button>
    }
    <div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 10px"><div style="font-weight:800;font-size:17px">Hva skal hentes?</div><div style="font-size:13px;color:var(--mu)">{{ postnr() }} {{ kommune() }}</div></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
        @for (c of ref.categories(); track c.id) {
          <button [routerLink]="'/g/new'" [queryParams]="{ cat: c.id }" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 4px 10px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><span style="color:var(--pri)"><ra-icon [name]="c.icon" [size]="26" /></span><span style="font-size:11.5px;font-weight:600;line-height:1.1;text-align:center">{{ c.name }}</span></button>
        }
      </div>
    </div>
    @if (active().length) {
      <div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 10px"><div style="font-weight:800;font-size:17px">Pågående</div><button routerLink="/g/list" style="border:0;background:none;color:var(--pri);font-weight:700;font-size:13px;padding:0">Se alle</button></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          @for (p of active(); track p.id) {
            <button [routerLink]="'/p/' + p.id" style="display:flex;gap:12px;align-items:center;text-align:left;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf);box-shadow:var(--sh)">
              <div style="width:44px;height:44px;border-radius:13px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon [name]="p.categoryIcon" /></div>
              <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ when(p) }}</div></div>
              <span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;flex-shrink:0">{{ statusLabel(p) }}</span>
            </button>
          }
        </div>
      </div>
    }
    @if (!auth.isGuest()) {
      <div style="border-radius:20px;padding:18px;background:var(--tint);color:var(--tint-tx);display:flex;gap:14px;align-items:center">
        <div style="width:48px;height:48px;border-radius:15px;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon name="leaf" /></div>
        <div style="flex:1"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1">{{ savedKg() }}</div><div style="font-size:13px;margin-top:4px">materialer holdt i bruk · {{ done().length }} hentinger · ca {{ savedCo2() }} kg CO₂ unngått</div></div>
      </div>
    } @else {
      <div style="border-radius:18px;padding:16px;border:1px dashed var(--bd);color:var(--mu);font-size:14px;display:flex;flex-direction:column;gap:10px"><div>Uten konto får du kun SMS når hentingen er gjort. Med konto kan du følge status, chatte med sjåfør og se miljøeffekten din.</div><button (click)="createAccount()" style="height:44px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;color:var(--tx)">Opprett konto</button></div>
    }
  `,
})
export class GiverHome {
  protected auth = inject(AuthStore);
  protected ref = inject(RefStore);
  private api = inject(PickupApi);
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  private router = inject(Router);
  protected when = (p: Pickup) => when(p);
  protected statusLabel = statusLabel;
  protected statusBg = statusBg;
  protected statusFg = statusFg;

  protected postnr = computed(() => (this.auth.isGuest() ? guestPostnr() : this.auth.user()?.postnr) ?? '');
  protected info = resource({ params: () => this.postnr(), loader: ({ params }) => this.ref.postnr(params) });
  protected kommune = computed(() => this.info.value()?.kommune ?? '');
  protected notCovered = computed(() => !!this.info.value() && !this.info.value()!.covered);
  private mine = resource({ loader: () => this.api.list('mine') });
  protected active = computed(() => (this.mine.value() ?? []).filter(isActive));
  protected done = computed(() => (this.mine.value() ?? []).filter((p) => p.status === 'hentet'));
  private savedKgValue = computed(() => this.done().reduce((a, p) => a + p.estKg, 0));
  protected savedKg = computed(() => (this.savedKgValue() >= 1000 ? kg(this.savedKgValue()).replace(' t', ' tonn') : kg(this.savedKgValue())));
  protected savedCo2 = computed(() => co2(this.savedKgValue()));

  constructor() {
    effect(() => this.shell.setBadge('msgs', (this.mine.value() ?? []).filter((p) => p.messageCount > 0).length));
    this.ref.loadCategories();
    const user = this.auth.user();
    if (this.auth.isGuest() || !user) this.shell.header('Hei!', 'Meld henting uten konto');
    else this.shell.header(user.name ? 'Hei, ' + user.name.split(' ')[0] : 'Hei!', [user.org, user.postnr].filter(Boolean).join(' · '));
  }

  protected tip() {
    this.shell.openSheet(TipSheet, { postnr: this.postnr() });
  }

  protected async notify() {
    if (this.auth.isGuest()) return this.shell.openSheet(NotifySheet, { postnr: this.postnr() });
    try {
      await firstValueFrom(this.http.post('/api/coverage-alerts', { postnr: this.postnr() }));
      this.shell.toast('Du får beskjed når noen dekker ' + this.postnr());
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected repeat() {
    if (!(this.mine.value() ?? []).length) return this.shell.toast('Ingen tidligere registreringer å gjenta');
    this.router.navigate(['/g/new'], { queryParams: { repeat: 1 } });
  }

  protected createAccount() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
