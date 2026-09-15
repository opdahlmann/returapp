import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, resource, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CompanyApi } from '../core/company';
import { errorText, initials, num, phone, relTime } from '../core/format';
import { Pickup, PickupApi, statusBg, statusFg, statusLabel } from '../core/pickups';
import { ROLE_ORDER, ROLES, Role } from '../core/roles';
import { COMPANY_STATUS, CompanyRow, sinceText, SuperApi, SupportCase, UserRow } from '../core/super';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { Toggle } from '../ui/toggle';

const CARD = 'border-radius:16px;padding:14px;background:var(--sf);border:1px solid var(--bd)';
const INPUT = 'height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:15px;outline:none;width:100%';

@Component({
  selector: 'ra-super-dash',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stats.value(); as s) {
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        <div style="border-radius:16px;padding:14px;background:var(--pri);color:var(--pri-tx)"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ num(s.monthCount) }}</div><div style="font-size:12px;opacity:.85">hentinger i {{ month }}</div></div>
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ tons(s.totalKg) }} t</div><div style="font-size:12px;color:var(--mu)">materialer holdt i bruk</div></div>
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ num(s.activeCompanies) }}</div><div style="font-size:12px;color:var(--mu)">aktive hentefirma</div></div>
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ num(s.users) }}</div><div style="font-size:12px;color:var(--mu)">brukere</div></div>
      </div>
      <div style="font-weight:800;font-size:17px;margin-top:4px">Trenger deg</div>
      @if (s.pendingCompanies.length) {
        <button routerLink="/s/companies" style="display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><span style="width:40px;height:40px;border-radius:12px;background:var(--warn-bg);color:var(--warn);display:flex;align-items:center;justify-content:center"><ra-icon name="building" /></span><div style="flex:1"><div style="font-weight:700">{{ s.pendingCompanies.length }} firma venter på godkjenning</div><div style="font-size:13px;color:var(--mu)">{{ s.pendingCompanies[0].name }} – {{ areas(s.pendingCompanies[0].coverage) }}</div></div><ra-icon name="chev" /></button>
      }
      <button routerLink="/s/orders" [queryParams]="{ filter: 'utenfirma' }" style="display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><span style="width:40px;height:40px;border-radius:12px;background:var(--dan-bg);color:var(--dan);display:flex;align-items:center;justify-content:center"><ra-icon name="alert" /></span><div style="flex:1"><div style="font-weight:700">{{ s.noCompany }} henteordre uten dekning</div><div style="font-size:13px;color:var(--mu)">Ingen firma dekker postnummeret – finn en løsning</div></div><ra-icon name="chev" /></button>
      <button routerLink="/s/support" style="display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><span style="width:40px;height:40px;border-radius:12px;background:var(--info-bg);color:var(--info);display:flex;align-items:center;justify-content:center"><ra-icon name="lifebuoy" /></span><div style="flex:1;min-width:0"><div style="font-weight:700">{{ s.openSupport }} åpne supportsaker</div><div style="font-size:13px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.latestSupport ? 'Siste: ' + s.latestSupport : 'Ingen åpne saker' }}</div></div><ra-icon name="chev" /></button>
    }
  `,
})
export class SuperDash {
  private api = inject(SuperApi);
  protected stats = resource({ loader: () => this.api.stats() });
  protected card = CARD;
  protected num = num;
  protected month = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'][new Date().getMonth()];
  protected tons = (kg: number) => (kg / 1000).toFixed(1).replace('.', ',');
  protected areas = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} og ${list.at(-1)}` : (list[0] ?? ''));

  constructor() {
    const shell = inject(ShellStore);
    effect(() => shell.setBadge('pendingCompanies', this.stats.value()?.pendingCompanies.length ?? 0));
  }
}

const FILTERS = [['ubehandlet', 'Ubehandlet'], ['utenfirma', 'Uten firma'], ['behandlet', 'Behandlet']] as const;

@Component({
  selector: 'ra-super-orders',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;gap:6px;overflow:auto;scrollbar-width:none;margin:0 -20px;padding:0 20px;flex-shrink:0" role="tablist">
      @for (f of filters; track f[0]) {
        <button (click)="filter.set(f[0])" role="tab" [attr.aria-selected]="filter() === f[0]" [style.background]="filter() === f[0] ? 'var(--tx)' : 'var(--sf)'" [style.color]="filter() === f[0] ? 'var(--bg)' : 'var(--mu)'" style="height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--bd);font-weight:700;font-size:13px;white-space:nowrap">{{ f[1] }}</button>
      }
    </div>
    @if (list.value()?.length === 0) {
      <div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingenting her.</div>
    }
    @for (p of list.value() ?? []; track p.id) {
      <div style="display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf)">
        <button [routerLink]="'/p/' + p.id" style="display:flex;gap:12px;align-items:center;text-align:left;border:0;background:none;padding:0;width:100%">
          <div style="width:44px;height:44px;border-radius:13px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon [name]="p.categoryIcon" /></div>
          <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ p.id }} · {{ p.postnr }} {{ p.kommune }} · {{ relTime(p.createdAt) }}</div><div style="font-size:13px;color:var(--mu)">{{ p.companyName ?? 'Ikke tildelt firma' }}</div></div>
          <span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;flex-shrink:0">{{ statusLabel(p) }}</span>
        </button>
        @if (p.status === 'ny') {
          <button (click)="assignCompany(p)" style="height:44px;border:0;border-radius:12px;background:var(--tx);color:var(--bg);font-weight:800;font-size:14px">Tildel firma</button>
        }
      </div>
    }
  `,
})
export class SuperOrders {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  protected filters = FILTERS;
  protected filter = signal<string>(inject(ActivatedRoute).snapshot.queryParamMap.get('filter') ?? 'ubehandlet');
  protected list = resource({ params: () => this.filter(), loader: ({ params }) => this.api.list('all', { filter: params }) });
  protected relTime = (d: string) => relTime(d);
  protected statusLabel = statusLabel;
  protected statusBg = statusBg;
  protected statusFg = statusFg;

  protected assignCompany(p: Pickup) {
    this.shell.openSheet(CompanySheet, { pickup: p, done: () => this.list.reload() });
  }
}

@Component({
  selector: 'ra-company-sheet',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Velg hentefirma</div><div style="font-size:13px;color:var(--mu);margin-top:-10px">{{ pickup().id }} · {{ pickup().title }}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      @for (c of active(); track c.id) {
        <button (click)="chosen.set(c.id)" [attr.aria-pressed]="chosen() === c.id" [style.border-color]="chosen() === c.id ? 'var(--pri)' : 'var(--bd)'" [style.background]="chosen() === c.id ? 'var(--tint)' : 'var(--sf)'" style="display:flex;gap:12px;align-items:center;text-align:left;padding:12px;border-radius:14px;border:1.5px solid var(--bd)"><span style="color:var(--mu)"><ra-icon name="building" /></span><div style="flex:1;min-width:0"><div style="font-weight:700">{{ c.name }}</div><div style="font-size:12px;color:var(--mu)">Dekker {{ c.coverage.join(', ') || 'ingen kommuner ennå' }}</div></div></button>
      }
    </div>
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send ordre til firma</button>
  `,
})
export class CompanySheet implements OnInit {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  readonly pickup = input.required<Pickup>();
  readonly done = input<() => void>();
  private companies = resource({ loader: () => this.api.companies() });
  protected active = computed(() => (this.companies.value() ?? []).filter((c) => c.status === 'aktiv'));
  protected chosen = signal<string | null>(null);

  ngOnInit() {
    this.chosen.set(this.pickup().companyId);
  }

  protected async send() {
    const company = this.active().find((c) => c.id === this.chosen());
    if (!company) return this.shell.toast('Velg firma');
    try {
      await this.api.setCompany(this.pickup().id, company.id);
      this.shell.closeSheet();
      this.shell.toast('Ordre sendt til ' + company.name);
      this.done()?.();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-super-companies',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (c of list.value() ?? []; track c.id) {
      <div style="display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf)">
        <div style="display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border-radius:13px;background:var(--sf2);color:var(--mu);display:flex;align-items:center;justify-content:center"><ra-icon name="building" /></div><div style="flex:1;min-width:0"><div style="font-weight:700">{{ c.name }}</div><div style="font-size:13px;color:var(--mu)">{{ c.city }} · org.nr {{ orgnr(c.orgnr) }} · {{ since(c) }}</div></div><span [style.background]="st(c)[1]" [style.color]="st(c)[2]" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700">{{ st(c)[0] }}</span></div>
        <div style="font-size:13px;color:var(--mu)">Dekker: {{ c.coverage.join(', ') || '–' }} · {{ c.orders }} ordre</div>
        @if (c.status === 'venter') {
          <div style="display:flex;gap:8px"><button (click)="approve(c)" style="flex:1;height:44px;border:0;border-radius:12px;background:var(--pri);color:var(--pri-tx);font-weight:800">Godkjenn</button><button (click)="reject(c)" style="flex:1;height:44px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;color:var(--dan)">Avvis</button></div>
        }
        @if (c.status === 'aktiv') {
          <div style="display:flex;gap:8px"><button (click)="call(c.phone)" style="flex:1;height:42px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="phone" />{{ phone(c.phone) }}</button><button [routerLink]="'/s/companies/' + c.id" style="height:42px;padding:0 14px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:14px">Detaljer</button></div>
        }
      </div>
    }
  `,
})
export class SuperCompanies {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  protected list = resource({ loader: () => this.api.companies() });
  protected phone = phone;
  protected since = sinceText;
  protected st = (c: CompanyRow) => COMPANY_STATUS[c.status];
  protected orgnr = (s: string) => s.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');

  constructor() {
    effect(() => this.shell.setBadge('pendingCompanies', (this.list.value() ?? []).filter((c) => c.status === 'venter').length));
  }

  protected call(tel: string) {
    location.href = 'tel:' + tel;
  }

  protected async approve(c: CompanyRow) {
    await this.run(() => this.api.approve(c.id), 'Firma godkjent – de kan nå motta oppdrag');
  }

  protected async reject(c: CompanyRow) {
    await this.run(() => this.api.reject(c.id), 'Søknad avvist');
  }

  private async run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      this.shell.toast(ok);
      this.list.reload();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-super-company-detail',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (company(); as c) {
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:4px 16px">
        @for (r of rows(c); track r[0]; let last = $last) {
          <div [style.border-bottom]="last ? '0' : '1px solid var(--bd)'" style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;font-size:14px"><span style="color:var(--mu)">{{ r[0] }}</span><span style="font-weight:600;text-align:right">{{ r[1] }}</span></div>
        }
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em">Avdelinger</div>
      @for (d of c.departments; track $index) {
        <div style="display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf)"><div style="font-weight:700">{{ d.name }}</div><div style="font-size:13px;color:var(--mu)">{{ d.address }}{{ d.phone ? ' · ' + phone(d.phone) : '' }}</div></div>
      } @empty {
        <div style="font-size:14px;color:var(--mu)">Ingen avdelinger registrert.</div>
      }
      <div style="font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em">Sjåfører</div>
      @for (d of drivers.value() ?? []; track d.id) {
        <div style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><div style="width:40px;height:40px;border-radius:50%;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">{{ ini(d.name) }}</div><div style="flex:1"><div style="font-weight:700">{{ d.name }}</div><div style="font-size:13px;color:var(--mu)">{{ d.planned }} planlagt · {{ d.done }} hentet</div></div></div>
      } @empty {
        <div style="font-size:14px;color:var(--mu)">Ingen sjåfører ennå.</div>
      }
    }
  `,
})
export class SuperCompanyDetail {
  private api = inject(SuperApi);
  private companyApi = inject(CompanyApi);
  readonly id = input.required<string>();
  private list = resource({ loader: () => this.api.companies() });
  protected company = computed(() => this.list.value()?.find((c) => c.id === this.id()));
  protected drivers = resource({ params: () => this.id(), loader: ({ params }) => this.companyApi.drivers(params) });
  protected phone = phone;
  protected ini = initials;
  protected rows = (c: CompanyRow): [string, string][] => [
    ['Status', COMPANY_STATUS[c.status][0]],
    ['Org.nr', c.orgnr.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')],
    ['Sted', c.city],
    ['Telefon', phone(c.phone)],
    ['Kontakt', [c.contactName, c.contactEmail].filter(Boolean).join(' · ') || '–'],
    ['Dekker', c.coverage.join(', ') || '–'],
    ['Ordre', String(c.orders)],
  ];

  constructor() {
    const shell = inject(ShellStore);
    effect(() => {
      const c = this.company();
      if (c) shell.header(c.name, sinceText(c));
    });
  }
}

@Component({
  selector: 'ra-super-users',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;align-items:center;gap:10px;height:46px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:0 14px;color:var(--mu)"><ra-icon name="search" /><input [value]="q()" (input)="q.set($any($event.target).value)" aria-label="Søk navn, e-post, firma" placeholder="Søk navn, e-post, firma" style="flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px;height:100%"></div>
    @for (u of users.value() ?? []; track u.id) {
      <button (click)="open(u)" [style.opacity]="u.active ? 1 : 0.6" style="display:flex;gap:12px;align-items:center;text-align:left;padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)">
        <div style="width:42px;height:42px;border-radius:50%;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">{{ ini(u.name) || '?' }}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700">{{ u.name || phone(u.phone) }}</div><div style="font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.companyName ?? u.org }} · {{ u.email ?? phone(u.phone) }}</div><div style="font-size:12px;color:var(--pri);font-weight:700;margin-top:2px">{{ roleText(u) }}</div></div>
        <span style="color:var(--mu)"><ra-icon name="chev" /></span>
      </button>
    }
    <button (click)="invite()" style="height:50px;border-radius:14px;border:1.5px dashed var(--pri);background:var(--tint);color:var(--tint-tx);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="plus" />Inviter bruker</button>
  `,
})
export class SuperUsers {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  protected q = signal('');
  protected users = resource({ params: () => this.q().trim(), loader: ({ params }) => this.api.users(params) });
  protected ini = initials;
  protected phone = phone;
  protected roleText = roleText;

  protected open(u: UserRow) {
    this.shell.openSheet(UserSheet, { user: u, done: () => this.users.reload() });
  }

  protected invite() {
    this.shell.openSheet(InviteUserSheet, { done: () => this.users.reload() });
  }
}

export function roleText(u: { roles: Record<Role, boolean> }) {
  return ROLE_ORDER.filter((r) => u.roles[r]).map((r) => ROLES[r].l.split(' /')[0]).join(' · ') || 'Ingen roller';
}

@Component({
  selector: 'ra-user-sheet',
  imports: [Toggle],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">{{ u().name || phone(u().phone) }}</div><div style="font-size:13px;color:var(--mu);margin-top:-10px">{{ [u().companyName ?? u().org, u().email, phone(u().phone)].filter(present).join(' · ') }}</div>
    <div style="border-radius:16px;border:1px solid var(--bd);padding:0 14px">
      @for (r of roleOrder; track r) {
        <button (click)="toggle(r)" role="switch" [attr.aria-checked]="u().roles[r]" style="display:flex;align-items:center;gap:12px;width:100%;padding:13px 0;border:0;background:none;text-align:left;border-bottom:1px solid var(--bd)"><div style="flex:1;font-weight:700">{{ roles[r].l }}</div><ra-toggle [on]="u().roles[r]" /></button>
      }
    </div>
    @if ((u().roles.driver || u().roles.admin) && !u().companyId && companies.value()) {
      <select (change)="setCompany($any($event.target).value)" aria-label="Firma" [style]="input">
        <option value="" selected>Velg firma for sjåfør/admin</option>
        @for (c of companies.value(); track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>
    }
    <div style="display:flex;gap:8px"><button (click)="reset()" style="flex:1;height:46px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:14px">Nullstill passord</button><button (click)="toggleActive()" [style.color]="u().active ? 'var(--dan)' : 'var(--pri)'" style="flex:1;height:46px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:14px">{{ u().active ? 'Deaktiver' : 'Aktiver' }}</button></div>
    <button (click)="finish()" style="height:50px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800">Ferdig</button>
  `,
})
export class UserSheet implements OnInit {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  readonly user = input.required<UserRow>();
  readonly done = input<() => void>();
  protected u = signal<UserRow>(null as unknown as UserRow);
  protected roleOrder = ROLE_ORDER;
  protected roles = ROLES;
  protected phone = phone;
  protected input = INPUT;
  protected present = (x: unknown) => !!x;
  protected companies = resource({ loader: () => this.api.companies() });

  ngOnInit() {
    this.u.set(this.user());
  }

  protected async toggle(r: Role) {
    const roles = { ...this.u().roles, [r]: !this.u().roles[r] };
    await this.save({ roles }, () => this.u.update((x) => ({ ...x, roles })));
  }

  protected async setCompany(companyId: string) {
    await this.save({ companyId }, () => this.u.update((x) => ({ ...x, companyId: companyId || null })));
  }

  protected async toggleActive() {
    const active = !this.u().active;
    await this.save({ active }, () => this.u.update((x) => ({ ...x, active })), active ? 'Bruker aktivert' : 'Bruker deaktivert');
  }

  protected async reset() {
    try {
      await this.api.resetPassword(this.u().id);
      this.shell.toast('Lenke for nytt passord sendt');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected finish() {
    this.shell.closeSheet();
    this.done()?.();
  }

  private async save(body: object, apply: () => void, toast?: string) {
    try {
      await this.api.patchUser(this.u().id, body);
      apply();
      if (toast) this.shell.toast(toast);
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-invite-user-sheet',
  imports: [Toggle],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Inviter bruker</div>
    <div style="font-size:13px;color:var(--mu);margin-top:-10px">Brukeren får en lenke på e-post eller SMS for å aktivere kontoen.</div>
    <input [value]="name()" (input)="name.set($any($event.target).value)" aria-label="Navn" placeholder="Navn" [style]="input">
    <input [value]="contact()" (input)="contact.set($any($event.target).value)" aria-label="E-post eller mobilnummer" placeholder="E-post eller mobilnummer" [style]="input">
    <div style="border-radius:16px;border:1px solid var(--bd);padding:0 14px">
      @for (r of roleOrder; track r; let last = $last) {
        <button (click)="toggle(r)" role="switch" [attr.aria-checked]="picked()[r]" [style.border-bottom]="last ? '0' : '1px solid var(--bd)'" style="display:flex;align-items:center;gap:12px;width:100%;padding:13px 0;border:0;background:none;text-align:left"><div style="flex:1;font-weight:700">{{ roles[r].l }}</div><ra-toggle [on]="picked()[r]" /></button>
      }
    </div>
    @if (picked().driver || picked().admin) {
      <select [value]="companyId()" (change)="companyId.set($any($event.target).value)" aria-label="Firma" [style]="input">
        <option value="">Velg firma</option>
        @for (c of companies.value() ?? []; track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>
    }
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send invitasjon</button>
  `,
})
export class InviteUserSheet {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  readonly done = input<() => void>();
  protected roleOrder = ROLE_ORDER;
  protected roles = ROLES;
  protected input = INPUT;
  protected name = signal('');
  protected contact = signal('');
  protected companyId = signal('');
  protected picked = signal<Record<Role, boolean>>({ giver: true, driver: false, admin: false, super: false });
  protected companies = resource({ loader: async () => (await this.api.companies()).filter((c) => c.status === 'aktiv') });

  protected toggle(r: Role) {
    this.picked.update((p) => ({ ...p, [r]: !p[r] }));
  }

  protected async send() {
    const email = this.contact().includes('@') ? this.contact().trim() : null;
    try {
      await this.api.inviteUser({ name: this.name(), email, phone: email ? null : this.contact(), roles: this.picked(), companyId: this.companyId() || null });
      this.shell.closeSheet();
      this.shell.toast(email ? 'Invitasjon sendt på e-post' : 'Invitasjon sendt på SMS');
      this.done()?.();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-super-notice',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:14px;color:var(--mu)">Vises som banner i appen og som push til alle som har det på.</div>
    <textarea [value]="text()" (input)="text.set($any($event.target).value)" rows="4" aria-label="Melding" placeholder="F.eks. Returapp er utilgjengelig lørdag 02–04 pga. vedlikehold." style="width:100%;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:12px 14px;font-size:15px;resize:none;outline:none"></textarea>
    <div style="display:flex;gap:8px"><button (click)="send('alle')" style="flex:1;height:48px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800">Send til alle</button><button (click)="send('hentefirma')" style="flex:1;height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Kun hentefirma</button></div>
    @if (notices.value()?.length) {
      <div style="font-weight:800;font-size:15px;margin-top:6px">Sendt</div>
    }
    @for (n of notices.value() ?? []; track n.id) {
      <div style="padding:12px 14px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-size:14px"><div>{{ n.text }}</div><div style="font-size:12px;color:var(--mu);margin-top:4px">{{ relTime(n.createdAt) }} · {{ n.to === 'alle' ? 'Alle brukere' : 'Hentefirma' }}</div></div>
    }
  `,
})
export class SuperNotice {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  protected text = signal('');
  protected notices = resource({ loader: () => this.api.notices() });
  protected relTime = (d: string) => relTime(d);

  protected async send(to: 'alle' | 'hentefirma') {
    if (!this.text().trim()) return this.shell.toast('Skriv en melding først');
    try {
      await this.api.sendNotice(this.text(), to);
      this.text.set('');
      this.shell.toast(to === 'alle' ? 'Varsel sendt til alle brukere' : 'Varsel sendt til hentefirma');
      this.notices.reload();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-super-support',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (m of open(); track m.id) {
      <div style="display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-weight:700">{{ m.fromName }} <span style="color:var(--mu);font-weight:500">· {{ m.org }}</span></span><span style="font-size:12px;color:var(--mu)">{{ relTime(m.createdAt) }}</span></div><div style="font-size:14px;line-height:1.45">{{ m.text }}</div>@if (m.replies.length) {<div style="font-size:12px;color:var(--mu)">{{ m.replies.length }} svar sendt</div>}<div style="display:flex;gap:8px"><button (click)="reply(m)" style="flex:1;height:42px;border:0;border-radius:12px;background:var(--tx);color:var(--bg);font-weight:700;font-size:14px">Svar</button><button (click)="close(m)" style="height:42px;padding:0 14px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:14px">Lukk sak</button></div></div>
    } @empty {
      <div style="padding:30px 20px;text-align:center;color:var(--mu)">Ingen åpne saker.</div>
    }
    <div style="font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;margin-top:6px">Lukket</div>
    @for (m of closed(); track m.id) {
      <div style="padding:12px 14px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);opacity:.7"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><span style="font-weight:700">{{ m.fromName }}</span><span style="font-size:12px;color:var(--mu)">{{ relTime(m.createdAt) }}</span></div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ m.text }}</div></div>
    }
  `,
})
export class SuperSupport {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  private list = resource({ loader: () => this.api.support() });
  protected open = computed(() => (this.list.value() ?? []).filter((s) => s.open));
  protected closed = computed(() => (this.list.value() ?? []).filter((s) => !s.open));
  protected relTime = (d: string) => relTime(d);

  protected reply(m: SupportCase) {
    this.shell.openSheet(ReplySheet, { item: m, done: () => this.list.reload() });
  }

  protected async close(m: SupportCase) {
    try {
      await this.api.close(m.id);
      this.shell.toast('Sak lukket');
      this.list.reload();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-reply-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Svar {{ item().fromName }}</div>
    <div style="font-size:13px;color:var(--mu);margin-top:-10px">{{ item().text }}</div>
    <textarea [value]="text()" (input)="text.set($any($event.target).value)" rows="4" aria-label="Svar" placeholder="Skriv svaret" style="width:100%;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:12px 14px;font-size:14px;resize:none;outline:none"></textarea>
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send svar</button>
  `,
})
export class ReplySheet {
  private api = inject(SuperApi);
  private shell = inject(ShellStore);
  readonly item = input.required<SupportCase>();
  readonly done = input<() => void>();
  protected text = signal('');

  protected async send() {
    try {
      await this.api.reply(this.item().id, this.text());
      this.shell.closeSheet();
      this.shell.toast('Svar sendt til ' + this.item().fromName);
      this.done()?.();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

