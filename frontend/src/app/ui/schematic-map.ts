import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Punktplassering fra prototypen (Component.POS). */
const POS = [[20, 66], [46, 40], [70, 60], [36, 20], [80, 24], [58, 82]];

/** Skjematisk kart som i designet – bevisst ikke et ekte kart. variant 'driver' = 360/200 med ekstra vei og km-merke, 'admin' = 360/180. */
@Component({
  selector: 'ra-schematic-map',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [style.aspect-ratio]="variant() === 'driver' ? '360/200' : '360/180'" style="position:relative;border-radius:20px;overflow:hidden;border:1px solid var(--bd);background:var(--sf2);flex-shrink:0" role="img" [attr.aria-label]="'Skjematisk kart med ' + count() + ' stopp'">
      <svg viewBox="0 0 360 200" width="100%" height="100%" style="position:absolute;inset:0;display:block" [attr.preserveAspectRatio]="variant() === 'driver' ? null : 'none'">
        <path d="M0 150 C60 120 90 170 150 140 S250 90 360 110" stroke="var(--bd)" stroke-width="10" fill="none" stroke-linecap="round"></path>
        <path d="M40 0 C60 60 120 80 140 200" stroke="var(--bd)" stroke-width="8" fill="none"></path>
        <path d="M200 0 C220 70 300 90 360 40" stroke="var(--bd)" stroke-width="8" fill="none"></path>
        @if (variant() === 'driver') {
          <path d="M0 60 L360 30" stroke="var(--bd)" stroke-width="5" fill="none"></path>
        }
        <polyline [attr.points]="points()" stroke="var(--pri)" stroke-width="3" stroke-dasharray="6 5" fill="none" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
      @for (p of dots(); track $index) {
        <div [style.left.%]="p.x" [style.top.%]="p.y" style="position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;background:var(--tx);color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.25)">{{ p.n }}</div>
      }
      @if (variant() === 'driver') {
        <div style="position:absolute;left:10px;bottom:10px;font-size:11px;font-weight:700;color:var(--mu);background:var(--sf);padding:4px 8px;border-radius:8px">Skjematisk kart · {{ km() }} km</div>
      }
    </div>
  `,
})
export class SchematicMap {
  readonly count = input(0);
  readonly km = input(0);
  readonly variant = input<'driver' | 'admin'>('admin');
  protected dots = computed(() => Array.from({ length: this.count() }, (_, i) => ({ n: i + 1, x: POS[i % 6][0], y: POS[i % 6][1] })));
  protected points = computed(() => this.dots().map((d) => `${d.x * 3.6},${d.y * 2}`).join(' '));
}
