import { ChangeDetectionStrategy, Component, ElementRef, inject, input, OnDestroy, signal, viewChild, AfterViewInit } from '@angular/core';
import { ShellStore } from '../shell/shell.store';

/** Skann QR på merkelappen: BarcodeDetector (Chrome/Android), ellers @zxing/browser (iOS Safari). Kameraet stoppes når arket lukkes. */
@Component({
  selector: 'ra-qr-scanner-sheet',
  host: { style: 'display:contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Skann merkelapp</div>
    <div style="font-size:13px;color:var(--mu);margin-top:-10px">Hold QR-koden på merkelappen inne i rammen.</div>
    <div style="position:relative;aspect-ratio:1;border-radius:18px;overflow:hidden;background:#000">
      <video #video playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;inset:18%;border:3px solid #B7E39B;border-radius:18px"></div>
    </div>
    @if (error()) {
      <div style="font-size:13px;color:var(--dan)">{{ error() }}</div>
    }
    <button (click)="shell.closeSheet()" style="height:48px;border-radius:14px;border:1px solid var(--bd);background:var(--sf);font-weight:700">Avbryt</button>
  `,
})
export class QrScannerSheet implements AfterViewInit, OnDestroy {
  protected shell = inject(ShellStore);
  readonly onResult = input.required<(text: string) => void>();
  private video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  protected error = signal('');
  private stream?: MediaStream;
  private stopped = false;
  private stopZxing?: () => void;

  async ngAfterViewInit() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = this.video().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (Detector) {
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (this.stopped) return;
          const codes = await detector.detect(video).catch(() => []);
          if (codes[0]) return this.done(codes[0].rawValue);
          setTimeout(tick, 250);
        };
        tick();
      } else {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const controls = await new BrowserQRCodeReader().decodeFromVideoElement(video, (result) => result && this.done(result.getText()));
        this.stopZxing = () => controls.stop();
      }
    } catch {
      this.error.set('Fikk ikke tilgang til kameraet. Sjekk tillatelsen i nettleseren.');
    }
  }

  private done(text: string) {
    if (this.stopped) return;
    this.onResult()(text);
    this.shell.closeSheet();
  }

  ngOnDestroy() {
    this.stopped = true;
    this.stopZxing?.();
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

/** Ordre-id fra QR-innhold: ".../p/R-2041" → "R-2041" */
export function pickupIdFromQr(text: string): string | null {
  return /\/p\/(R-[\w-]+)/.exec(text)?.[1] ?? (/^R-[\w-]+$/.test(text.trim()) ? text.trim() : null);
}
