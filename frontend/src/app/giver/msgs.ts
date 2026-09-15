import { ChangeDetectionStrategy, Component, computed, effect, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initials } from '../core/format';
import { PickupApi } from '../core/pickups';
import { ShellStore } from '../shell/shell.store';

@Component({
  selector: 'ra-giver-msgs',
  imports: [RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (threads().length === 0 && mine.hasValue()) {
      <div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingen meldinger ennå. Når en henting er tildelt kan du skrive direkte med sjåføren.</div>
    }
    @for (p of threads(); track p.id) {
      <button [routerLink]="'/p/' + p.id + '/thread'" style="display:flex;gap:12px;align-items:center;text-align:left;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf)">
        <div style="width:46px;height:46px;border-radius:50%;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0">{{ ini(p.driverName ?? p.companyName) }}</div>
        <div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-weight:700">{{ p.driverName ?? p.companyName }}</span><span style="font-size:12px;color:var(--mu)">{{ p.id }}</span></div><div style="font-size:13px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">{{ p.lastMessage?.text }}</div></div>
      </button>
    }
  `,
})
export class GiverMsgs {
  private api = inject(PickupApi);
  protected mine = resource({ loader: () => this.api.list('mine') });
  protected threads = computed(() => (this.mine.value() ?? []).filter((p) => p.messageCount > 0));
  protected ini = initials;

  constructor() {
    const shell = inject(ShellStore);
    effect(() => shell.setBadge('msgs', this.threads().length));
  }
}
