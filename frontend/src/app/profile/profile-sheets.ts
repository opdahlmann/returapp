import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { errorText, phone } from '../core/format';
import { ShellStore } from '../shell/shell.store';

const INPUT = 'height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:15px;outline:none;width:100%';

/** Gjest har ingen bruker – postnummeret huskes lokalt. */
export function guestPostnr(): string | null {
  return localStorage.getItem('ra.postnr');
}

@Component({
  selector: 'ra-edit-profile-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Rediger profil</div>
    <div style="font-size:13px;color:var(--mu);margin-top:-10px">Navn og kontaktinfo vises for hentefirma og sjåfør.</div>
    <input [value]="name()" (input)="name.set($any($event.target).value)" autocomplete="name" aria-label="Navn" placeholder="Navn" [style]="inputStyle">
    <input [value]="org()" (input)="org.set($any($event.target).value)" autocomplete="organization" aria-label="Firma eller byggeplass" placeholder="Firma / byggeplass" [style]="inputStyle">
    <input [value]="email()" (input)="email.set($any($event.target).value)" type="email" autocomplete="email" aria-label="E-post" placeholder="E-post" [style]="inputStyle">
    <input [value]="tel()" (input)="tel.set($any($event.target).value)" inputmode="tel" autocomplete="tel" aria-label="Mobilnummer" placeholder="Mobilnummer" [style]="inputStyle">
    @if (phoneChanged()) {
      <div style="display:flex;gap:8px">
        <input [value]="code()" (input)="code.set($any($event.target).value)" inputmode="numeric" maxlength="6" aria-label="Kode fra SMS" placeholder="Kode fra SMS" [style]="inputStyle + ';flex:1'">
        <button (click)="sendCode()" style="height:50px;padding:0 16px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;flex-shrink:0">Send kode</button>
      </div>
    }
    <button (click)="save()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Lagre</button>
  `,
})
export class EditProfileSheet {
  private http = inject(HttpClient);
  private auth = inject(AuthStore);
  private shell = inject(ShellStore);
  protected inputStyle = INPUT;
  private user = this.auth.user()!;
  protected name = signal(this.user.name);
  protected org = signal(this.user.org);
  protected email = signal(this.user.email ?? '');
  protected tel = signal(phone(this.user.phone));
  protected code = signal('');
  protected phoneChanged = computed(() => this.tel().replace(/\D/g, '') !== phone(this.user.phone).replace(/\D/g, ''));

  protected async sendCode() {
    try {
      await firstValueFrom(this.http.post('/api/auth/otp/send', { phone: this.tel() }));
      this.shell.toast('Kode sendt til ' + this.tel());
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected async save() {
    try {
      await this.auth.updateMe({
        name: this.name(),
        org: this.org(),
        email: this.email(),
        ...(this.phoneChanged() ? { phone: this.tel(), phoneCode: this.code() } : {}),
      });
      this.shell.closeSheet();
      this.shell.toast('Profilen er oppdatert');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-postnr-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Ditt postnummer</div>
    <div style="font-size:14px;color:var(--mu);margin-top:-8px">Vi bruker postnummeret til å finne hentefirma som dekker deg.</div>
    <input [value]="text()" (input)="text.set($any($event.target).value)" (keydown.enter)="save()" inputmode="numeric" maxlength="4" aria-label="Postnummer" style="height:56px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 16px;font-size:22px;font-weight:800;letter-spacing:.1em;outline:none;width:100%">
    <button (click)="save()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Lagre</button>
  `,
})
export class PostnrSheet {
  private auth = inject(AuthStore);
  private shell = inject(ShellStore);
  readonly onSaved = input<() => void>();
  protected text = signal((this.auth.isGuest() ? guestPostnr() : this.auth.user()?.postnr) ?? '');

  protected async save() {
    const v = this.text().replace(/\D/g, '').slice(0, 4);
    if (v.length < 4) return this.shell.toast('Postnummer må ha 4 siffer');
    try {
      if (this.auth.isGuest()) localStorage.setItem('ra.postnr', v);
      else await this.auth.updateMe({ postnr: v });
      this.onSaved()?.();
      this.shell.closeSheet();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}

@Component({
  selector: 'ra-support-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Hjelp og support</div>
    <div style="font-size:14px;color:var(--mu);margin-top:-8px">Skriv hva det gjelder, så svarer vi deg så snart vi kan.</div>
    <textarea [value]="text()" (input)="text.set($any($event.target).value)" rows="4" aria-label="Melding til support" placeholder="Beskriv problemet eller spørsmålet" style="width:100%;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:12px 14px;font-size:14px;resize:none;outline:none"></textarea>
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send</button>
  `,
})
export class SupportSheet {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  protected text = signal('');

  protected async send() {
    if (this.text().trim().length < 3) return this.shell.toast('Skriv hva det gjelder');
    try {
      await firstValueFrom(this.http.post('/api/support', { text: this.text() }));
      this.shell.closeSheet();
      this.shell.toast('Takk – vi har mottatt saken din');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
