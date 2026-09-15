import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pickup, PickupApi, place, statusBg, statusFg, statusLabel, when } from '../core/pickups';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { ExportSheet } from './giver-sheets';

@Component({
  selector: 'ra-giver-list',
  imports: [Icon, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;background:var(--sf2);border-radius:14px;padding:4px;gap:4px" role="tablist">
      @for (t of tabs; track t.v) {
        <button (click)="filter.set(t.v)" role="tab" [attr.aria-selected]="filter() === t.v" [style.background]="filter() === t.v ? 'var(--sf)' : 'transparent'" [style.color]="filter() === t.v ? 'var(--tx)' : 'var(--mu)'" [style.box-shadow]="filter() === t.v ? 'var(--sh)' : 'none'" style="flex:1;height:38px;border:0;border-radius:11px;font-weight:700;font-size:14px">{{ t.l }}</button>
      }
    </div>
    @if (filter() === 'ferdige') {
      <button (click)="exportSheet()" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);text-align:left"><span style="color:var(--pri)"><ra-icon name="download" /></span><div style="flex:1"><div style="font-weight:700;font-size:14px">Eksporter historikk</div><div style="font-size:12px;color:var(--mu)">CSV, Excel eller PDF-rapport med miljøeffekt</div></div><ra-icon name="chev" /></button>
    }
    @if (list.value()?.length === 0) {
      <div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingen hentinger her ennå.</div>
    }
    @for (p of list.value() ?? []; track p.id) {
      <button [routerLink]="'/p/' + p.id" style="display:flex;flex-direction:column;gap:10px;text-align:left;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf);box-shadow:var(--sh)">
        <div style="display:flex;gap:12px;align-items:center;width:100%">
          <div style="width:44px;height:44px;border-radius:13px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon [name]="p.categoryIcon" /></div>
          <div style="flex:1;min-width:0"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ p.title }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ p.id }} · {{ place(p) }}</div></div>
          <span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;flex-shrink:0">{{ statusLabel(p) }}</span>
        </div>
        <div style="display:flex;gap:14px;font-size:13px;color:var(--mu);width:100%"><span style="display:flex;align-items:center;gap:5px"><ra-icon name="clock" /> {{ when(p) }}</span>@if (p.driverName) {<span style="display:flex;align-items:center;gap:5px"><ra-icon name="truck" /> {{ p.driverName }}</span>}</div>
      </button>
    }
  `,
})
export class GiverList {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  protected tabs = [{ v: 'aktive', l: 'Pågående' }, { v: 'ferdige', l: 'Historikk' }] as const;
  protected filter = signal<'aktive' | 'ferdige'>('aktive');
  protected list = resource({ params: () => this.filter(), loader: ({ params }) => this.api.list('mine', { filter: params }) });
  protected place = place;
  protected when = (p: Pickup) => when(p);
  protected statusLabel = statusLabel;
  protected statusBg = statusBg;
  protected statusFg = statusFg;

  protected exportSheet() {
    this.shell.openSheet(ExportSheet, { scope: 'mine' });
  }
}
