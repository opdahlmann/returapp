import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { co2Text, CompanyApi, Department, orgnr } from '../core/company';
import { errorText, initials, kg, num, phone } from '../core/format';
import { ExportSheet } from '../giver/giver-sheets';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const STAT = 'border-radius:16px;padding:12px;background:var(--sf);border:1px solid var(--bd)';
const SHEET_INPUT = 'height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:15px;outline:none;width:100%';

/** By fra adresse: "Industrigata 12, 4700 Vennesla" → "Vennesla" */
const cityOf = (address: string) => address.split(',').pop()?.trim().replace(/^\d{4}\s+/, '') ?? '';

@Component({
  selector: 'ra-admin-company',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      <div [style]="stat"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">{{ stats.value()?.weekCount ?? '–' }}</div><div style="font-size:12px;color:var(--mu)">hentinger denne uka</div></div>
      <div [style]="stat"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">{{ stats.value() ? kg(stats.value()!.weekKg) : '–' }}</div><div style="font-size:12px;color:var(--mu)">materialer i uka</div></div>
      <div [style]="stat"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">{{ stats.value() ? days(stats.value()!.responseDays) : '–' }}</div><div style="font-size:12px;color:var(--mu)">snitt responstid</div></div>
    </div>
    @if (company.value(); as c) {
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:0 14px">
        @for (m of menu(); track m.path; let last = $last) {
          <button [routerLink]="m.path" [style.border-bottom]="last ? '0' : '1px solid var(--bd)'" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;border:0;background:none;text-align:left"><span style="color:var(--pri)"><ra-icon [name]="m.icon" /></span><div style="flex:1"><div style="font-weight:700">{{ m.title }}</div><div style="font-size:12px;color:var(--mu)">{{ m.sub }}</div></div><span style="color:var(--mu)"><ra-icon name="chev" /></span></button>
        }
      </div>
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:14px;display:flex;flex-direction:column;gap:4px"><div style="font-weight:700">{{ c.name }}</div><div style="font-size:13px;color:var(--mu)">Org.nr {{ orgnr(c.orgnr) }} · {{ c.city }} · {{ phone(c.phone) }}</div>@if (c.since) {<div style="font-size:13px;color:var(--mu)">Godkjent hentefirma siden {{ since(c.since) }}</div>}</div>
    }
  `,
})
export class AdminCompany {
  private api = inject(CompanyApi);
  private auth = inject(AuthStore);
  private id = this.auth.user()?.companyId ?? '';
  protected company = resource({ loader: () => this.api.get(this.id) });
  protected stats = resource({ loader: () => this.api.stats(this.id) });
  protected stat = STAT;
  protected kg = kg;
  protected orgnr = orgnr;
  protected phone = phone;
  protected days = (d: number) => `${String(d).replace('.', ',')} d`;
  protected since = (iso: string) => `${MONTHS[new Date(iso).getMonth()]} ${new Date(iso).getFullYear()}`;
  protected menu = computed(() => {
    const c = this.company.value();
    if (!c) return [];
    const cities = [...new Set(c.departments.map((d) => cityOf(d.address)))].join(', ');
    return [
      { path: '/a/drivers', icon: 'truck', title: 'Sjåfører', sub: `${c.driverCount} aktive · inviter flere` },
      { path: '/a/coverage', icon: 'pin', title: 'Dekningsområde', sub: `${num(c.coveredPostnr)} postnummer – styrer hvilke oppdrag dere får` },
      { path: '/a/depts', icon: 'building', title: 'Avdelinger og lager', sub: cities || 'Legg til avdeling' },
      { path: '/a/stats', icon: 'scale', title: 'Statistikk og rapport', sub: 'Måned, kategori, miljøeffekt, eksport' },
    ];
  });

  constructor() {
    const shell = inject(ShellStore);
    effect(() => shell.header(this.company.value()?.name ?? this.auth.user()?.company?.name ?? 'Firma'));
  }
}

@Component({
  selector: 'ra-admin-drivers',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (d of drivers.value() ?? []; track d.id) {
      <div style="display:flex;gap:12px;align-items:center;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf)">
        <div style="width:46px;height:46px;border-radius:50%;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;font-weight:800">{{ ini(d.name) }}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700">{{ d.name }}</div><div style="font-size:13px;color:var(--mu)">{{ meta(d) }}</div><div style="font-size:13px;color:var(--mu)">{{ d.planned }} planlagt · {{ d.done }} hentet</div></div>
        @if (d.phone) {
          <button (click)="call(d.phone)" [attr.aria-label]="'Ring ' + d.name" style="width:42px;height:42px;border-radius:13px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;color:var(--pri)"><ra-icon name="phone" /></button>
        }
      </div>
    }
    <button (click)="invite()" style="height:50px;border-radius:14px;border:1.5px dashed var(--pri);background:var(--tint);color:var(--tint-tx);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="plus" />Inviter sjåfør</button>
  `,
})
export class AdminDrivers {
  private api = inject(CompanyApi);
  private shell = inject(ShellStore);
  private id = inject(AuthStore).user()?.companyId ?? '';
  protected drivers = resource({ loader: () => this.api.drivers(this.id) });
  protected ini = initials;
  protected meta = (d: { vehicle: string | null; areas: string[] }) => [d.vehicle, d.areas.join(' / ')].filter(Boolean).join(' · ');

  protected call(tel: string) {
    location.href = 'tel:' + tel;
  }

  protected invite() {
    this.shell.openSheet(InviteDriverSheet, { companyId: this.id });
  }
}

@Component({
  selector: 'ra-invite-driver-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Inviter sjåfør</div>
    <div style="font-size:13px;color:var(--mu);margin-top:-10px">Sjåføren får en SMS med lenke for å aktivere kontoen.</div>
    <input [value]="name()" (input)="name.set($any($event.target).value)" aria-label="Navn" placeholder="Navn" [style]="input">
    <input [value]="tel()" (input)="tel.set($any($event.target).value)" inputmode="tel" aria-label="Mobilnummer" placeholder="Mobilnummer" [style]="input">
    <input [value]="vehicle()" (input)="vehicle.set($any($event.target).value)" aria-label="Kjøretøy" placeholder="Kjøretøy (valgfritt), f.eks. Varebil, 1,2 t" [style]="input">
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send invitasjon</button>
  `,
})
export class InviteDriverSheet {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  readonly companyId = input.required<string>();
  protected input = SHEET_INPUT;
  protected name = signal('');
  protected tel = signal('');
  protected vehicle = signal('');

  protected async send() {
    try {
      await firstValueFrom(this.http.post(`/api/companies/${this.companyId()}/invite-driver`, { name: this.name(), phone: this.tel(), vehicle: this.vehicle() || null }));
      this.shell.closeSheet();
      this.shell.toast('Invitasjon sendt på SMS');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-admin-depts',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (d of company.value()?.departments ?? []; track $index; let i = $index) {
      <button (click)="edit(i, d)" style="display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf);text-align:left"><div style="display:flex;justify-content:space-between;width:100%"><span style="font-weight:700">{{ d.name }}</span><span style="font-size:12px;color:var(--mu)">{{ d.type === 'hoved' ? 'Hovedavdeling' : 'Avdeling' }}</span></div><div style="font-size:13px;color:var(--mu)">{{ d.address }}{{ d.phone ? ' · ' + phone(d.phone) : '' }}</div>@if (d.hours || d.accepts) {<div style="font-size:13px;color:var(--mu)">{{ d.hours ? 'Åpent ' + d.hours : '' }}{{ d.hours && d.accepts ? ' · ' : '' }}{{ d.accepts }}</div>}</button>
    }
    <button (click)="edit(null, null)" style="height:50px;border-radius:14px;border:1.5px dashed var(--pri);background:var(--tint);color:var(--tint-tx);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="plus" />Legg til avdeling</button>
  `,
})
export class AdminDepts {
  private api = inject(CompanyApi);
  private shell = inject(ShellStore);
  private id = inject(AuthStore).user()?.companyId ?? '';
  protected company = resource({ loader: () => this.api.get(this.id) });
  protected phone = phone;

  protected edit(index: number | null, dept: Department | null) {
    this.shell.openSheet(DepartmentSheet, { companyId: this.id, index, dept, done: () => this.company.reload() });
  }
}

@Component({
  selector: 'ra-department-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">{{ index() === null ? 'Ny avdeling' : 'Endre avdeling' }}</div>
    <input [value]="f().name" (input)="set('name', $event)" aria-label="Navn" placeholder="Navn, f.eks. Hovedlager Vennesla" [style]="input">
    <div style="display:flex;gap:8px">
      @for (t of types; track t.v) {
        <button (click)="patch({ type: t.v })" [attr.aria-pressed]="f().type === t.v" [style.border-color]="f().type === t.v ? 'var(--pri)' : 'var(--bd)'" [style.background]="f().type === t.v ? 'var(--pri)' : 'var(--sf)'" [style.color]="f().type === t.v ? 'var(--pri-tx)' : 'var(--tx)'" style="height:38px;padding:0 14px;border-radius:999px;font-weight:700;font-size:14px;border:1.5px solid var(--bd)">{{ t.l }}</button>
      }
    </div>
    <input [value]="f().address" (input)="set('address', $event)" aria-label="Adresse" placeholder="Adresse, postnr og sted" [style]="input">
    <input [value]="f().phone" (input)="set('phone', $event)" inputmode="tel" aria-label="Telefon" placeholder="Telefon" [style]="input">
    <input [value]="f().hours" (input)="set('hours', $event)" aria-label="Åpningstider" placeholder="Åpningstider, f.eks. man–fre 07–16" [style]="input">
    <input [value]="f().accepts" (input)="set('accepts', $event)" aria-label="Mottak" placeholder="Mottak av, f.eks. vinduer, dører" [style]="input">
    <button (click)="save()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Lagre</button>
    @if (index() !== null) {
      <button (click)="remove()" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;color:var(--dan)">Slett avdeling</button>
    }
  `,
})
export class DepartmentSheet implements OnInit {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  readonly companyId = input.required<string>();
  readonly index = input<number | null>(null);
  readonly dept = input<Department | null>(null);
  readonly done = input<() => void>();
  protected input = SHEET_INPUT;
  protected types = [{ v: 'hoved', l: 'Hovedavdeling' }, { v: 'avdeling', l: 'Avdeling' }] as const;
  protected f = signal<Department>({ name: '', type: 'avdeling', address: '', phone: '', hours: '', accepts: '' });

  ngOnInit() {
    const d = this.dept();
    if (d) this.f.set({ ...d, phone: phone(d.phone) });
  }

  protected set(key: keyof Department, e: Event) {
    this.patch({ [key]: (e.target as HTMLInputElement).value });
  }

  protected patch(p: Partial<Department>) {
    this.f.update((x) => ({ ...x, ...p }));
  }

  protected async save() {
    const url = `/api/companies/${this.companyId()}/departments`;
    try {
      if (this.index() === null) await firstValueFrom(this.http.post(url, this.f()));
      else await firstValueFrom(this.http.put(`${url}/${this.index()}`, this.f()));
      this.finish(this.index() === null ? 'Avdeling lagt til' : 'Avdeling oppdatert');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected async remove() {
    try {
      await firstValueFrom(this.http.delete(`/api/companies/${this.companyId()}/departments/${this.index()}`));
      this.finish('Avdeling slettet');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  private finish(text: string) {
    this.shell.closeSheet();
    this.shell.toast(text);
    this.done()?.();
  }
}

@Component({
  selector: 'ra-admin-stats',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stats.value(); as s) {
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ s.monthCount }}</div><div style="font-size:12px;color:var(--mu)">hentinger i {{ s.monthName }}</div></div>
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ kg(s.monthKg) }}</div><div style="font-size:12px;color:var(--mu)">materialer holdt i bruk</div></div>
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ s.noDeviationPct }} %</div><div style="font-size:12px;color:var(--mu)">gjennomført uten avvik</div></div>
        <div [style]="card"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ co2Text(s.co2Kg) }}</div><div style="font-size:12px;color:var(--mu)">CO₂ unngått (estimat)</div></div>
      </div>
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-weight:700;margin-bottom:2px">Per kategori (kg)</div>
        @for (c of s.perCategory; track c.name) {
          <div style="display:flex;align-items:center;gap:10px;font-size:13px"><span style="width:80px;color:var(--mu)">{{ c.name }}</span><div style="flex:1;height:10px;border-radius:5px;background:var(--sf2)"><div [style.width.%]="bar(c.kg, s)" style="height:100%;border-radius:5px;background:var(--pri)"></div></div><span style="width:48px;text-align:right;font-weight:700">{{ num(c.kg) }}</span></div>
        } @empty {
          <div style="font-size:13px;color:var(--mu)">Ingen hentinger denne måneden ennå.</div>
        }
      </div>
    }
    <button (click)="export()" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="download" />Eksporter rapport</button>
  `,
})
export class AdminStats {
  private api = inject(CompanyApi);
  private shell = inject(ShellStore);
  private companyId = inject(AuthStore).user()?.companyId ?? '';
  protected stats = resource({ loader: () => this.api.stats(this.companyId) });
  protected card = STAT.replace('padding:12px', 'padding:14px');
  protected kg = kg;
  protected num = num;
  protected co2Text = co2Text;
  /** Samme skala som designet: største kategori = 86 %. */
  protected bar = (value: number, s: { perCategory: { kg: number }[] }) => Math.round((value / Math.max(1, ...s.perCategory.map((c) => c.kg))) * 86);

  protected export() {
    this.shell.openSheet(ExportSheet, { scope: 'company' });
  }
}

