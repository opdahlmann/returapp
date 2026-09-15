import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { errorText } from '../core/format';
import { Pickup, PickupApi, REASONS } from '../core/pickups';
import { ROLES } from '../core/roles';
import { ShellStore } from '../shell/shell.store';

@Component({
  selector: 'ra-avvik-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Meld avvik</div><div style="font-size:13px;color:var(--mu);margin-top:-10px">{{ pickup().id }} · {{ pickup().title }}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      @for (r of reasons; track r) {
        <button (click)="reason.set(r)" [attr.aria-pressed]="reason() === r" [style.border-color]="reason() === r ? 'var(--dan)' : 'var(--bd)'" [style.background]="reason() === r ? 'var(--dan-bg)' : 'var(--sf)'" style="height:46px;padding:0 14px;border-radius:12px;text-align:left;font-weight:700;font-size:14px;border:1.5px solid var(--bd)">{{ r }}</button>
      }
    </div>
    <textarea [value]="note()" (input)="note.set($any($event.target).value)" rows="2" aria-label="Utdyp" placeholder="Utdyp (valgfritt)" style="width:100%;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:12px 14px;font-size:14px;resize:none;outline:none"></textarea>
    <button (click)="send()" style="height:52px;border:0;border-radius:14px;background:var(--dan);color:#fff;font-weight:800;font-size:16px">Send avvik</button>
  `,
})
export class AvvikSheet {
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  private router = inject(Router);
  private auth = inject(AuthStore);
  readonly pickup = input.required<Pickup>();
  protected reasons = REASONS;
  protected reason = signal<string | null>(null);
  protected note = signal('');

  protected async send() {
    if (!this.reason()) return this.shell.toast('Velg en årsak');
    try {
      await this.api.deviation(this.pickup().id, this.reason()!, this.note());
      this.shell.closeSheet();
      await this.router.navigateByUrl(ROLES[this.auth.role()].home);
      this.shell.toast('Avvik meldt – admin og giver er varslet');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
