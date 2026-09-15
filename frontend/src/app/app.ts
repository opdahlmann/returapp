import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth.store';
import { ThemeService } from './core/theme';
import { ShellStore } from './shell/shell.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'shell.closeSheet()' },
  template: `
    <div class="app">
      <router-outlet />
      @if (shell.sheet(); as s) {
        <div (click)="shell.closeSheet()" style="position:absolute;inset:0;background:rgba(10,20,12,.45);z-index:30;animation:ra-fade .2s"></div>
        <div role="dialog" aria-modal="true" style="position:absolute;left:0;right:0;bottom:0;z-index:31;background:var(--sf);border-radius:26px 26px 0 0;padding:10px 20px max(44px, env(safe-area-inset-bottom));max-height:82%;overflow:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:14px;animation:ra-up .28s cubic-bezier(.2,.8,.2,1)">
          <div style="width:40px;height:5px;border-radius:3px;background:var(--bd);margin:0 auto 4px"></div>
          <ng-container *ngComponentOutlet="s.component; inputs: s.inputs ?? {}" />
        </div>
      }
      @if (shell.toastText()) {
        <div role="status" style="position:absolute;left:16px;right:16px;bottom:104px;z-index:40;background:var(--tx);color:var(--bg);padding:12px 16px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:ra-up .25s cubic-bezier(.2,.8,.2,1);text-align:center">{{ shell.toastText() }}</div>
      }
    </div>
  `,
})
export class App {
  protected shell = inject(ShellStore);

  constructor() {
    inject(ThemeService);
    inject(AuthStore).loadMe();
  }
}
