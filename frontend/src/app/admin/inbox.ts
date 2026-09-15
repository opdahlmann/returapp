import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorText } from '../core/format';
import { kgText, Pickup, PickupApi, statusBg, statusFg, when } from '../core/pickups';
import { AssignSheet } from '../pickup/assign-sheet';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

const FILTERS = [['ny', 'Nye'], ['tildelt', 'Tildelt'], ['planlagt', 'Planlagt'], ['hentet', 'Hentet'], ['avvik', 'Avvik']] as const;

@Component({
  selector: 'ra-admin-inbox',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;gap:6px;overflow:auto;scrollbar-width:none;margin:0 -20px;padding:0 20px;flex-shrink:0" role="tablist">
      @for (f of filters; track f[0]) {
        <button (click)="filter.set(f[0])" role="tab" [attr.aria-selected]="filter() === f[0]" [style.background]="filter() === f[0] ? 'var(--tx)' : 'var(--sf)'" [style.color]="filter() === f[0] ? 'var(--bg)' : 'var(--mu)'" style="height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--bd);font-weight:700;font-size:13px;white-space:nowrap">{{ f[1] }} {{ counts.value()?.counts?.[f[0]] ?? 0 }}</button>
      }
    </div>
    @if (list.value()?.length === 0) {
      <div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingenting her akkurat nå.</div>
    }
    @for (p of list.value() ?? []; track p.id) {
      <div style="display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf);box-shadow:var(--sh)">
        <button [routerLink]="'/p/' + p.id" style="display:flex;gap:12px;align-items:center;text-align:left;border:0;background:none;padding:0;width:100%">
          <div style="width:44px;height:44px;border-radius:13px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon [name]="p.categoryIcon" /></div>
          <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ p.giverOrg }} · {{ p.postnr }} {{ p.kommune }}</div><div style="font-size:13px;color:var(--mu)">{{ when(p) }} · {{ kgText(p) }} · {{ p.photos.length }} bilder</div></div>
          @if (p.open) {
            <span style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;background:var(--warn-bg);color:var(--warn)">På børs</span>
          }
          @if (p.driverName) {
            <span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700">{{ p.driverName }}</span>
          }
        </button>
        @if (p.status === 'ny') {
          <div style="display:flex;gap:8px;align-items:center">
            <button (click)="assign(p, p.suggestedDriverId ?? null)" style="flex:1;height:44px;border:0;border-radius:12px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:14px">Tildel {{ p.suggestedDriverName ?? 'sjåfør' }}</button>
            <button (click)="assign(p, null)" style="height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:14px">Annen</button>
            <button (click)="toggleMarket(p)" [attr.aria-label]="p.open ? 'Fjern fra børs' : 'Legg på børs'" [attr.aria-pressed]="p.open" style="width:44px;height:44px;border-radius:12px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;color:var(--mu)"><ra-icon name="tag" /></button>
          </div>
        }
        @if (p.status === 'tildelt') {
          <button (click)="assign(p, p.driverId)" style="height:44px;border:0;border-radius:12px;background:var(--tx);color:var(--bg);font-weight:800;font-size:14px">Planlegg tidspunkt</button>
        }
        @if (p.status === 'avvik' && p.deviation) {
          <div style="display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--dan-bg);color:var(--dan);font-size:13px;font-weight:600"><ra-icon name="alert" />{{ p.deviation.reason }}{{ p.deviation.note ? ': ' + p.deviation.note : '' }}</div>
        }
      </div>
    }
  `,
})
export class AdminInbox {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  protected filters = FILTERS;
  protected filter = signal<string>('ny');
  protected list = resource({ params: () => this.filter(), loader: ({ params }) => this.api.list('company', { status: params }) });
  protected counts = resource({ loader: () => this.api.counts() });
  protected when = (p: Pickup) => when(p);
  protected kgText = kgText;
  protected statusBg = statusBg;
  protected statusFg = statusFg;
  private newCount = computed(() => this.counts.value()?.counts?.['ny'] ?? 0);

  constructor() {
    effect(() => {
      this.shell.header('Innboks', `${this.newCount()} nye henteordre`);
      this.shell.setBadge('inbox', this.newCount());
    });
  }

  protected assign(p: Pickup, driverId: string | null) {
    this.shell.openSheet(AssignSheet, { pickup: p, preselect: driverId, done: () => this.reload() });
  }

  protected async toggleMarket(p: Pickup) {
    try {
      await this.api.market(p.id, !p.open);
      this.shell.toast(p.open ? 'Fjernet fra børsen' : 'Lagt på oppdragsbørsen');
      this.reload();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  private reload() {
    this.list.reload();
    this.counts.reload();
  }
}
