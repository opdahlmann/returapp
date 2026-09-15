import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CompanyApi } from '../core/company';
import { dayChips, errorText, initials } from '../core/format';
import { Pickup, SLOTS } from '../core/pickups';
import { ShellStore } from '../shell/shell.store';

/** "Tildel og planlegg". fixed = sjåfør tar oppdraget selv fra børsen (ingen sjåførliste, dag og tid påkrevd). */
@Component({
  selector: 'ra-assign-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Tildel og planlegg</div><div style="font-size:13px;color:var(--mu);margin-top:-10px">{{ pickup().id }} · {{ pickup().title }}</div>
    @if (!fixed()) {
      <div style="display:flex;flex-direction:column;gap:8px">
        @for (d of drivers.value() ?? []; track d.id) {
          <button (click)="driverId.set(d.id)" [attr.aria-pressed]="driverId() === d.id" [style.border-color]="driverId() === d.id ? 'var(--pri)' : 'var(--bd)'" [style.background]="driverId() === d.id ? 'var(--tint)' : 'var(--sf)'" style="display:flex;gap:12px;align-items:center;text-align:left;padding:12px;border-radius:14px;border:1.5px solid var(--bd)"><div style="width:40px;height:40px;border-radius:50%;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">{{ ini(d.name) }}</div><div style="flex:1;min-width:0"><div style="font-weight:700">{{ d.name }}</div><div style="font-size:12px;color:var(--mu)">{{ d.vehicle || 'Sjåfør' }} · {{ d.planned }} stopp planlagt</div></div>@if (d.id === pickup().suggestedDriverId) {<span style="padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;background:var(--tint);color:var(--tint-tx)">Foreslått</span>}</button>
        }
      </div>
    } @else {
      <div style="font-size:14px;padding:12px 14px;border-radius:14px;background:var(--tint);color:var(--tint-tx)">Du tar oppdraget selv. Velg når du henter, så får giver beskjed.</div>
    }
    <div><div style="font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Dag</div><div style="display:flex;gap:8px;flex-wrap:wrap">
      @for (d of days; track d.v) {
        <button (click)="toggleDay(d.v)" [attr.aria-pressed]="day() === d.v" [style]="chip(day() === d.v)" style="height:38px;padding:0 14px;border-radius:999px;font-weight:700;font-size:14px">{{ d.label }}</button>
      }
    </div></div>
    <div><div style="font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Tidsvindu</div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
      @for (s of slots; track s) {
        <button (click)="slot.set(slot() === s ? null : s)" [attr.aria-pressed]="slot() === s" [style]="chip(slot() === s)" style="height:44px;border-radius:12px;font-weight:700;font-size:14px">{{ s }}</button>
      }
    </div></div>
    <button (click)="confirm()" [disabled]="busy()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Bekreft – giver varsles</button>
  `,
})
export class AssignSheet implements OnInit {
  private http = inject(HttpClient);
  private company = inject(CompanyApi);
  private shell = inject(ShellStore);
  readonly pickup = input.required<Pickup>();
  readonly fixed = input(false);
  readonly preselect = input<string | null>(null);
  readonly done = input<() => void>();
  protected days = dayChips();
  protected slots = SLOTS;
  protected driverId = signal<string | null>(null);
  protected day = signal<string | null>(null);
  protected slot = signal<string | null>(null);
  protected busy = signal(false);
  protected drivers = resource({ params: () => (this.fixed() ? undefined : this.pickup().companyId ?? undefined), loader: ({ params }) => this.company.drivers(params) });
  protected ini = initials;

  ngOnInit() {
    const p = this.pickup();
    this.driverId.set(this.preselect() ?? p.driverId);
    this.day.set(p.day && this.days.some((d) => d.v === p.day) ? p.day : this.fixed() ? this.days[1].v : null);
    this.slot.set(p.slot && SLOTS.includes(p.slot) ? p.slot : this.fixed() ? '09–12' : null);
  }

  protected chip(on: boolean) {
    return `border:1.5px solid ${on ? 'var(--pri)' : 'var(--bd)'};background:${on ? 'var(--pri)' : 'var(--sf)'};color:${on ? 'var(--pri-tx)' : 'var(--tx)'}`;
  }

  protected toggleDay(v: string) {
    this.day.set(this.day() === v ? null : v);
  }

  protected async confirm() {
    if (!this.fixed() && !this.driverId()) return this.shell.toast('Velg sjåfør');
    if (this.fixed() && (!this.day() || !this.slot())) return this.shell.toast('Velg dag og tidsvindu');
    this.busy.set(true);
    try {
      const body = { driverId: this.fixed() ? null : this.driverId(), day: this.day(), slot: this.slot() };
      const p = await firstValueFrom(this.http.post<Pickup>(`/api/pickups/${this.pickup().id}/assign`, body));
      const label = this.days.find((d) => d.v === p.day)?.label;
      this.shell.closeSheet();
      this.shell.toast(p.status === 'planlagt' ? `Planlagt ${label} ${p.slot} · ${p.driverName}` : `Tildelt ${p.driverName}`);
      this.done()?.();
    } catch (e) {
      this.shell.toast(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
