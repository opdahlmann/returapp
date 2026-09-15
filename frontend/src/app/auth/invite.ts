import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { errorText } from '../core/format';
import { Role, ROLE_ORDER, ROLES } from '../core/roles';
import { ShellStore } from '../shell/shell.store';

interface InviteInfo {
  name: string | null;
  phone: string | null;
  email: string | null;
  roles: Record<Role, boolean>;
  companyName: string | null;
  needsPassword: boolean;
}

@Component({
  selector: 'ra-invite',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ra-scroll" style="flex:1;display:flex;flex-direction:column;background:#1B4D2B;color:#fff;padding:70px 24px 44px;overflow:auto">
      <div style="font-size:26px;font-weight:800;letter-spacing:-.02em">Velkommen til Returapp</div>
      @if (info(); as i) {
        @if (i.ok) {
          <div style="color:rgba(255,255,255,.72);margin-top:8px">Du er invitert som {{ roleText() }}{{ i.data.companyName ? ' i ' + i.data.companyName : '' }}.</div>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:28px">
            <input [value]="name()" (input)="name.set($any($event.target).value)" autocomplete="name" aria-label="Navn" placeholder="Fullt navn" style="height:54px;border-radius:14px;background:#fff;color:#182119;border:0;outline:none;padding:0 16px;font-size:17px;width:100%">
            @if (i.data.needsPassword) {
              <input [value]="pw()" (input)="pw.set($any($event.target).value)" type="password" autocomplete="new-password" aria-label="Velg passord" placeholder="Velg passord (minst 8 tegn)" style="height:54px;border-radius:14px;background:#fff;color:#182119;border:0;outline:none;padding:0 16px;font-size:17px;width:100%">
            }
          </div>
          <div style="flex:1"></div>
          <button (click)="accept(i.data)" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px;margin-top:24px">Aktiver konto</button>
        } @else {
          <div style="color:rgba(255,255,255,.72);margin-top:8px">Invitasjonen er ugyldig eller utløpt. Be om en ny invitasjon.</div>
          <div style="flex:1"></div>
          <button (click)="router.navigateByUrl('/login')" style="height:54px;border:0;border-radius:14px;background:#B7E39B;color:#1B4D2B;font-weight:800;font-size:16px">Til innlogging</button>
        }
      }
    </div>
  `,
})
export class InvitePage {
  private http = inject(HttpClient);
  private auth = inject(AuthStore);
  private shell = inject(ShellStore);
  protected router = inject(Router);
  readonly token = input.required<string>();
  protected name = signal('');
  protected pw = signal('');

  protected info = toSignal(
    toObservable(this.token).pipe(
      switchMap((t) => this.http.get<InviteInfo>(`/api/auth/invite/${t}`)),
      switchMap((data) => {
        this.name.set(data.name ?? '');
        return of({ ok: true as const, data });
      }),
      catchError(() => of({ ok: false as const, data: null as unknown as InviteInfo })),
    ),
  );
  protected roleText = computed(() => {
    const i = this.info();
    return i?.ok ? ROLE_ORDER.filter((r) => i.data.roles[r]).map((r) => ROLES[r].l.toLowerCase()).join(' og ') : '';
  });

  protected async accept(i: InviteInfo) {
    if (this.name().trim().length < 2) return this.shell.toast('Skriv inn navnet ditt');
    if (i.needsPassword && this.pw().length < 8) return this.shell.toast('Passordet må ha minst 8 tegn');
    try {
      this.router.navigateByUrl(await this.auth.acceptInvite(this.token(), this.name(), i.needsPassword ? this.pw() : undefined));
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
