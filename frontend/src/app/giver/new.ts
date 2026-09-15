import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, resource, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { dayChips, errorText, phone } from '../core/format';
import { CONDS, PickupApi, qtyText, SLOTS, UNITS } from '../core/pickups';
import { RefStore } from '../core/ref.store';
import { guestPostnr } from '../profile/profile-sheets';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { Toggle } from '../ui/toggle';

interface LocalPhoto {
  key: number;
  preview: string;
  fileId: string | null;
}

const LABEL = 'display:block;font-size:12px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px';
const INPUT = 'width:100%;height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:0 14px;font-size:15px;outline:none';

/** Pure regler, testet i new.spec.ts */
export function wizardError(step: number, s: { qty: string; address: string; postnr: string; guest: boolean; contactName: string; contactPhone: string }): string | null {
  if (step === 3 && !(Number(s.qty.replace(',', '.')) > 0)) return 'Oppgi antall / mengde';
  if (step === 4 && (!s.address.trim() || !/^\d{4}$/.test(s.postnr))) return 'Adresse og postnummer må fylles ut';
  if (step === 4 && s.guest && (s.contactName.trim().length < 2 || s.contactPhone.replace(/\D/g, '').length < 8)) return 'Skriv inn navn og mobilnummer';
  return null;
}

@Component({
  selector: 'ra-giver-new',
  imports: [Icon, Toggle],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="display:flex;gap:6px">
      @for (i of [1, 2, 3, 4, 5]; track i) {
        <div [style.background]="i <= step() ? 'var(--pri)' : 'var(--bd)'" style="flex:1;height:4px;border-radius:2px"></div>
      }
    </div>

    @switch (step()) {
      @case (1) {
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Hva slags ting er det?</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          @for (c of ref.categories(); track c.id) {
            <button (click)="pickCategory(c.id)" [style.border-color]="c.id === cat() ? 'var(--pri)' : 'var(--bd)'" [style.background]="c.id === cat() ? 'var(--tint)' : 'var(--sf)'" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 6px 12px;border-radius:16px;border:1.5px solid var(--bd)"><span style="color:var(--pri)"><ra-icon [name]="c.icon" [size]="26" /></span><span style="font-size:12.5px;font-weight:600;text-align:center;line-height:1.1">{{ c.name }}</span></button>
          }
        </div>
      }
      @case (2) {
        <div style="display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:12px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center"><ra-icon [name]="category().icon" /></span><div style="font-size:20px;font-weight:800;letter-spacing:-.02em">{{ category().name }} – vis oss</div></div>
        <input #camera type="file" accept="image/*" capture="environment" hidden (change)="addPhotos($any($event.target))">
        <input #gallery type="file" accept="image/*" multiple hidden (change)="addPhotos($any($event.target))">
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          @for (ph of photos(); track ph.key; let i = $index) {
            <div style="position:relative;aspect-ratio:1;border-radius:14px;background:var(--sf2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--mu);overflow:hidden">
              <img [src]="ph.preview" [alt]="'Bilde ' + (i + 1)" [style.opacity]="ph.fileId ? 1 : 0.5" style="width:100%;height:100%;object-fit:cover">
              <button (click)="removePhoto(ph.key)" [attr.aria-label]="'Fjern bilde ' + (i + 1)" style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:0;background:var(--tx);color:var(--bg);display:flex;align-items:center;justify-content:center;padding:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></button>
            </div>
          }
          @if (photos().length < 6) {
            <button (click)="camera.click()" style="aspect-ratio:1;border-radius:14px;border:1.5px dashed var(--pri);background:var(--tint);color:var(--tint-tx);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:700"><ra-icon name="camera" />Ta bilde</button>
            <button (click)="gallery.click()" style="aspect-ratio:1;border-radius:14px;border:1.5px dashed var(--bd);background:var(--sf);color:var(--mu);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:700"><ra-icon name="image" />Galleri</button>
          }
        </div>
        @if (!photos().length) {
          <div style="font-size:13px;color:var(--mu)">Bilder gjør det mye lettere for hentefirmaet å vurdere og planlegge. Anbefalt, ikke påkrevd.</div>
        }
        <div><label for="desc" [style]="label">Beskrivelse</label><textarea id="desc" [value]="desc()" (input)="desc.set($any($event.target).value)" rows="4" placeholder="Hva er det, hvilken stand, hvor står det …" style="width:100%;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:12px 14px;font-size:15px;resize:none;outline:none"></textarea></div>
      }
      @case (3) {
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Hvor mye, og i hvilken stand?</div>
        <div><label for="qty" [style]="label">Antall / mengde</label><input id="qty" [value]="qty()" (input)="qty.set($any($event.target).value)" inputmode="decimal" placeholder="f.eks. 24" style="width:100%;height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);padding:0 14px;font-size:17px;font-weight:700;outline:none"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          @for (u of units; track u) {
            <button (click)="unit.set(u)" [attr.aria-pressed]="unit() === u" [style]="chip(unit() === u)" style="height:38px;padding:0 14px;border-radius:999px;font-weight:700;font-size:14px">{{ u }}</button>
          }
        </div>
        <div><label [style]="label8">Tilstand</label><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
          @for (c of conds; track c) {
            <button (click)="cond.set(c)" [attr.aria-pressed]="cond() === c" [style]="chip(cond() === c)" style="height:44px;border-radius:12px;font-weight:700;font-size:13px">{{ c }}</button>
          }
        </div></div>
        <div><label for="dims" [style]="label">Mål (valgfritt)</label><input id="dims" [value]="dims()" (input)="dims.set($any($event.target).value)" placeholder="f.eks. 120 × 140 cm" [style]="input"></div>
      }
      @case (4) {
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Hvor og når kan det hentes?</div>
        <div><label for="addr" [style]="label">Adresse</label><input id="addr" [value]="address()" (input)="address.set($any($event.target).value)" autocomplete="street-address" placeholder="Gate og nummer" [style]="input"></div>
        <div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px">
          <div><label for="postnr" [style]="label">Postnr</label><input id="postnr" [value]="postnr()" (input)="setPostnr($any($event.target))" inputmode="numeric" maxlength="4" autocomplete="postal-code" [style]="input"></div>
          <div><label [style]="label">Sted</label><div style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--sf2);padding:0 14px;display:flex;align-items:center;color:var(--mu)">{{ place.value()?.kommune ?? '' }}</div></div>
        </div>
        @if (place.value() && !place.value()!.covered) {
          <div style="display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:14px;background:var(--warn-bg);color:var(--warn);font-size:13px;font-weight:600"><ra-icon name="alert" />Ingen hentefirma dekker {{ postnr() }} ennå. Du kan registrere likevel – vi varsler deg når noen dekker området.</div>
        }
        <div><label [style]="label8">Dag</label><div style="display:flex;gap:8px;flex-wrap:wrap">
          @for (d of days; track d.v) {
            <button (click)="day.set(d.v)" [attr.aria-pressed]="day() === d.v" [style]="chip(day() === d.v)" style="height:38px;padding:0 14px;border-radius:999px;font-weight:700;font-size:14px">{{ d.label }}</button>
          }
        </div></div>
        <div><label [style]="label8">Tidsvindu</label><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
          @for (s of slots; track s) {
            <button (click)="slot.set(s)" [attr.aria-pressed]="slot() === s" [style]="chip(slot() === s)" style="height:44px;border-radius:12px;font-weight:700;font-size:14px">{{ s }}</button>
          }
        </div></div>
        <button (click)="unattended.set(!unattended())" role="switch" [attr.aria-checked]="unattended()" style="display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border-radius:14px;border:1px solid var(--bd);background:var(--sf)"><div style="flex:1"><div style="font-weight:700">Kan hentes uten at noen er til stede</div><div style="font-size:13px;color:var(--mu)">Sjåføren får beskjed om hvor det står</div></div><ra-toggle [on]="unattended()" /></button>
        @if (auth.isGuest()) {
          <div><label for="cname" [style]="label">Kontaktperson</label><input id="cname" [value]="contactName()" (input)="contactName.set($any($event.target).value)" autocomplete="name" placeholder="Navn" [style]="input"></div>
          <div><label for="cphone" [style]="label">Mobil</label><input id="cphone" [value]="contactPhone()" (input)="contactPhone.set($any($event.target).value)" inputmode="tel" autocomplete="tel" placeholder="Mobilnummer – du får SMS om hentingen" [style]="input"></div>
        } @else {
          <div><label for="contact" [style]="label">Kontaktperson</label><input id="contact" [value]="contact()" (input)="contact.set($any($event.target).value)" [style]="input"></div>
        }
      }
      @case (5) {
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Ser dette riktig ut?</div>
        <div style="border-radius:18px;border:1px solid var(--bd);background:var(--sf);padding:4px 16px">
          <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px"><span style="color:var(--mu)">Kategori</span><span style="font-weight:600;text-align:right;display:flex;align-items:center;gap:8px"><ra-icon [name]="category().icon" />{{ category().name }}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px"><span style="color:var(--mu)">Mengde</span><span style="font-weight:600;text-align:right">{{ qtyLabel() }} · {{ cond() }}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px"><span style="color:var(--mu)">Bilder</span><span style="font-weight:600;text-align:right">{{ photos().length }}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px"><span style="color:var(--mu)">Hentested</span><span style="font-weight:600;text-align:right">{{ address() }}, {{ postnr() }} {{ place.value()?.kommune ?? '' }}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd);font-size:14px"><span style="color:var(--mu)">Tid</span><span style="font-weight:600;text-align:right">{{ dayLabel() }} · {{ slot() }}</span></div>
          <div style="display:flex;justify-content:space-between;gap:12px;padding:12px 0;font-size:14px"><span style="color:var(--mu)">Kontakt</span><span style="font-weight:600;text-align:right">{{ contactSummary() }}</span></div>
        </div>
        <div style="font-size:13px;color:var(--mu)">Hentingen er gratis. Hentefirmaet som dekker {{ postnr() }} får beskjed nå og tar kontakt om tidspunkt.</div>
        <button (click)="submit()" [disabled]="busy()" style="height:54px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="check" />Meld henting</button>
      }
    }

    @if (step() > 1) {
      <div style="display:flex;gap:10px;margin-top:4px">
        <button (click)="step.set(step() - 1)" style="height:50px;padding:0 18px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Tilbake</button>
        @if (step() < 5) {
          <button (click)="next()" style="flex:1;height:50px;border:0;border-radius:14px;background:var(--tx);color:var(--bg);font-weight:800;font-size:15px">Neste</button>
        }
      </div>
    }
  `,
})
export class GiverNew {
  protected auth = inject(AuthStore);
  protected ref = inject(RefStore);
  private api = inject(PickupApi);
  private shell = inject(ShellStore);
  private router = inject(Router);
  protected label = LABEL;
  protected label8 = LABEL.replace('margin-bottom:6px', 'margin-bottom:8px');
  protected input = INPUT;
  protected units = UNITS;
  protected conds = CONDS;
  protected slots = SLOTS;
  protected days = dayChips();

  protected step = signal(1);
  protected cat = signal<string | null>(null);
  protected photos = signal<LocalPhoto[]>([]);
  protected desc = signal('');
  protected qty = signal('');
  protected unit = signal('stk');
  protected cond = signal('God');
  protected dims = signal('');
  protected address = signal('');
  protected postnr = signal((this.auth.isGuest() ? guestPostnr() : this.auth.user()?.postnr) ?? '');
  protected day = signal(this.days[1].v);
  protected slot = signal('09–12');
  protected unattended = signal(false);
  private user = this.auth.user();
  protected contact = signal(this.user ? [this.user.name, phone(this.user.phone)].filter(Boolean).join(' · ') : '');
  protected contactName = signal('');
  protected contactPhone = signal('');
  protected busy = signal(false);
  private key = 0;

  protected category = computed(() => this.ref.category(this.cat()));
  protected place = resource({ params: () => this.postnr(), loader: ({ params }) => this.ref.postnr(params) });
  protected qtyLabel = computed(() => qtyText(Number(this.qty().replace(',', '.')) || 0, this.unit()).replace(/^0 /, '– '));
  protected dayLabel = computed(() => this.days.find((d) => d.v === this.day())?.label ?? '');
  protected contactSummary = computed(() => (this.auth.isGuest() ? [this.contactName(), this.contactPhone()].filter(Boolean).join(' · ') : this.contact()));

  constructor() {
    this.ref.loadCategories();
    effect(() => this.shell.header('Meld henting', `Steg ${this.step()} av 5`));
    inject(DestroyRef).onDestroy(() => this.photos().forEach((p) => URL.revokeObjectURL(p.preview)));
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    if (q.get('cat')) {
      this.cat.set(q.get('cat'));
      this.step.set(2);
    }
    if (q.get('repeat')) this.prefillFromLast();
  }

  protected chip(on: boolean) {
    return `border:1.5px solid ${on ? 'var(--pri)' : 'var(--bd)'};background:${on ? 'var(--pri)' : 'var(--sf)'};color:${on ? 'var(--pri-tx)' : 'var(--tx)'}`;
  }

  protected setPostnr(el: HTMLInputElement) {
    el.value = el.value.replace(/\D/g, '').slice(0, 4);
    this.postnr.set(el.value);
  }

  protected pickCategory(id: string) {
    this.cat.set(id);
    this.step.set(2);
  }

  protected next() {
    const error = wizardError(this.step(), {
      qty: this.qty(), address: this.address(), postnr: this.postnr(), guest: this.auth.isGuest(), contactName: this.contactName(), contactPhone: this.contactPhone(),
    });
    if (error) return this.shell.toast(error);
    this.step.set(Math.min(5, this.step() + 1));
  }

  protected async addPhotos(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []).slice(0, 6 - this.photos().length);
    input.value = '';
    for (const file of files) {
      const photo: LocalPhoto = { key: ++this.key, preview: URL.createObjectURL(file), fileId: null };
      this.photos.update((list) => [...list, photo]);
      this.api.upload(file).then(
        (res) => this.photos.update((list) => list.map((p) => (p.key === photo.key ? { ...p, fileId: res.fileId } : p))),
        (e) => {
          this.removePhoto(photo.key);
          this.shell.toast(errorText(e));
        },
      );
    }
  }

  protected removePhoto(key: number) {
    const photo = this.photos().find((p) => p.key === key);
    if (photo) URL.revokeObjectURL(photo.preview);
    this.photos.update((list) => list.filter((p) => p.key !== key));
  }

  protected async submit() {
    if (!this.cat()) return this.step.set(1);
    if (this.photos().some((p) => !p.fileId)) return this.shell.toast('Venter på at bildene lastes opp …');
    const [name, tel] = this.auth.isGuest() ? [this.contactName(), this.contactPhone()] : this.contact().split('·').map((s) => s.trim());
    this.busy.set(true);
    try {
      const p = await this.api.create({
        categoryId: this.cat()!, desc: this.desc(), qty: Number(this.qty().replace(',', '.')), unit: this.unit(), cond: this.cond(), dims: this.dims(),
        address: this.address(), postnr: this.postnr(), day: this.day(), slot: this.slot(), unattended: this.unattended(),
        contact: name ?? '', phone: tel ?? '', photoIds: this.photos().map((ph) => ph.fileId!),
      });
      if (this.auth.isGuest()) localStorage.setItem('ra.postnr', this.postnr());
      await this.router.navigateByUrl('/p/' + p.id, { replaceUrl: true });
      this.shell.toast(p.companyName ? `Henting meldt – ${p.companyName} er varslet` : 'Registrert – vi varsler deg når noen dekker området');
    } catch (e) {
      this.shell.toast(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async prefillFromLast() {
    const last = (await this.api.list('mine'))[0];
    if (!last) return;
    this.cat.set(last.categoryId);
    this.desc.set(last.desc);
    this.qty.set(String(last.qty).replace('.', ','));
    this.unit.set(UNITS.includes(last.unit) ? last.unit : 'stk');
    this.cond.set(last.cond);
    this.dims.set(last.dims);
    this.address.set(last.address);
    this.postnr.set(last.postnr);
    this.unattended.set(last.unattended);
    this.contact.set([last.contact, phone(last.phone)].filter(Boolean).join(' · '));
    this.step.set(5);
  }
}
