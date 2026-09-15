import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { errorText } from '../core/format';
import { RefStore } from '../core/ref.store';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';

interface CoverageView {
  items: { kommune: string; postnr: number; covered: boolean }[];
  coveredPostnr: number;
}

@Component({
  selector: 'ra-coverage',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:14px;color:var(--mu);line-height:1.45">Slå på kommunene dere henter i. Givere i disse områdene får dere som hentefirma automatisk.</div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      @for (c of view()?.items ?? []; track c.kommune) {
        <button (click)="toggle(c.kommune)" [attr.aria-pressed]="c.covered" [style.border-color]="c.covered ? 'var(--pri)' : 'var(--bd)'" [style.background]="c.covered ? 'var(--pri)' : 'var(--sf2)'" [style.color]="c.covered ? 'var(--pri-tx)' : 'var(--mu)'" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px;border-radius:14px;text-align:left;border:1.5px solid var(--bd)"><span style="font-weight:800;font-size:14px;line-height:1.1">{{ c.kommune }}</span><span style="font-size:11px;opacity:.85">{{ c.postnr }} postnr · {{ c.covered ? 'Dekkes' : 'Ikke dekket' }}</span></button>
      }
    </div>
    <div style="border-radius:16px;padding:14px;border:1px solid var(--bd);background:var(--sf);font-size:14px;display:flex;gap:12px;align-items:center"><span style="color:var(--pri)"><ra-icon name="pin" /></span><div><b>{{ view()?.coveredPostnr ?? 0 }} postnummer</b> dekkes nå. Endringer gjelder umiddelbart for nye registreringer.</div></div>
  `,
})
export class CoverageArea {
  private http = inject(HttpClient);
  private shell = inject(ShellStore);
  private ref = inject(RefStore);
  private companyId = inject(AuthStore).user()?.companyId;
  protected view = signal<CoverageView | null>(null);

  constructor() {
    firstValueFrom(this.http.get<CoverageView>(`/api/companies/${this.companyId}/coverage`)).then((v) => this.view.set(v), (e) => this.shell.toast(errorText(e)));
  }

  protected async toggle(kommune: string) {
    const v = this.view();
    if (!v) return;
    const items = v.items.map((i) => (i.kommune === kommune ? { ...i, covered: !i.covered } : i));
    this.view.set({ items, coveredPostnr: items.filter((i) => i.covered).reduce((a, i) => a + i.postnr, 0) });
    try {
      const saved = await firstValueFrom(this.http.put<CoverageView>(`/api/companies/${this.companyId}/coverage`, { kommuner: items.filter((i) => i.covered).map((i) => i.kommune) }));
      this.view.set({ ...saved, items: items.map((i) => saved.items.find((s) => s.kommune === i.kommune) ?? i) });
      this.ref.clearPostnr();
    } catch (e) {
      this.view.set(v);
      this.shell.toast(errorText(e));
    }
  }
}
