import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore, Me } from '../core/auth.store';
import { phone } from '../core/format';
import { Role, ROLES } from '../core/roles';
import { Icon } from '../ui/icon';
import { consumeReturnUrl } from './login';

/** Organisasjon som vises for en rolle: firmanavn for sjåfør/admin, org for giver, "Returapp" for superbruker. */
export function roleOrg(user: Me | null, role: Role): string {
  if (!user) return 'Uten konto';
  return role === 'super' ? 'Returapp' : role === 'giver' ? user.org : (user.company?.name ?? user.org);
}

/** "navn · org" på rollekortet. */
export function roleWho(user: Me | null, role: Role): string {
  if (!user) return 'Gjest · Uten konto';
  return [user.name || phone(user.phone), roleOrg(user, role)].filter(Boolean).join(' · ');
}

@Component({
  selector: 'ra-roles',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="flex:1;display:flex;flex-direction:column;background:var(--bg);padding:70px 20px 40px;overflow:auto">
      <div style="font-size:26px;font-weight:800;letter-spacing:-.02em">Hvem er du i dag?</div>
      <div style="color:var(--mu);margin-top:6px">Kontoen din har flere roller. Du kan bytte når som helst fra profilen.</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:22px">
        @for (r of cards(); track r.id) {
          <button (click)="choose(r.id)" style="display:flex;align-items:center;gap:14px;text-align:left;padding:16px;border-radius:18px;border:1.5px solid var(--bd);background:var(--sf);box-shadow:var(--sh)">
            <div style="width:46px;height:46px;border-radius:14px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center"><ra-icon [name]="r.icon" [size]="24" /></div>
            <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:16px">{{ r.l }}</div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ r.d }}</div><div style="font-size:12px;color:var(--pri);font-weight:600;margin-top:4px">{{ r.who }}</div></div>
            <span style="color:var(--mu)"><ra-icon name="chev" /></span>
          </button>
        }
      </div>
      <div style="flex:1"></div>
      <button (click)="logout()" style="background:none;border:0;color:var(--mu);font-size:14px;margin-top:16px">Logg ut</button>
    </div>
  `,
})
export class RolePicker {
  private auth = inject(AuthStore);
  private router = inject(Router);
  protected cards = computed(() => this.auth.roles().map((id) => ({ id, ...ROLES[id], who: roleWho(this.auth.user(), id) })));

  protected choose(role: Role) {
    this.auth.setRole(role);
    const ret = consumeReturnUrl();
    this.router.navigateByUrl(ret ?? ROLES[role].home);
  }

  protected logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
