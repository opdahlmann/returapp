import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, resource, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { errorText, relTime } from '../core/format';
import { PickupApi } from '../core/pickups';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

interface ThreadMessage {
  fromUserId: string;
  fromName: string;
  text: string;
  at: string;
}

@Component({
  selector: 'ra-thread',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-height:300px" aria-live="polite">
      @if (loaded() && !messages().length) {
        <div style="text-align:center;color:var(--mu);padding:30px 20px;font-size:14px">Ingen meldinger ennå. Skriv om tilgang, tidspunkt eller spørsmål om varene.</div>
      }
      @for (m of messages(); track $index) {
        @if (m.fromUserId === me) {
          <div style="align-self:flex-end;max-width:80%;background:var(--pri);color:var(--pri-tx);padding:10px 14px;border-radius:18px 18px 4px 18px;font-size:14.5px;line-height:1.4">{{ m.text }}<div style="font-size:11px;opacity:.75;margin-top:4px;text-align:right">{{ time(m.at) }}</div></div>
        } @else {
          <div style="align-self:flex-start;max-width:80%;background:var(--sf);border:1px solid var(--bd);padding:10px 14px;border-radius:18px 18px 18px 4px;font-size:14.5px;line-height:1.4">{{ m.text }}<div style="font-size:11px;color:var(--mu);margin-top:4px">{{ time(m.at) }}</div></div>
        }
      }
      <div #end></div>
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;padding:10px 16px 34px;background:var(--sf);border-top:1px solid var(--bd);display:flex;gap:8px;align-items:center">
      <input [value]="text()" (input)="text.set($any($event.target).value)" (keydown.enter)="send()" aria-label="Skriv en melding" placeholder="Skriv en melding …" style="flex:1;min-width:0;height:46px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;outline:none;font-size:15px">
      <button (click)="send()" aria-label="Send melding" style="width:46px;height:46px;border-radius:14px;border:0;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center"><ra-icon name="send" /></button>
    </div>
  `,
})
export class Thread {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  private auth = inject(AuthStore);
  private pickups = inject(PickupApi);
  readonly id = input.required<string>();
  private end = viewChild<ElementRef<HTMLElement>>('end');
  protected me = this.auth.user()?.id;
  protected messages = signal<ThreadMessage[]>([]);
  protected loaded = signal(false);
  protected text = signal('');
  private pickup = resource({ params: () => this.id(), loader: ({ params }) => this.pickups.get(params) });

  constructor() {
    effect(() => {
      const p = this.pickup.value();
      if (!p) return;
      const counterpart = this.auth.role() === 'giver' ? (p.driverName ?? p.companyName ?? 'Hentefirma') : p.contact;
      this.shell.header(counterpart, `${p.id} · ${p.title}`);
    });
    effect(() => {
      this.load(this.id());
    });
    // Polling hvert 5. sek mens tråden er åpen og synlig. ponytail: polling; SignalR hvis sanntid blir et krav.
    const timer = setInterval(() => document.visibilityState === 'visible' && this.load(this.id()), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected time = (at: string) => relTime(at).replace(', ', ' ');

  private async load(id: string) {
    try {
      const list = await firstValueFrom(this.http.get<ThreadMessage[]>(`/api/pickups/${id}/messages`));
      const grew = list.length !== this.messages().length;
      this.messages.set(list);
      this.loaded.set(true);
      if (grew) setTimeout(() => this.end()?.nativeElement.scrollIntoView({ block: 'end' }));
    } catch {
      /* neste polling prøver igjen */
    }
  }

  protected async send() {
    const text = this.text().trim();
    if (!text) return;
    this.text.set('');
    try {
      const m = await firstValueFrom(this.http.post<ThreadMessage>(`/api/pickups/${this.id()}/messages`, { text }));
      this.messages.update((l) => [...l, m]);
      setTimeout(() => this.end()?.nativeElement.scrollIntoView({ block: 'end' }));
    } catch (e) {
      this.text.set(text);
      this.shell.toast(errorText(e));
    }
  }
}
