import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS } from './icons';

/** Inline SVG-ikon som prototypens ic(name, size, sw). Vertselementet er display:contents, så layouten er som om <svg> står direkte. */
@Component({
  selector: 'ra-icon',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" [attr.stroke-width]="sw()"
    stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block" aria-hidden="true">
    @for (d of paths(); track $index) {
      <path [attr.d]="d" />
    }
  </svg>`,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(22);
  readonly sw = input(2);
  protected readonly paths = computed(() => ICONS[this.name()] ?? ICONS['annet']);
}
