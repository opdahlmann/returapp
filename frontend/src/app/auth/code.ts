import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { errorText } from '../core/format';
import { Icon } from '../ui/icon';
import { ShellStore } from '../shell/shell.store';
import { consumeReturnUrl } from './login';

@Component({
  selector: 'ra-code',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="flex:1;display:flex;flex-direction:column;background:#1B4D2B;color:#fff;padding:70px 24px 44px">
      <button (click)="back()" aria-label="Tilbake" style="width:44px;height:44px;border:0;border-radius:12px;background:rgba(255,255,255,.12);color:#fff;display:flex;align-items:center;justify-content:center"><ra-icon name="back" /></button>
      <div style="margin-top:36px;font-size:26px;font-weight:800;letter-spacing:-.02em">Skriv inn koden</div>
      <div style="color:rgba(255,255,255,.72);margin-top:8px">Vi sendte en 6-sifret kode til +47 {{ auth.pendingPhone() }}</div>
      <input #input [value]="code()" (input)="onInput($any($event.target))" (keydown.enter)="verify()" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Kode fra SMS" placeholder="••••••" style="margin-top:28px;height:68px;border-radius:16px;background:#fff;color:#182119;border:0;outline:none;text-align:center;font-size:32px;font-weight:800;letter-spacing:.35em;width:100%">
      <div style="flex:1"></div>
      <button (click)="verify()" [disabled]="busy()" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px">Bekreft</button>
      <button (click)="resend()" [disabled]="wait() > 0" style="margin-top:12px;background:none;border:0;color:rgba(255,255,255,.75);font-size:14px;text-decoration:underline">{{ wait() > 0 ? 'Send ny kode om ' + wait() + ' s' : 'Send ny kode' }}</button>
    </div>
  `,
})
export class Code {
  protected auth = inject(AuthStore);
  private router = inject(Router);
  private shell = inject(ShellStore);
  private input = viewChild<ElementRef<HTMLInputElement>>('input');
  protected code = signal('');
  protected busy = signal(false);
  protected wait = signal(30);

  constructor() {
    if (!this.auth.pendingPhone()) this.router.navigateByUrl('/login');
    const timer = setInterval(() => this.wait.update((s) => Math.max(0, s - 1)), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    setTimeout(() => this.input()?.nativeElement.focus());
  }

  protected onInput(el: HTMLInputElement) {
    el.value = el.value.replace(/\D/g, '').slice(0, 6);
    this.code.set(el.value);
    if (el.value.length === 6) this.verify();
  }

  protected async verify() {
    if (this.code().length < 6 || this.busy()) return this.code().length < 6 ? this.shell.toast('Skriv inn koden fra SMS') : undefined;
    this.busy.set(true);
    try {
      const next = await this.auth.verify(this.code());
      this.router.navigateByUrl(next === '/roles' ? next : (consumeReturnUrl() ?? next));
    } catch (e) {
      this.shell.toast(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend() {
    try {
      await this.auth.sendCode(this.auth.pendingPhone());
      this.wait.set(30);
      this.shell.toast('Ny kode sendt til ' + this.auth.pendingPhone());
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected back() {
    this.router.navigateByUrl('/login');
  }
}
