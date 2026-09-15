import { ChangeDetectionStrategy, Component, inject, input, resource } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import QRCode from 'qrcode';
import { errorText } from '../core/format';
import { PickupApi } from '../core/pickups';
import { sharePdf } from '../giver/giver-sheets';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

@Component({
  selector: 'ra-pickup-label',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pickup.value(); as p) {
      <div class="print-area" style="border-radius:22px;border:1px solid var(--bd);background:#fff;color:#182119;padding:24px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#2E7A45">Returapp · Hentes</div>
        <div style="color:#182119;min-width:180px;min-height:180px" [innerHTML]="qr.value()" role="img" [attr.aria-label]="'QR-kode for ' + p.id"></div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-.02em">{{ p.id }}</div>
        <div style="font-size:14px;color:#66716A">{{ p.title }}<br>{{ p.giverOrg }}</div>
        <div style="font-size:12px;color:#66716A;border-top:1px dashed #E1E4DC;padding-top:12px;width:100%">Fest lappen på varen. Sjåføren skanner ved henting og kvitteringen kobles automatisk.</div>
      </div>
      <div style="display:flex;gap:10px">
        <button (click)="print()" style="flex:1;height:50px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800">Skriv ut</button>
        <button (click)="share(p.id)" style="flex:1;height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="share" />Del</button>
      </div>
    }
  `,
})
export class PickupLabel {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  private sanitizer = inject(DomSanitizer);
  readonly id = input.required<string>();
  protected pickup = resource({ params: () => this.id(), loader: ({ params }) => this.api.get(params) });
  /** Ekte QR med lenke til ordren. SVG-en genereres lokalt fra vår egen URL, derfor trygg å sette inn. */
  protected qr = resource({
    params: () => this.id(),
    loader: async ({ params }) =>
      this.sanitizer.bypassSecurityTrustHtml(
        (await QRCode.toString(labelUrl(params), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#182119', light: '#0000' } })).replace('<svg ', '<svg width="180" height="180" '),
      ),
  });

  protected print() {
    window.print();
  }

  protected async share(id: string) {
    try {
      await sharePdf(this.shell, () => this.api.pdf(`/api/pickups/${id}/label.pdf`), `merkelapp-${id}.pdf`, labelUrl(id), `Merkelapp ${id}`);
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

export const labelUrl = (id: string) => `${location.origin}/p/${id}`;
