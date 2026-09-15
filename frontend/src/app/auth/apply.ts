import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorText } from '../core/format';
import { ShellStore } from '../shell/shell.store';

const INPUT = 'height:54px;border-radius:14px;background:#fff;color:#182119;border:0;outline:none;padding:0 16px;font-size:17px;width:100%';

/** Offentlig søknad om å bli hentefirma – samme grønne stil som innloggingen. */
@Component({
  selector: 'ra-apply',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ra-scroll" style="flex:1;display:flex;flex-direction:column;background:#1B4D2B;color:#fff;padding:70px 24px 44px;overflow:auto">
      <div style="font-size:26px;font-weight:800;letter-spacing:-.02em">Søk som hentefirma</div>
      @if (!sent()) {
        <div style="color:rgba(255,255,255,.72);margin-top:8px">Hent materialer til gjenbruk fra byggeplasser i ditt område. Vi godkjenner firmaet og sender deg innlogging.</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:24px">
          @for (f of fields; track f.key) {
            <input [value]="form()[f.key]" (input)="set(f.key, $any($event.target).value)" [attr.aria-label]="f.label" [placeholder]="f.label" [attr.inputmode]="f.mode ?? null" [attr.autocomplete]="f.auto ?? null" [style]="input">
          }
        </div>
        <button (click)="send()" [disabled]="busy()" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px;margin-top:22px;flex-shrink:0">Send søknad</button>
      } @else {
        <div style="color:rgba(255,255,255,.72);margin-top:8px">Takk! Vi behandler søknaden og tar kontakt på e-post når firmaet er godkjent.</div>
        <div style="flex:1"></div>
      }
      <button (click)="router.navigateByUrl('/login')" style="margin-top:14px;background:none;border:0;color:rgba(255,255,255,.75);font-size:14px;text-decoration:underline">Til innlogging</button>
    </div>
  `,
})
export class ApplyPage {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  protected router = inject(Router);
  protected input = INPUT;
  protected sent = signal(false);
  protected busy = signal(false);
  protected fields: { key: string; label: string; mode?: string; auto?: string }[] = [
    { key: 'name', label: 'Firmanavn', auto: 'organization' },
    { key: 'orgnr', label: 'Org.nr (9 siffer)', mode: 'numeric' },
    { key: 'city', label: 'By / sted' },
    { key: 'phone', label: 'Telefon', mode: 'tel', auto: 'tel' },
    { key: 'contactName', label: 'Kontaktperson', auto: 'name' },
    { key: 'email', label: 'E-post', mode: 'email', auto: 'email' },
    { key: 'kommuner', label: 'Kommuner dere henter i, f.eks. Arendal, Grimstad' },
  ];
  protected form = signal<Record<string, string>>({ name: '', orgnr: '', city: '', phone: '', contactName: '', email: '', kommuner: '' });

  protected set(key: string, value: string) {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected async send() {
    const f = this.form();
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post('/api/companies/apply', { ...f, kommuner: f['kommuner'].split(',').map((k) => k.trim()).filter(Boolean) }));
      this.sent.set(true);
    } catch (e) {
      this.shell.toast(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
