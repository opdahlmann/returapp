import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorText } from '../core/format';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

/** Web Share API med fallback til utklippstavle + toast. */
export async function shareLink(shell: ShellStore, url: string, title: string, copiedText = 'Delingslenke kopiert') {
  try {
    if (navigator.share) return await navigator.share({ title, url });
  } catch {
    return; // brukeren avbrøt deling
  }
  await navigator.clipboard?.writeText(url).catch(() => {});
  shell.toast(copiedText);
}

@Component({
  selector: 'ra-tip-sheet',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Tips et hentefirma</div>
    <div style="font-size:14px;color:var(--mu);margin-top:-8px">Kjenner du en gjenbruksstasjon, et rivefirma eller en sjåfør i {{ postnr() }}? Vi tar kontakt og hjelper dem i gang – det er gratis.</div>
    <input [value]="text()" (input)="text.set($any($event.target).value)" aria-label="Firmanavn, telefon eller e-post" placeholder="Firmanavn, telefon eller e-post" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:15px;outline:none;width:100%">
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send tips</button>
    <button (click)="share()" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="share" />Del lenke til Returapp</button>
  `,
})
export class TipSheet {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  readonly postnr = input('');
  protected text = signal('');

  protected async send() {
    if (this.text().trim().length < 3) return this.shell.toast('Skriv firmanavn, telefon eller e-post');
    try {
      await firstValueFrom(this.http.post('/api/tips', { postnr: this.postnr(), text: this.text() }));
      this.shell.closeSheet();
      this.shell.toast('Tips sendt – vi tar kontakt med firmaet');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected share() {
    shareLink(this.shell, `${location.origin}/apply`, 'Bli hentefirma på Returapp', 'Delingslenke kopiert – send den til firmaet');
  }
}

/** Gjest uten konto: mobilnummer for SMS når postnummeret får dekning. */
@Component({
  selector: 'ra-notify-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Varsle meg</div>
    <div style="font-size:14px;color:var(--mu);margin-top:-8px">Skriv inn mobilnummeret ditt, så får du SMS når noen dekker {{ postnr() }}.</div>
    <input [value]="phone()" (input)="phone.set($any($event.target).value)" inputmode="tel" autocomplete="tel" aria-label="Mobilnummer" placeholder="Mobilnummer" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:15px;outline:none;width:100%">
    <button (click)="save()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Varsle meg</button>
  `,
})
export class NotifySheet {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  readonly postnr = input('');
  protected phone = signal('');

  protected async save() {
    try {
      await firstValueFrom(this.http.post('/api/coverage-alerts', { postnr: this.postnr(), phone: this.phone() }));
      this.shell.closeSheet();
      this.shell.toast('Du får beskjed når noen dekker ' + this.postnr());
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-export-sheet',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Eksporter</div>
    @for (x of formats; track x.ext) {
      <button (click)="download(x.ext, x.label)" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;text-align:left;padding:0 16px;display:flex;align-items:center;gap:12px"><ra-icon name="download" /><div><div>{{ x.title }}</div><div style="font-size:12px;color:var(--mu);font-weight:500">{{ x.d }}</div></div></button>
    }
  `,
})
export class ExportSheet {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  readonly scope = input<'mine' | 'company'>('mine');
  protected formats = [
    { ext: 'csv', title: 'CSV', label: 'CSV-fil', d: 'Alle felter, for regneark og BREEAM-dokumentasjon' },
    { ext: 'xlsx', title: 'Excel', label: 'Excel-fil', d: 'Med ferdig oppsummering per kategori' },
    { ext: 'pdf', title: 'PDF-rapport', label: 'PDF-rapport', d: 'Miljøeffekt og kvitteringer, klar til å dele' },
  ];

  /** Laster ned direkte (blob → <a download>), fungerer også i installert PWA. */
  protected async download(ext: string, label: string) {
    try {
      const blob = await firstValueFrom(this.http.get(`/api/export/pickups.${ext}`, { params: { scope: this.scope() }, responseType: 'blob' }));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `returapp-hentinger.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      this.shell.closeSheet();
      this.shell.toast(`${label} lastet ned`);
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
