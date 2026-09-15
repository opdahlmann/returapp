import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { relTime } from '../core/format';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  pickupId: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICON: Record<string, string> = { message: 'chat', notice: 'megaphone', 'support.reply': 'lifebuoy', coverage: 'pin', 'route.sent': 'route', tip: 'star', 'company.applied': 'building', 'company.approved': 'building' };

@Component({
  selector: 'ra-notifications',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (list.value(); as l) {
      @for (n of l.items; track n.id) {
        <button (click)="open(n)" style="display:flex;gap:12px;align-items:flex-start;text-align:left;padding:14px;border-radius:18px;border:1px solid var(--bd);background:var(--sf)">
          <div [style.background]="n.readAt ? 'var(--sf2)' : 'var(--tint)'" [style.color]="n.readAt ? 'var(--mu)' : 'var(--tint-tx)'" style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><ra-icon [name]="icon(n.type)" /></div>
          <div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><span [style.font-weight]="n.readAt ? 600 : 800">{{ n.title }}</span><span style="font-size:12px;color:var(--mu);flex-shrink:0">{{ time(n.createdAt) }}</span></div><div style="font-size:13px;color:var(--mu);margin-top:2px">{{ n.body }}</div></div>
          @if (!n.readAt) {
            <span aria-label="Ulest" style="width:8px;height:8px;border-radius:50%;background:var(--dan);margin-top:6px;flex-shrink:0"></span>
          }
        </button>
      } @empty {
        <div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingen nye varsler</div>
      }
    }
  `,
})
export class Notifications {
  private http = inject(HttpClient);
  private router = inject(Router);
  private shell = inject(ShellStore);
  protected list = resource({
    loader: async () => {
      const l = await firstValueFrom(this.http.get<{ items: Item[]; unread: number }>('/api/notifications'));
      if (l.unread) firstValueFrom(this.http.post('/api/notifications/read', {})).then(() => this.shell.setBadge('notifications', 0));
      return l;
    },
  });
  protected icon = (type: string) => ICON[type] ?? (type.startsWith('pickup') ? 'truck' : 'bell');
  protected time = (d: string) => relTime(d);

  protected open(n: Item) {
    if (n.pickupId) this.router.navigateByUrl(n.type === 'message' ? `/p/${n.pickupId}/thread` : `/p/${n.pickupId}`);
  }
}
