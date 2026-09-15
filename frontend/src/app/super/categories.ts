import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorText } from '../core/format';
import { Category, RefStore } from '../core/ref.store';
import { ShellStore } from '../shell/shell.store';
import { Icon } from '../ui/icon';
import { CATEGORY_ICONS } from '../ui/icons';

@Component({
  selector: 'ra-categories',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:14px;color:var(--mu)">Rekkefølgen her er rekkefølgen giver ser. Trykk for å endre navn eller ikon.</div>
    @for (c of ref.categories(); track c.id; let i = $index, first = $first, last = $last) {
      <div style="display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;border:1px solid var(--bd);background:var(--sf)">
        <button (click)="edit(c)" style="flex:1;display:flex;gap:12px;align-items:center;text-align:left;border:0;background:none;padding:0;min-width:0"><span style="width:38px;height:38px;border-radius:11px;background:var(--tint);color:var(--tint-tx);display:flex;align-items:center;justify-content:center"><ra-icon [name]="c.icon" [size]="26" /></span><span style="font-weight:700">{{ c.name }}</span></button>
        <div style="display:flex;flex-direction:column;gap:4px"><button (click)="move(i, -1)" [disabled]="first" [attr.aria-label]="'Flytt ' + c.name + ' opp'" style="width:32px;height:24px;border-radius:8px;border:1px solid var(--bd);background:var(--sf2);display:flex;align-items:center;justify-content:center;padding:0"><ra-icon name="up" /></button><button (click)="move(i, 1)" [disabled]="last" [attr.aria-label]="'Flytt ' + c.name + ' ned'" style="width:32px;height:24px;border-radius:8px;border:1px solid var(--bd);background:var(--sf2);display:flex;align-items:center;justify-content:center;padding:0"><ra-icon name="down" /></button></div>
      </div>
    }
    <button (click)="create()" style="height:50px;border-radius:14px;border:1.5px dashed var(--pri);background:var(--tint);color:var(--tint-tx);font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px"><ra-icon name="plus" />Ny kategori</button>
  `,
})
export class Categories {
  protected ref = inject(RefStore);
  private http = inject(HttpClient);
  private shell = inject(ShellStore);

  constructor() {
    this.ref.loadCategories(true);
  }

  protected async move(i: number, dir: number) {
    const list = [...this.ref.categories()];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.ref.categories.set(list);
    try {
      this.ref.categories.set(await firstValueFrom(this.http.put<Category[]>('/api/categories/order', { ids: list.map((c) => c.id) })));
    } catch (e) {
      this.shell.toast(errorText(e));
      this.ref.loadCategories(true);
    }
  }

  protected edit(c: Category) {
    this.shell.openSheet(CategorySheet, { category: c });
  }

  protected create() {
    this.shell.openSheet(CategorySheet);
  }
}

@Component({
  selector: 'ra-category-sheet',
  imports: [Icon],
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">{{ category() ? 'Endre kategori' : 'Ny kategori' }}</div>
    <input [value]="name()" (input)="name.set($any($event.target).value)" aria-label="Navn" [placeholder]="category() ? 'Navn' : 'Navn, f.eks. Stein og betong'" style="height:50px;border-radius:14px;border:1px solid var(--bd);background:var(--bg);padding:0 14px;font-size:16px;font-weight:700;outline:none;width:100%">
    <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">
      @for (id of icons; track id) {
        <button (click)="icon.set(id)" [attr.aria-label]="'Ikon ' + id" [attr.aria-pressed]="icon() === id" [style.border-color]="icon() === id ? 'var(--pri)' : 'var(--bd)'" [style.background]="icon() === id ? 'var(--tint)' : 'var(--sf)'" style="aspect-ratio:1;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--pri);border:1.5px solid var(--bd)"><ra-icon [name]="id" /></button>
      }
    </div>
    <button (click)="save()" style="height:52px;border:0;border-radius:14px;background:var(--pri);color:var(--pri-tx);font-weight:800;font-size:16px">{{ category() ? 'Lagre' : 'Legg til' }}</button>
  `,
})
export class CategorySheet {
  private http = inject(HttpClient);
  private ref = inject(RefStore);
  private shell = inject(ShellStore);
  readonly category = input<Category>();
  protected icons = CATEGORY_ICONS;
  protected name = signal('');
  protected icon = signal('annet');

  ngOnInit() {
    this.name.set(this.category()?.name ?? '');
    this.icon.set(this.category()?.icon ?? 'annet');
  }

  protected async save() {
    if (this.name().trim().length < 2) return this.shell.toast('Skriv inn et navn');
    const c = this.category();
    try {
      if (c) await firstValueFrom(this.http.patch(`/api/categories/${c.id}`, { name: this.name(), icon: this.icon() }));
      else await firstValueFrom(this.http.post('/api/categories', { name: this.name(), icon: this.icon() }));
      await this.ref.loadCategories(true);
      this.shell.closeSheet();
      this.shell.toast(c ? 'Kategori oppdatert' : 'Kategori lagt til');
    } catch (e) {
      this.shell.toast(errorText(e));
    }
  }
}
