import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../ui/icon';
import { ShellStore } from '../shell/shell.store';

@Component({
  selector: 'ra-super-admin',
  imports: [RouterLink, Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:0 14px">
      @for (m of items; track m.path; let last = $last) {
        <button [routerLink]="m.path" [style.border-bottom]="last ? '0' : '1px solid var(--bd)'" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 0;border:0;background:none;text-align:left">
          <span style="color:var(--pri)"><ra-icon [name]="m.icon" /></span>
          <div style="flex:1"><div style="font-weight:700">{{ m.title }}</div><div style="font-size:12px;color:var(--mu)">{{ m.sub }}</div></div>
          @if (m.badge && shell.badges()[m.badge]) {
            <span style="min-width:22px;height:22px;border-radius:11px;background:var(--warn);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 6px">{{ shell.badges()[m.badge] }}</span>
          }
          <span style="color:var(--mu)"><ra-icon name="chev" /></span>
        </button>
      }
    </div>
  `,
})
export class AdminMenu {
  protected shell = inject(ShellStore);
  protected items = [
    { path: '/s/companies', icon: 'building', title: 'Hentefirma', sub: 'Godkjenn, dekning, kontakt', badge: 'pendingCompanies' },
    { path: '/s/users', icon: 'users', title: 'Brukere og roller', sub: 'Giver, sjåfør, admin, superbruker' },
    { path: '/s/cats', icon: 'grid', title: 'Kategorier', sub: 'Navn, ikon og rekkefølge' },
    { path: '/s/postnr', icon: 'pin', title: 'Postnummer og dekning', sub: 'Hvem henter hvor' },
    { path: '/s/notice', icon: 'megaphone', title: 'Systemvarsel', sub: 'Melding til alle eller utvalgte brukere' },
    { path: '/s/support', icon: 'lifebuoy', title: 'Support', sub: 'Meldinger fra brukere og firma' },
  ];
}
