import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorText } from '../core/format';
import { ShellStore } from '../shell/shell.store';

@Component({
  selector: 'ra-reset',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ra-scroll" style="flex:1;display:flex;flex-direction:column;background:#1B4D2B;color:#fff;padding:70px 24px 44px;overflow:auto">
      <div style="font-size:26px;font-weight:800;letter-spacing:-.02em">Nytt passord</div>
      <div style="color:rgba(255,255,255,.72);margin-top:8px">Velg et passord på minst 8 tegn.</div>
      <input [value]="pw()" (input)="pw.set($any($event.target).value)" (keydown.enter)="save()" type="password" autocomplete="new-password" aria-label="Nytt passord" placeholder="Nytt passord" style="margin-top:28px;height:54px;border-radius:14px;background:#fff;color:#182119;border:0;outline:none;padding:0 16px;font-size:17px;width:100%">
      <div style="flex:1"></div>
      <button (click)="save()" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px;margin-top:24px">Lagre passord</button>
    </div>
  `,
})
export class ResetPage {
  private http = inject(HttpClient);
  private router = inject(Router);
  private shell = inject(ShellStore);
  readonly token = input.required<string>();
  protected pw = signal('');

  protected async save() {
    if (this.pw().length < 8) return this.shell.toast('Passordet må ha minst 8 tegn');
    try {
      await firstValueFrom(this.http.post('/api/auth/reset', { token: this.token(), password: this.pw() }));
      this.shell.toast('Passordet er endret – logg inn');
      this.router.navigate(['/login']);
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
