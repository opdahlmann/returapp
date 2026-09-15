import { ChangeDetectionStrategy, Component, inject, input, resource } from '@angular/core';
import { errorText, relTime } from '../core/format';
import { co2Of, kgText, PickupApi, place, qtyText } from '../core/pickups';
import { shareLink } from '../giver/giver-sheets';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { labelUrl } from './label';

const ROW = 'display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px';

@Component({
  selector: 'ra-pickup-receipt',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pickup.value(); as p) {
      <div style="border-radius:22px;background:var(--pri);color:var(--pri-tx);padding:26px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></div>
        <div style="font-size:24px;font-weight:800;letter-spacing:-.02em">Hentet og bekreftet</div>
        <div style="font-size:14px;opacity:.9">{{ p.pickedAt ? relTime(p.pickedAt) : '' }} · {{ p.driverName }}, {{ p.companyName }}</div>
      </div>
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:4px 16px">
        <div [style]="row"><span style="color:var(--mu)">Referanse</span><span style="font-weight:700">{{ p.id }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Vare</span><span style="font-weight:600;text-align:right">{{ p.title }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Hentet mengde</span><span style="font-weight:600;text-align:right">{{ qtyText(p.pickedQty ?? p.qty, p.unit) }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Hentested</span><span style="font-weight:600;text-align:right">{{ place(p) }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Giver</span><span style="font-weight:600;text-align:right">{{ p.giverOrg }}</span></div>
        <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;font-size:14px"><span style="color:var(--mu)">Dokumentasjon</span><span style="font-weight:600;text-align:right">{{ p.pickedPhotos.length }} bilder ved henting</span></div>
      </div>
      <div style="border-radius:18px;padding:16px;background:var(--tint);color:var(--tint-tx);display:flex;gap:14px;align-items:center"><span><ra-icon name="leaf" /></span><div style="flex:1"><div style="font-weight:800;font-size:18px;letter-spacing:-.01em">{{ kgText(p) }} holdt i bruk</div><div style="font-size:13px">Estimert ca {{ co2Of(p) }} kg CO₂ unngått sammenlignet med nyproduksjon</div></div></div>
      <div style="display:flex;gap:10px">
        <button (click)="pdf(p.id)" style="flex:1;height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="download" />PDF</button>
        <button (click)="share(p.id)" style="flex:1;height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="share" />Del</button>
      </div>
    }
  `,
})
export class PickupReceipt {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  readonly id = input.required<string>();
  protected pickup = resource({ params: () => this.id(), loader: ({ params }) => this.api.get(params) });
  protected row = ROW;
  protected relTime = (d: string) => relTime(d);
  protected qtyText = qtyText;
  protected place = place;
  protected kgText = kgText;
  protected co2Of = co2Of;

  protected async pdf(id: string) {
    try {
      const blob = await this.api.pdf(`/api/pickups/${id}/receipt.pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected share(id: string) {
    shareLink(this.shell, labelUrl(id), `Kvittering ${id}`);
  }
}
