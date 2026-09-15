import { ChangeDetectionStrategy, Component, computed, effect, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompanyApi } from '../core/company';
import { isoDate, longDate, relDay } from '../core/format';
import { kgText, Pickup, PickupApi, qtyText, statusBg, statusFg, statusLabel, when } from '../core/pickups';
import { AssignSheet } from '../pickup/assign-sheet';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { SchematicMap } from '../ui/schematic-map';

const STAT = 'border-radius:16px;padding:12px;background:var(--sf);border:1px solid var(--bd)';
const isToday = (iso: string | null | undefined) => !!iso && isoDate(new Date(iso)) === isoDate(new Date());

@Component({
  selector: 'ra-driver-today',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      <div [style]="stat"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">{{ stops().length }}</div><div style="font-size:12px;color:var(--mu)">stopp igjen</div></div>
      <div [style]="stat"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">{{ route.value()?.km ?? 0 }} km</div><div style="font-size:12px;color:var(--mu)">estimert rute</div></div>
      <div [style]="stat"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">{{ market.value()?.length ?? 0 }}</div><div style="font-size:12px;color:var(--mu)">på børsen</div></div>
    </div>
    @if (stops().length) {
      <div style="font-weight:800;font-size:17px;margin-top:4px">Dagens stopp</div>
      @for (p of stops(); track p.id; let i = $index) {
        <button [routerLink]="'/p/' + p.id" style="display:flex;flex-direction:column;gap:10px;text-align:left;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf);box-shadow:var(--sh)">
          <div style="display:flex;gap:12px;align-items:center;width:100%">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--tx);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0">{{ i + 1 }}</div>
            <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ p.address }}, {{ p.postnr }} {{ p.kommune }}</div></div>
            <span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;flex-shrink:0">{{ p.slot }}</span>
          </div>
          <div style="display:flex;gap:14px;font-size:13px;color:var(--mu);width:100%"><span style="display:flex;align-items:center;gap:5px"><ra-icon name="box" /> {{ qtyText(p.qty, p.unit) }} · {{ kgText(p) }}</span><span style="display:flex;align-items:center;gap:5px"><ra-icon name="user" /> {{ p.contact }}</span></div>
          @if (p.unattended) {
            <div style="font-size:12px;font-weight:700;color:var(--tint-tx);background:var(--tint);padding:6px 10px;border-radius:8px">Kan hentes uten at noen er til stede</div>
          }
        </button>
      }
    } @else if (route.hasValue()) {
      <div style="padding:30px 20px;text-align:center;color:var(--mu);border:1px dashed var(--bd);border-radius:18px">Ingen stopp igjen i dag. Sjekk børsen for åpne oppdrag i ditt område.</div>
    }
    @if (doneToday().length) {
      <div style="font-weight:800;font-size:17px;margin-top:4px">Gjort i dag</div>
      @for (p of doneToday(); track p.id) {
        <button [routerLink]="'/p/' + p.id" style="display:flex;gap:12px;align-items:center;text-align:left;padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf);opacity:.85"><span style="color:var(--pri)"><ra-icon name="check" /></span><div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu)">{{ p.address }}, {{ p.postnr }} {{ p.kommune }}</div></div><span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700">{{ statusLabel(p) }}</span></button>
      }
    }
  `,
})
export class DriverToday {
  private api = inject(PickupApi);
  private company = inject(CompanyApi);
  protected route = resource({ loader: () => this.company.route(null, isoDate(new Date())) });
  protected market = resource({ loader: () => this.api.list('market') });
  private mine = resource({ loader: () => this.api.list('driver') });
  protected stops = computed(() => this.route.value()?.stops ?? []);
  protected doneToday = computed(() => (this.mine.value() ?? []).filter((p) => (p.status === 'hentet' && isToday(p.pickedAt)) || (p.status === 'avvik' && isToday(p.deviation?.at))));
  protected stat = STAT;
  protected qtyText = qtyText;
  protected kgText = kgText;
  protected statusBg = statusBg;
  protected statusFg = statusFg;
  protected statusLabel = statusLabel;

  constructor() {
    inject(ShellStore).header('I dag', longDate());
  }
}

@Component({
  selector: 'ra-driver-market',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:14px;color:var(--mu);line-height:1.45">Oppdrag i ditt område som ingen har tatt ennå. Første sjåfør som tar oppdraget får det.</div>
    @if (list.value()?.length === 0) {
      <div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingen åpne oppdrag akkurat nå.</div>
    }
    @for (p of list.value() ?? []; track p.id) {
      <div style="display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf);box-shadow:var(--sh)">
        <button [routerLink]="'/p/' + p.id" style="display:flex;gap:12px;align-items:center;text-align:left;border:0;background:none;padding:0;width:100%">
          <div style="width:44px;height:44px;border-radius:13px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon [name]="p.categoryIcon" /></div>
          <div style="flex:1;min-width:0"><div style="font-weight:700">{{ p.title }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ p.address }}, {{ p.postnr }} {{ p.kommune }} · {{ kgText(p) }}</div><div style="font-size:13px;color:var(--mu)">{{ when(p) }} · {{ p.cond }}</div></div>
          <span style="color:var(--mu)"><ra-icon name="chev" /></span>
        </button>
        <button (click)="take(p)" style="height:46px;border:0;border-radius:12px;background:var(--pri);color:var(--pri-tx);font-weight:800">Ta oppdraget</button>
      </div>
    }
  `,
})
export class DriverMarket {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  protected list = resource({ loader: () => this.api.list('market') });
  protected kgText = kgText;
  protected when = (p: Pickup) => when(p);

  constructor() {
    effect(() => this.shell.setBadge('market', this.list.value()?.length ?? 0));
  }

  protected take(p: Pickup) {
    this.shell.openSheet(AssignSheet, { pickup: p, fixed: true, done: () => this.list.reload() });
  }
}

@Component({
  selector: 'ra-driver-route',
  imports: [Icon, RouterLink, SchematicMap],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ra-schematic-map [count]="stops().length" [km]="route.value()?.km ?? 0" variant="driver" />
    <button (click)="navigate()" [disabled]="!stops().length" style="height:50px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="nav" />Start navigasjon</button>
    @for (p of stops(); track p.id; let i = $index) {
      <button [routerLink]="'/p/' + p.id" style="display:flex;gap:12px;align-items:center;text-align:left;padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--tx);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">{{ i + 1 }}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.address }}, {{ p.postnr }} {{ p.kommune }}</div><div style="font-size:13px;color:var(--mu)">{{ p.slot }} · {{ p.title }}</div></div>
        <span style="color:var(--mu)"><ra-icon name="chev" /></span>
      </button>
    } @empty {
      @if (route.hasValue()) {
        <div style="padding:30px 20px;text-align:center;color:var(--mu);border:1px dashed var(--bd);border-radius:18px">Ingen planlagte stopp. Nye oppdrag dukker opp her når de er planlagt.</div>
      }
    }
  `,
})
export class DriverRoute {
  private company = inject(CompanyApi);
  protected route = resource({ loader: () => this.company.route(null) });
  protected stops = computed(() => this.route.value()?.stops ?? []);

  constructor() {
    const shell = inject(ShellStore);
    effect(() => {
      const date = this.route.value()?.date;
      shell.header('Rute', date && date !== isoDate(new Date()) ? `Neste rute: ${relDay(date)}` : null);
    });
  }

  /** Google Maps med alle stopp som veipunkter (fungerer på Android, iOS og desktop). */
  protected navigate() {
    const points = this.stops().map((p) => (p.lat && p.lng ? `${p.lat},${p.lng}` : `${p.address}, ${p.postnr} ${p.kommune}`));
    const destination = encodeURIComponent(points.at(-1)!);
    const waypoints = points.slice(0, -1).map(encodeURIComponent).join('|');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}${waypoints ? '&waypoints=' + waypoints : ''}`, '_blank');
  }
}

