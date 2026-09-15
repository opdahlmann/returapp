import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** 46×26-bryter fra prototypen. Selve klikket ligger på raden rundt (knappen har role="switch"). */
@Component({
  selector: 'ra-toggle',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [style.background]="on() ? 'var(--pri)' : 'var(--bd)'" style="width:46px;height:26px;border-radius:13px;position:relative;flex-shrink:0">
    <div [style.transform]="'translateX(' + (on() ? 22 : 2) + 'px)'" style="position:absolute;top:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s"></div>
  </div>`,
})
export class Toggle {
  readonly on = input(false);
}
