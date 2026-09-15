import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, NavigationStart, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { initials } from '../core/format';
import { ROLES, TABS } from '../core/roles';
import { Icon } from '../ui/icon';
import { ShellStore } from './shell.store';

/** Header + innhold + bunnmeny, markup kopiert fra prototypen (sc.app). */
@Component({
  selector: 'ra-shell',
  imports: [RouterOutlet, RouterLink, Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding:max(58px, env(safe-area-inset-top)) 20px 10px;display:flex;align-items:center;gap:12px;min-height:112px">
      @if (!isRoot()) {
        <button (click)="back()" aria-label="Tilbake" style="width:42px;height:42px;border-radius:13px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon name="back" /></button>
      }
      <div style="flex:1;min-width:0">
        <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ title() }}</div>
        @if (sub()) {
          <div style="font-size:13px;color:var(--mu);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ sub() }}</div>
        }
      </div>
      @if (isRoot()) {
        <button routerLink="/notifications" aria-label="Varsler" style="position:relative;width:42px;height:42px;border-radius:13px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <ra-icon name="bell" />
          @if (shell.badges()['notifications']) {
            <span style="position:absolute;top:8px;right:9px;width:8px;height:8px;border-radius:50%;background:var(--dan)"></span>
          }
        </button>
        <button routerLink="/profile" aria-label="Profil" style="width:42px;height:42px;border-radius:13px;border:0;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:14px;flex-shrink:0">{{ ini() }}</button>
      }
    </div>
    <div style="flex:1;overflow:auto;padding:4px 20px 120px;scrollbar-width:none;display:flex;flex-direction:column;gap:14px">
      <router-outlet />
    </div>
    @if (isRoot()) {
      <nav style="position:absolute;left:0;right:0;bottom:0;padding:8px 12px max(30px, env(safe-area-inset-bottom));background:var(--sf);border-top:1px solid var(--bd);display:flex;justify-content:space-around">
        @for (t of tabs(); track t.path) {
          <button (click)="go(t.path)" [attr.aria-current]="isActive(t.path) ? 'page' : null" [style.color]="isActive(t.path) ? 'var(--pri)' : 'var(--mu)'"
            style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 14px;border:0;background:none;min-width:72px">
            <ra-icon [name]="t.i" [size]="24" /><span style="font-size:11px;font-weight:700">{{ t.l }}</span>
            @if (t.badge && shell.badges()[t.badge]) {
              <span style="position:absolute;top:2px;right:14px;min-width:18px;height:18px;border-radius:9px;background:var(--dan);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px">{{ shell.badges()[t.badge] }}</span>
            }
          </button>
        }
      </nav>
    }
  `,
})
export class Shell {
  protected shell = inject(ShellStore);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private location = inject(Location);

  private route = signal(deepest(this.router.routerState.snapshot.root));
  private url = signal(this.router.url);

  protected isRoot = computed(() => !!this.route().data['root']);
  protected title = computed(() => this.shell.title() ?? this.route().data['title'] ?? '');
  protected sub = computed(() => (this.shell.title() !== null ? this.shell.sub() : (this.route().data['sub'] ?? null)));
  protected tabs = computed(() => TABS[this.auth.role()]);
  protected ini = computed(() => (this.auth.isGuest() ? '?' : initials(this.auth.user()?.name) || '?'));

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e instanceof NavigationStart) {
        this.shell.title.set(null);
        this.shell.sub.set(null);
      }
      if (e instanceof NavigationEnd) {
        this.route.set(deepest(this.router.routerState.snapshot.root));
        this.url.set(e.urlAfterRedirects);
      }
    });
  }

  protected isActive(path: string) {
    return this.isRoot() && this.url().split('?')[0].startsWith(path);
  }

  protected go(path: string) {
    this.router.navigateByUrl(path);
  }

  protected back() {
    if ((history.state?.navigationId ?? 1) > 1) this.location.back();
    else this.router.navigateByUrl(ROLES[this.auth.role()].home);
  }
}

function deepest(r: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  while (r.firstChild) r = r.firstChild;
  return r;
}
