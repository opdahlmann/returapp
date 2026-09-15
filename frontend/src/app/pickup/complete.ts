import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { errorText } from '../core/format';
import { Pickup, PickupApi, place } from '../core/pickups';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { pickupIdFromQr, QrScannerSheet } from '../ui/qr-scanner';
import { AvvikSheet } from './avvik-sheet';

interface LocalPhoto {
  key: number;
  preview: string;
  fileId: string | null;
}

@Component({
  selector: 'ra-pickup-complete',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pickup.value(); as p) {
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--sf);border:1px solid var(--bd)"><div style="width:40px;height:40px;border-radius:12px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center"><ra-icon [name]="p.categoryIcon" /></div><div style="flex:1;min-width:0"><div style="font-weight:700">{{ p.title }}</div><div style="font-size:13px;color:var(--mu)">{{ place(p) }}</div></div></div>
      <div style="font-weight:800;font-size:17px">1. Dokumenter med bilde</div>
      <input #camera type="file" accept="image/*" capture="environment" hidden (change)="addPhotos($any($event.target))">
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
        @for (ph of photos(); track ph.key; let i = $index) {
          <div style="position:relative;aspect-ratio:1;border-radius:14px;background:var(--sf2);border:1px solid var(--bd);overflow:hidden"><img [src]="ph.preview" [alt]="'Bilde ' + (i + 1)" [style.opacity]="ph.fileId ? 1 : 0.5" style="width:100%;height:100%;object-fit:cover"></div>
        }
        <button (click)="camera.click()" style="aspect-ratio:1;border-radius:14px;border:1.5px dashed var(--pri);background:var(--tint);color:var(--tint-tx);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:700"><ra-icon name="camera" />Ta bilde</button>
        <button (click)="scan(p)" style="aspect-ratio:1;border-radius:14px;border:1.5px dashed var(--bd);background:var(--sf);color:var(--mu);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:700"><ra-icon name="qr" />Skann lapp</button>
      </div>
      <div style="font-weight:800;font-size:17px">2. Bekreft mengde</div>
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--sf);border:1px solid var(--bd)">
        <button (click)="qty.set(Math.max(0, qty() - 1))" aria-label="Færre" style="width:44px;height:44px;border-radius:12px;border:1px solid var(--bd);background:var(--sf2);display:flex;align-items:center;justify-content:center"><ra-icon name="minus" /></button>
        <div style="flex:1;text-align:center" aria-live="polite"><div style="font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1">{{ qty() }}</div><div style="font-size:12px;color:var(--mu)">{{ p.unit }} · meldt {{ p.qty }}</div></div>
        <button (click)="qty.set(qty() + 1)" aria-label="Flere" style="width:44px;height:44px;border-radius:12px;border:1px solid var(--bd);background:var(--sf2);display:flex;align-items:center;justify-content:center"><ra-icon name="plus" /></button>
      </div>
      <textarea [value]="note()" (input)="note.set($any($event.target).value)" rows="2" aria-label="Merknad" placeholder="Merknad (valgfritt) – f.eks. to stk hadde sprekk" style="width:100%;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:12px 14px;font-size:14px;resize:none;outline:none"></textarea>
      <button (click)="confirm(p)" [disabled]="busy()" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="check" />Bekreft hentet</button>
      <button (click)="deviation(p)" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;color:var(--dan)">Meld avvik i stedet</button>
    }
  `,
})
export class PickupComplete {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  private router = inject(Router);
  readonly id = input.required<string>();
  protected Math = Math;
  protected place = place;
  protected qty = signal(0);
  protected note = signal('');
  protected photos = signal<LocalPhoto[]>([]);
  protected busy = signal(false);
  private key = 0;
  protected pickup = resource({
    params: () => this.id(),
    loader: async ({ params }) => {
      const p = await this.api.get(params);
      this.qty.set(p.qty);
      return p;
    },
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.preview)));
  }

  protected addPhotos(input: HTMLInputElement) {
    for (const file of Array.from(input.files ?? []).slice(0, 6 - this.photos().length)) {
      const photo: LocalPhoto = { key: ++this.key, preview: URL.createObjectURL(file), fileId: null };
      this.photos.update((l) => [...l, photo]);
      this.api.upload(file).then(
        (res) => this.photos.update((l) => l.map((x) => (x.key === photo.key ? { ...x, fileId: res.fileId } : x))),
        (e) => {
          this.photos.update((l) => l.filter((x) => x.key !== photo.key));
          this.shell.toast(errorText(e));
        },
      );
    }
    input.value = '';
  }

  protected scan(p: Pickup) {
    this.shell.openSheet(QrScannerSheet, {
      onResult: (text: string) => {
        const scanned = pickupIdFromQr(text);
        this.shell.toast(scanned === p.id ? `Merkelapp bekreftet: ${p.id}` : scanned ? `Feil merkelapp – dette er ${scanned}` : 'Fant ingen Returapp-merkelapp i QR-koden');
      },
    });
  }

  protected async confirm(p: Pickup) {
    const uploaded = this.photos().filter((x) => x.fileId);
    if (!uploaded.length) return this.shell.toast(this.photos().length ? 'Venter på at bildene lastes opp …' : 'Ta minst ett bilde av det som hentes');
    this.busy.set(true);
    try {
      await this.api.complete(p.id, { qty: this.qty(), note: this.note(), photoIds: uploaded.map((x) => x.fileId!) });
      await this.router.navigateByUrl(`/p/${p.id}/receipt`, { replaceUrl: true });
      this.shell.toast('Henting bekreftet – kvittering sendt til giver');
    } catch (e) {
      this.shell.toast(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected deviation(p: Pickup) {
    this.shell.openSheet(AvvikSheet, { pickup: p });
  }
}
