import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth.store';
import { ThemeService } from './core/theme';
import { ShellStore } from './shell/shell.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'shell.closeSheet()', '(document:keydown.tab)': 'trapFocus($event)', '(document:keydown.shift.tab)': 'trapFocus($event)' },
  template: `
    <div class="app">
      <router-outlet />
      @if (shell.sheet(); as s) {
        <div (click)="shell.closeSheet()" style="position:absolute;inset:0;background:rgba(10,20,12,.45);z-index:30;animation:ra-fade .2s"></div>
        <div class="ra-scroll" #dialog role="dialog" aria-modal="true" tabindex="-1" style="outline:none;position:absolute;left:0;right:0;bottom:0;z-index:31;background:var(--sf);border-radius:26px 26px 0 0;padding:10px 20px max(44px, env(safe-area-inset-bottom));max-height:82%;overflow:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:14px;animation:ra-up .28s cubic-bezier(.2,.8,.2,1)">
          <div style="width:40px;height:5px;border-radius:3px;background:var(--bd);margin:0 auto 4px"></div>
          <ng-container *ngComponentOutlet="s.component; inputs: s.inputs ?? {}" />
        </div>
      }
      @if (updateReady()) {
        <div role="status" style="position:absolute;left:16px;right:16px;bottom:104px;z-index:41;background:var(--tx);color:var(--bg);padding:10px 10px 10px 16px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;animation:ra-up .25s cubic-bezier(.2,.8,.2,1)"><span style="flex:1">Ny versjon tilgjengelig</span><button (click)="reload()" style="height:36px;padding:0 14px;border:0;border-radius:10px;background:var(--pri);color:var(--pri-tx);font-weight:800">Oppdater</button></div>
      }
      @if (shell.toastText()) {
        <div role="status" style="position:absolute;left:16px;right:16px;bottom:104px;z-index:40;background:var(--tx);color:var(--bg);padding:12px 16px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:ra-up .25s cubic-bezier(.2,.8,.2,1);text-align:center">{{ shell.toastText() }}</div>
      }
    </div>
  `,
})
export class App {
  protected shell = inject(ShellStore);

  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  protected updateReady = signal(false);

  constructor() {
    inject(ThemeService);
    inject(AuthStore).loadMe();
    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      sw.versionUpdates.subscribe((e) => e.type === 'VERSION_READY' && this.updateReady.set(true));
      sw.unrecoverable.subscribe(() => this.reload());
    }
    // Fokus inn i arket når det åpnes, og tilbake til knappen som åpnet det når det lukkes.
    let opener: HTMLElement | null = null;
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (el) {
        opener = document.activeElement as HTMLElement | null;
        setTimeout(() => el.focus({ preventScroll: true })); // arket selv, så tastaturet ikke spretter opp på mobil
      } else if (opener) {
        opener.focus({ preventScroll: true });
        opener = null;
      }
    });
  }

  protected reload() {
    location.reload();
  }

  /** Tab/Shift+Tab sykler innenfor åpent ark. Styres helt her – Safari hopper ellers over knapper. */
  protected trapFocus(e: Event) {
    const el = this.dialog()?.nativeElement;
    const items = el ? focusables(el) : [];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement), step = (e as KeyboardEvent).shiftKey ? -1 : 1;
    items[i === -1 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length].focus();
  }
}

const focusables = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type=file]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null || x === document.activeElement);
