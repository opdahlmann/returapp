import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { CompanyApi, RouteView } from '../core/company';
import { errorText, relDay } from '../core/format';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { SchematicMap } from '../ui/schematic-map';

/** "Ons 16." som i designets dato-chip. */
function chipDate(iso: string) {
  const label = relDay(iso);
  return /^\p{L}{3} \d+\. /u.test(label) ? label.replace(/ \p{L}+$/u, '') : label;
}

@Component({
  selector: 'ra-admin-routes',
  imports: [Icon, RouterLink, SchematicMap],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      @for (d of drivers.value() ?? []; track d.id) {
        <button (click)="selectDriver(d.id)" [attr.aria-pressed]="driverId() === d.id" [style.border-color]="driverId() === d.id ? 'var(--pri)' : 'var(--bd)'" [style.background]="driverId() === d.id ? 'var(--tint)' : 'var(--sf)'" [style.color]="driverId() === d.id ? 'var(--tint-tx)' : 'var(--tx)'" style="height:38px;padding:0 14px;border-radius:999px;border:1.5px solid var(--bd);font-weight:700;font-size:13px">{{ d.name }}</button>
      }
      <div style="flex:1"></div>
      <label style="position:relative;height:38px;padding:0 12px;border-radius:999px;border:1.5px solid var(--bd);background:var(--sf);font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer"><ra-icon name="calendar" />{{ route.value() ? chipDate(route.value()!.date) : 'Velg dato' }}
        <input type="date" aria-label="Velg dato" [value]="route.value()?.date ?? ''" (change)="date.set($any($event.target).value || null)" style="position:absolute;inset:0;opacity:0;width:100%;cursor:pointer">
      </label>
    </div>
    <ra-schematic-map [count]="stops().length" variant="admin" />
    @if (route.value(); as r) {
      @if (stops().length) {
        <div style="font-size:13px;color:var(--mu)">{{ stops().length }} stopp · ca {{ r.km }} km. Endre rekkefølge med pilene.</div>
        @for (p of stops(); track p.id; let i = $index, first = $first, last = $last) {
          <div style="display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:var(--sf)">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--tx);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">{{ i + 1 }}</div>
            <button [routerLink]="'/p/' + p.id" style="flex:1;min-width:0;text-align:left;border:0;background:none;padding:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu)">{{ p.slot }} · {{ p.address }}, {{ p.postnr }} {{ p.kommune }}</div></button>
            <div style="display:flex;flex-direction:column;gap:4px"><button (click)="move(r, i, -1)" [disabled]="first" [attr.aria-label]="'Flytt ' + p.title + ' opp'" style="width:32px;height:26px;border-radius:8px;border:1px solid var(--bd);background:var(--sf2);display:flex;align-items:center;justify-content:center;padding:0"><ra-icon name="up" /></button><button (click)="move(r, i, 1)" [disabled]="last" [attr.aria-label]="'Flytt ' + p.title + ' ned'" style="width:32px;height:26px;border-radius:8px;border:1px solid var(--bd);background:var(--sf2);display:flex;align-items:center;justify-content:center;padding:0"><ra-icon name="down" /></button></div>
          </div>
        }
        <button (click)="send(r)" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="send" />{{ r.sentAt ? 'Send oppdatert rute' : 'Send rute til sjåfør' }}</button>
      } @else {
        <div style="padding:30px 20px;text-align:center;color:var(--mu);border:1px dashed var(--bd);border-radius:18px">{{ driverName() }} har ingen planlagte stopp {{ relDayLower(r.date) }}.</div>
      }
    }
  `,
})
export class AdminRoutes {
  private company = inject(CompanyApi);
  private shell = inject(ShellStore);
  private companyId = inject(AuthStore).user()?.companyId ?? '';
  protected drivers = resource({ loader: () => this.company.drivers(this.companyId) });
  private chosen = signal<string | null>(null);
  protected driverId = computed(() => this.chosen() ?? this.drivers.value()?.[0]?.id ?? null);
  protected date = signal<string | null>(null);
  protected route = resource({
    params: () => (this.driverId() ? { driver: this.driverId()!, date: this.date() } : undefined),
    loader: ({ params }) => this.company.route(params.driver, params.date),
  });
  private order = signal<RouteView | null>(null);
  protected stops = computed(() => (this.order()?.driverId === this.driverId() ? this.order()!.stops : (this.route.value()?.stops ?? [])));
  protected driverName = computed(() => this.drivers.value()?.find((d) => d.id === this.driverId())?.name ?? '');
  protected chipDate = chipDate;
  protected relDayLower = (iso: string) => {
    const label = relDay(iso);
    return /^I (dag|morgen|går)$/.test(label) ? label.toLowerCase() : label.charAt(0).toLowerCase() + label.slice(1);
  };

  protected selectDriver(id: string) {
    this.chosen.set(id);
    this.date.set(null);
    this.order.set(null);
  }

  protected async move(r: RouteView, i: number, dir: number) {
    const list = [...this.stops()];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.order.set({ ...r, stops: list });
    try {
      this.order.set(await this.company.saveRoute(r.driverId, r.date, list.map((p) => p.id)));
    } catch (e) {
      this.order.set(null);
      this.shell.toast(errorText(e));
    }
  }

  protected async send(r: RouteView) {
    try {
      await this.company.sendRoute(r.driverId, r.date);
      this.shell.toast(`Rute sendt til ${this.driverName().split(' ')[0]} – sjåføren får varsel`);
      this.route.reload();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

