import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

/** Bilde fra /api/photos/{id}. Hentes med token (img-src kan ikke sende Authorization) og vises som object-URL. */
@Component({
  selector: 'ra-photo',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (url()) {
    <img [src]="url()" [alt]="alt()" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit" />
  }`,
})
export class PhotoImg {
  private http = inject(HttpClient);
  readonly id = input.required<string>();
  readonly alt = input('Bilde');
  protected url = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      let objectUrl: string | null = null;
      const sub = this.http.get(`/api/photos/${this.id()}`, { responseType: 'blob' }).subscribe({
        next: (blob) => this.url.set((objectUrl = URL.createObjectURL(blob))),
        error: () => this.url.set(null),
      });
      onCleanup(() => {
        sub.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
