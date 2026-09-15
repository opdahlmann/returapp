import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Icon } from '../ui/icon';

interface KommuneRow {
  kommune: string;
  postnr: number;
  firms: string[];
}

@Component({
  selector: 'ra-super-postnr',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;align-items:center;gap:10px;height:46px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:0 14px;color:var(--mu)"><ra-icon name="search" /><input [value]="q()" (input)="q.set($any($event.target).value)" aria-label="Søk kommune" placeholder="Søk kommune" style="flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px;height:100%"></div>
    @for (k of rows.value() ?? []; track k.kommune) {
      <div style="display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;border:1px solid var(--bd);background:var(--sf)">
        <div style="flex:1;min-width:0"><div style="font-weight:700">{{ k.kommune }}</div><div style="font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ k.firms.join(', ') || 'Ingen dekning' }}</div></div>
        <span [style.background]="k.firms.length ? 'var(--tint)' : 'var(--dan-bg)'" [style.color]="k.firms.length ? 'var(--tint-tx)' : 'var(--dan)'" style="padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700">{{ k.firms.length }} firma</span>
      </div>
    }
  `,
})
export class SuperPostnr {
  private http = inject(HttpClient);
  protected q = signal('');
  protected rows = resource({
    params: () => this.q().trim(),
    loader: ({ params, abortSignal }) =>
      firstValueFrom(this.http.get<KommuneRow[]>('/api/postnr/kommuner', { params: params ? { q: params } : {} })),
  });
}
