import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { errorText } from '../core/format';
import { ShellStore } from '../shell/shell.store';
import { ForgotSheet } from './forgot-sheet';


/** Husker hvor brukeren skulle (f.eks. QR-lenke til /p/R-2041) gjennom kode- og rolle-skjermen. */
export function consumeReturnUrl(): string | null {
  const url = sessionStorage.getItem('ra.return');
  sessionStorage.removeItem('ra.return');
  return url;
}

@Component({
  selector: 'ra-login',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ra-scroll" style="flex:1;display:flex;flex-direction:column;background:#1B4D2B;color:#fff;padding:78px 24px 44px;overflow:auto">
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:22px">
        <svg width="76" height="76" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#2E7A45"></circle><path d="M19 43C19 29 28 21 45 20c-1 16-9 24-24 24" fill="#B7E39B"></path><path d="M19 43c5-7 12-13 22-18" stroke="#2E7A45" stroke-width="2.4" stroke-linecap="round"></path><path d="M42 36a12 12 0 0 1-15 8" stroke="#fff" stroke-width="3" stroke-linecap="round"></path><path d="M26 39l1 6 6-1" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        <div style="text-align:center"><h1 style="margin:0;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1">Retur<span style="color:#B7E39B">app</span></h1><div style="font-size:14px;color:rgba(255,255,255,.7);margin-top:8px">Enkel retur og gjenbruk fra byggeplassen</div></div>
      </div>
      <div style="flex:1"></div>
      <div style="display:flex;background:rgba(255,255,255,.12);border-radius:14px;padding:4px;gap:4px;margin-bottom:16px">
        <button (click)="mode.set('sms')" [style.background]="mode() === 'sms' ? '#fff' : 'transparent'" [style.color]="mode() === 'sms' ? '#1B4D2B' : 'rgba(255,255,255,.75)'" style="flex:1;height:40px;border:0;border-radius:11px;font-weight:700;font-size:14px">Mobilnummer</button>
        <button (click)="mode.set('email')" [style.background]="mode() === 'email' ? '#fff' : 'transparent'" [style.color]="mode() === 'email' ? '#1B4D2B' : 'rgba(255,255,255,.75)'" style="flex:1;height:40px;border:0;border-radius:11px;font-weight:700;font-size:14px">E-post</button>
      </div>
      @if (mode() === 'sms') {
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;height:54px;border-radius:14px;background:#fff;color:#182119;padding:0 6px 0 16px;gap:10px"><span style="font-weight:700;color:#66716A">+47</span><input [value]="phone()" (input)="phone.set($any($event.target).value)" (keydown.enter)="sendCode()" inputmode="tel" autocomplete="tel-national" aria-label="Mobilnummer" placeholder="Mobilnummer" style="flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:17px;height:100%"></div>
          <button (click)="sendCode()" [disabled]="busy()" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px">Send meg kode på SMS</button>
        </div>
      } @else {
        <div style="display:flex;flex-direction:column;gap:12px">
          <input [value]="email()" (input)="email.set($any($event.target).value)" type="email" autocomplete="username" aria-label="E-post" placeholder="E-post" style="height:54px;border-radius:14px;background:#fff;color:#182119;border:0;outline:none;padding:0 16px;font-size:17px;width:100%">
          <input [value]="pw()" (input)="pw.set($any($event.target).value)" (keydown.enter)="loginEmail()" type="password" autocomplete="current-password" aria-label="Passord" placeholder="Passord" style="height:54px;border-radius:14px;background:#fff;color:#182119;border:0;outline:none;padding:0 16px;font-size:17px;width:100%">
          <button (click)="loginEmail()" [disabled]="busy()" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px">Logg inn</button>
          <button (click)="forgot()" style="background:none;border:0;color:rgba(255,255,255,.75);font-size:14px;text-decoration:underline">Glemt passord?</button>
        </div>
      }
      <div style="display:flex;align-items:center;gap:12px;margin:22px 0 14px;color:rgba(255,255,255,.45);font-size:12px"><div style="flex:1;height:1px;background:rgba(255,255,255,.2)"></div>eller<div style="flex:1;height:1px;background:rgba(255,255,255,.2)"></div></div>
      <button (click)="guest()" style="height:50px;border:1.5px solid rgba(255,255,255,.35);border-radius:14px;background:transparent;color:#fff;font-weight:700;font-size:15px">Meld henting uten konto</button>
    </div>
  `,
})
export class Login {
  private auth = inject(AuthStore);
  private router = inject(Router);
  private shell = inject(ShellStore);
  protected mode = signal<'sms' | 'email'>('sms');
  protected phone = signal(this.auth.pendingPhone());
  protected email = signal('');
  protected pw = signal('');
  protected busy = signal(false);

  constructor() {
    const returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');
    if (returnUrl) sessionStorage.setItem('ra.return', returnUrl);
  }

  protected async sendCode() {
    if (this.phone().replace(/\D/g, '').length < 8) return this.shell.toast('Skriv inn et gyldig mobilnummer');
    await this.run(async () => {
      await this.auth.sendCode(this.phone());
      this.router.navigateByUrl('/code');
    });
  }

  protected async loginEmail() {
    if (!this.email() || !this.pw()) return this.shell.toast('Fyll inn e-post og passord');
    await this.run(async () => {
      const next = await this.auth.loginEmail(this.email(), this.pw());
      this.router.navigateByUrl(next === '/roles' ? next : (consumeReturnUrl() ?? next));
    });
  }

  protected async guest() {
    await this.run(async () => this.router.navigateByUrl(await this.auth.guest()));
  }

  protected forgot() {
    this.shell.openSheet(ForgotSheet, { email: this.email() });
  }

  private async run(fn: () => Promise<unknown>) {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.shell.toast(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
