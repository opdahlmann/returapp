import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ra-notifications',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div style="padding:40px 20px;text-align:center;color:var(--mu)">Ingen nye varsler</div>`,
})
export class Notifications {}
