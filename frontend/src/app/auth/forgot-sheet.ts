import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorText } from '../core/format';
import { ShellStore } from '../shell/shell.store';

@Component({
  selector: 'ra-forgot-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Glemt passord?</div>
    <div style="font-size:14px;color:var(--mu);margin-top:-8px">Vi sender en lenke til e-posten din, så kan du velge et nytt passord.</div>
    <input [value]="value()" (input)="value.set($any($event.target).value)" (keydown.enter)="send()" type="email" aria-label="E-post" placeholder="E-post" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:15px;outline:none;width:100%">
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Send lenke</button>
  `,
})
export class ForgotSheet {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  readonly email = input('');
  protected value = linkedSignal(() => this.email());

  protected async send() {
    if (!this.value().includes('@')) return this.shell.toast('Skriv inn e-postadressen din');
    try {
      await firstValueFrom(this.http.post('/api/auth/forgot', { email: this.value() }));
      this.shell.closeSheet();
      this.shell.toast('Lenke for nytt passord er sendt');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
