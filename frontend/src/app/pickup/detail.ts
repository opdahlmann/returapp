import { ChangeDetectionStrategy, Component, computed, effect, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { errorText, phone, relTime } from '../core/format';
import { isActive, kgText, Pickup, PickupApi, place, qtyText, statusBg, statusFg, statusLabel, timeline, when } from '../core/pickups';
import { ShellStore } from '../shell/shell.store';
import { AssignSheet } from './assign-sheet';
import { AvvikSheet } from './avvik-sheet';
import { Icon } from '../ui/icon';
import { PhotoImg } from '../ui/photo';

const ROW = 'display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px';
const BTN_SEC = 'height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px';


@Component({
  selector: 'ra-pickup-detail',
  imports: [Icon, PhotoImg, RouterLink],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pickup.value(); as p) {
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:50px;height:50px;border-radius:15px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center"><ra-icon [name]="p.categoryIcon" [size]="28" /></div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--mu)">{{ p.categoryName }} · meldt {{ created(p) }}</div><div style="font-weight:700;margin-top:2px">{{ p.giverOrg }}</div></div>
        <span [style.background]="statusBg(p)" [style.color]="statusFg(p)" style="padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700">{{ statusLabel(p) }}</span>
      </div>
      @if (p.photos.length || p.pickedPhotos.length) {
        <div style="display:flex;gap:8px;overflow:auto;scrollbar-width:none;margin:0 -20px;padding:0 20px;flex-shrink:0">
          @for (ph of p.photos.concat(p.pickedPhotos); track ph.fileId; let i = $index) {
            <button (click)="full.set(ph.fileId)" [attr.aria-label]="'Vis bilde ' + (i + 1)" style="width:120px;height:96px;flex-shrink:0;border-radius:14px;background:var(--sf2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--mu);position:relative;padding:0;overflow:hidden"><ra-photo [id]="ph.thumbId" [alt]="'Bilde ' + (i + 1)" /></button>
          }
        </div>
      }
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:16px;display:flex;flex-direction:column;gap:0">
        @for (t of rows(); track $index) {
          <div style="display:flex;gap:12px;min-height:44px">
            <div style="display:flex;flex-direction:column;align-items:center;width:14px"><div [style.background]="t.dot" style="width:12px;height:12px;border-radius:50%;margin-top:4px;flex-shrink:0"></div><div style="flex:1;width:2px;background:var(--bd);margin:4px 0"></div></div>
            <div style="flex:1;padding-bottom:10px"><div [style.color]="t.fg" style="font-weight:700;font-size:14px">{{ t.label }}</div>@if (t.time) {<div style="font-size:12px;color:var(--mu);margin-top:2px">{{ t.time }}</div>}</div>
          </div>
        }
      </div>
      @if (p.driverName) {
        <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:14px;display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--pri);color:var(--pri-tx);display:flex;align-items:center;justify-content:center;font-weight:800"><ra-icon name="truck" /></div>
          <div style="flex:1;min-width:0"><div style="font-weight:700">{{ p.driverName }}</div><div style="font-size:13px;color:var(--mu)">{{ p.companyName }}</div></div>
          @if (role() === 'giver') {
            <button (click)="call(p.driverPhone)" [attr.aria-label]="'Ring ' + p.driverName" style="width:42px;height:42px;border-radius:13px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;color:var(--pri)"><ra-icon name="phone" /></button><button [routerLink]="'/p/' + p.id + '/thread'" [attr.aria-label]="'Melding til ' + p.driverName" style="width:42px;height:42px;border-radius:13px;border:1px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;color:var(--pri)"><ra-icon name="chat" /></button>
          }
        </div>
      }
      <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:4px 16px">
        <div [style]="row"><span style="color:var(--mu)">Hentested</span><span style="font-weight:600;text-align:right">{{ place(p) }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Tid</span><span style="font-weight:600;text-align:right">{{ when(p) }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Mengde</span><span style="font-weight:600;text-align:right">{{ qtyText(p.qty, p.unit) }} · {{ p.cond }}</span></div>
        @if (p.dims) {
          <div [style]="row"><span style="color:var(--mu)">Mål</span><span style="font-weight:600;text-align:right">{{ p.dims }}</span></div>
        }
        <div [style]="row"><span style="color:var(--mu)">Tilgang</span><span style="font-weight:600;text-align:right">{{ p.unattended ? 'Kan hentes uten at noen er til stede' : 'Noen må være til stede' }}</span></div>
        <div [style]="row"><span style="color:var(--mu)">Kontakt</span><span style="font-weight:600;text-align:right">{{ p.contact }} · {{ phone(p.phone) }}</span></div>
        <div [style]="p.desc ? row : row + ';border-bottom:0'"><span style="color:var(--mu)">Anslått vekt</span><span style="font-weight:600;text-align:right">{{ kgText(p) }}</span></div>
        @if (p.desc) {
          <div style="padding:12px 0;font-size:14px;line-height:1.5"><div style="color:var(--mu);margin-bottom:4px">Beskrivelse</div>{{ p.desc }}</div>
        }
      </div>

      @switch (role()) {
        @case ('giver') {
          <div style="display:flex;flex-direction:column;gap:10px">
            @if (p.status === 'hentet') {
              <button [routerLink]="'/p/' + p.id + '/receipt'" style="height:50px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="check" />Se kvittering</button>
            }
            <div style="display:flex;gap:10px">
              <button [routerLink]="'/p/' + p.id + '/label'" [style]="btnSec" style="flex:1"><ra-icon name="qr" />Merkelapp</button>
              @if (active(p)) {
                <button (click)="cancel(p)" [style]="btnSec" style="flex:1;color:var(--dan)">Avbryt henting</button>
              }
            </div>
          </div>
        }
        @case ('driver') {
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
            <button (click)="navigate(p)" style="height:64px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--pri)"><ra-icon name="nav" /><span style="color:var(--tx)">Naviger</span></button>
            <button (click)="call(p.phone)" style="height:64px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--pri)"><ra-icon name="phone" /><span style="color:var(--tx)">Ring</span></button>
            <button [routerLink]="'/p/' + p.id + '/thread'" style="height:64px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--pri)"><ra-icon name="chat" /><span style="color:var(--tx)">Melding</span></button>
          </div>
          @if (p.status === 'planlagt' || p.status === 'tildelt') {
            <button (click)="act('start', p)" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Start henting</button>
          }
          @if (p.status === 'underveis') {
            <button [routerLink]="'/p/' + p.id + '/complete'" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Fortsett henting</button>
          }
          @if (p.status === 'hentet') {
            <button [routerLink]="'/p/' + p.id + '/receipt'" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Se kvittering</button>
          }
          @if (active(p)) {
            <button (click)="act('deviation', p)" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700;color:var(--dan)">Meld avvik</button>
          }
        }
        @case ('admin') {
          @if (p.status === 'ny') {
            @if (p.suggestedDriverName) {
              <div style="border-radius:16px;padding:14px;background:var(--tint);color:var(--tint-tx);display:flex;gap:12px;align-items:center"><span><ra-icon name="star" /></span><div style="flex:1;font-size:14px"><b>Forslag:</b> {{ suggestion(p) }}</div></div>
            }
            <button (click)="act('assign', p)" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Tildel sjåfør og planlegg</button>
            <button (click)="act('market', p)" [style]="btnSec"><ra-icon name="tag" />{{ p.open ? 'Fjern fra børs' : 'Legg på børs' }}</button>
          }
          @if (p.status === 'tildelt') {
            <button (click)="act('assign', p)" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Planlegg tidspunkt</button>
          }
          @if (p.status === 'planlagt') {
            <button (click)="act('assign', p)" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Endre sjåfør eller tid</button>
          }
          <div style="display:flex;gap:10px"><button (click)="call(p.phone)" [style]="btnSec" style="flex:1"><ra-icon name="phone" />Ring giver</button><button [routerLink]="'/p/' + p.id + '/thread'" [style]="btnSec" style="flex:1"><ra-icon name="chat" />Melding</button></div>
        }
        @case ('super') {
          <div style="border-radius:16px;padding:14px;border:1px solid var(--bd);background:var(--sf);font-size:14px"><span style="color:var(--mu)">Firma:</span> <b>{{ p.companyName ?? 'Ikke tildelt firma' }}</b></div>
          <button (click)="act('company', p)" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">Tildel / bytt hentefirma</button>
          @if (p.companyId) {
            <button (click)="act('assign', p)" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Overstyr sjåfør og tid</button>
          }
        }
      }
      @if (full(); as fileId) {
        <div (click)="full.set(null)" role="dialog" aria-modal="true" aria-label="Bilde" style="position:absolute;inset:0;z-index:50;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:20px;animation:ra-fade .2s">
          <div style="width:100%;max-height:100%;aspect-ratio:4/3;border-radius:14px;overflow:hidden"><ra-photo [id]="fileId" alt="Bilde i full størrelse" /></div>
        </div>
      }
    } @else if (pickup.error()) {
      <div style="padding:40px 20px;text-align:center;color:var(--mu)">Fant ikke hentingen.</div>
    }
  `,
})
export class PickupDetail {
  private api = inject(PickupApi);
  private auth = inject(AuthStore);
  private shell = inject(ShellStore);
  private router = inject(Router);
  readonly id = input.required<string>();
  protected pickup = resource({ params: () => this.id(), loader: ({ params }) => this.api.get(params) });
  protected role = this.auth.role;
  protected rows = computed(() => (this.pickup.value() ? timeline(this.pickup.value()!) : []));
  protected full = signal<string | null>(null);
  protected row = ROW;
  protected btnSec = BTN_SEC;
  protected place = place;
  protected when = (p: Pickup) => when(p);
  protected qtyText = qtyText;
  protected kgText = kgText;
  protected phone = phone;
  protected active = isActive;
  protected statusLabel = statusLabel;
  protected statusBg = statusBg;
  protected statusFg = statusFg;
  protected created = (p: Pickup) => relTime(p.createdAt).replace(/^I dag, /, 'i dag ').replace(/^I går, /, 'i går ');

  constructor() {
    effect(() => {
      const p = this.pickup.value();
      if (p) this.shell.header(p.title, `${p.id} · ${statusLabel(p)}`);
    });
  }

  reload() {
    this.pickup.reload();
  }

  protected call(tel: string | null) {
    if (tel) location.href = 'tel:' + tel;
  }

  protected navigate(p: Pickup) {
    const dest = p.lat && p.lng ? `${p.lat},${p.lng}` : `${p.address}, ${p.postnr} ${p.kommune}`;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
  }

  protected suggestion(p: Pickup) {
    return p.suggestedCoversArea
      ? `${p.suggestedDriverName} dekker ${p.postnr} ${p.kommune} og har ${p.suggestedLoad} oppdrag planlagt.`
      : `${p.suggestedDriverName} har færrest oppdrag (${p.suggestedLoad}) akkurat nå.`;
  }

  protected async act(name: string, p: Pickup) {
    const reload = () => this.reload();
    try {
      switch (name) {
        case 'assign':
          return this.shell.openSheet(AssignSheet, { pickup: p, preselect: p.driverId ?? p.suggestedDriverId ?? null, done: reload });
        case 'start':
          await this.api.start(p.id);
          return this.router.navigateByUrl(`/p/${p.id}/complete`);
        case 'deviation':
          return this.shell.openSheet(AvvikSheet, { pickup: p });
        case 'market':
          await this.api.market(p.id, !p.open);
          this.shell.toast(p.open ? 'Fjernet fra børsen' : 'Lagt på oppdragsbørsen');
          return reload();
        default:
          this.shell.toast('Kommer snart');
      }
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }

  protected cancel(p: Pickup) {
    this.shell.openSheet(CancelSheet, { pickup: p, done: () => this.reload() });
  }
}

@Component({
  selector: 'ra-cancel-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Avbryte hentingen?</div>
    <div style="font-size:14px;color:var(--mu);margin-top:-8px">Hentefirmaet får beskjed med en gang. Du kan melde inn på nytt senere.</div>
    <button (click)="confirm()" style="height:52px;border:0;border-radius:14px;background:var(--dan);color:#fff;font-weight:800;font-size:16px">Ja, avbryt</button>
    <button (click)="shell.closeSheet()" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Behold</button>
  `,
})
export class CancelSheet {
  private api = inject(PickupApi);
  protected shell = inject(ShellStore);
  readonly pickup = input.required<Pickup>();
  readonly done = input<() => void>();

  protected async confirm() {
    try {
      await this.api.cancel(this.pickup().id);
      this.shell.closeSheet();
      this.shell.toast('Hentingen er avbrutt');
      this.done()?.();
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
