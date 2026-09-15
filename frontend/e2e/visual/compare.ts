import { Page } from '@playwright/test';

export interface Rect { x: number; y: number; width: number; height: number }

/** Telefonrammens statuslinje, hjem-indikator og runde hjørner finnes bare i prototypen. */
export const FRAME_MASKS: Rect[] = [
  { x: 0, y: 0, width: 402, height: 54 },
  { x: 110, y: 850, width: 182, height: 24 },
  { x: 0, y: 830, width: 34, height: 44 },
  { x: 368, y: 830, width: 34, height: 44 },
];

/**
 * Pikselsammenligning i nettleseren (canvas), samme algoritme som pixelmatch (YIQ, terskel 0.1, antialiasing telles ikke).
 * Maskerte områder telles ikke. Returnerer andel avvikende piksler og et diff-bilde (rødt = avvik).
 */
export async function compare(page: Page, expected: Buffer, actual: Buffer, masks: Rect[]) {
  return page.evaluate(
    async ({ e, a, masks }) => {
      const bitmap = async (b64: string) => createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const [ie, ia] = await Promise.all([bitmap(e), bitmap(a)]);
      const w = ie.width, h = ie.height;
      if (ia.width !== w || ia.height !== h) return { ratio: 1, diff: -1, size: `${ia.width}×${ia.height} ≠ ${w}×${h}`, png: '' };
      const pixels = (img: ImageBitmap) => {
        const ctx = new OffscreenCanvas(w, h).getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pe = pixels(ie), pa = pixels(ia);
      const out = new ImageData(w, h);
      const inMask = new Uint8Array(w * h);
      for (const r of masks)
        for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(h, Math.ceil(r.y + r.height)); y++)
          for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(w, Math.ceil(r.x + r.width)); x++) inMask[y * w + x] = 1;
      const Y = (d: Uint8ClampedArray, k: number) => d[k] * 0.29889531 + d[k + 1] * 0.58662247 + d[k + 2] * 0.11448223;
      const I = (d: Uint8ClampedArray, k: number) => d[k] * 0.59597799 - d[k + 1] * 0.2741761 - d[k + 2] * 0.32180189;
      const Q = (d: Uint8ClampedArray, k: number) => d[k] * 0.21147017 - d[k + 1] * 0.52261711 + d[k + 2] * 0.31114694;
      const delta = (d1: Uint8ClampedArray, d2: Uint8ClampedArray, k: number, m: number) => {
        const y = Y(d1, k) - Y(d2, m), i = I(d1, k) - I(d2, m), q = Q(d1, k) - Q(d2, m);
        return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
      };
      const same = (d: Uint8ClampedArray, k: number, m: number) => d[k] === d[m] && d[k + 1] === d[m + 1] && d[k + 2] === d[m + 2];
      const manySiblings = (d: Uint8ClampedArray, x1: number, y1: number) => {
        let zeroes = x1 === 0 || x1 === w - 1 || y1 === 0 || y1 === h - 1 ? 1 : 0;
        for (let x = Math.max(x1 - 1, 0); x <= Math.min(x1 + 1, w - 1); x++)
          for (let y = Math.max(y1 - 1, 0); y <= Math.min(y1 + 1, h - 1); y++)
            if ((x !== x1 || y !== y1) && same(d, (y1 * w + x1) * 4, (y * w + x) * 4) && ++zeroes > 2) return true;
        return false;
      };
      // pixelmatch: en piksel er antialiasing hvis den ligger mellom en mørkere og en lysere nabo som selv er «flate».
      const antialiased = (d: Uint8ClampedArray, other: Uint8ClampedArray, x1: number, y1: number) => {
        let zeroes = x1 === 0 || x1 === w - 1 || y1 === 0 || y1 === h - 1 ? 1 : 0;
        let min = 0, max = 0, minX = 0, minY = 0, maxX = 0, maxY = 0;
        const k = (y1 * w + x1) * 4;
        for (let x = Math.max(x1 - 1, 0); x <= Math.min(x1 + 1, w - 1); x++)
          for (let y = Math.max(y1 - 1, 0); y <= Math.min(y1 + 1, h - 1); y++) {
            if (x === x1 && y === y1) continue;
            const dy = Y(d, k) - Y(d, (y * w + x) * 4);
            if (dy === 0) { if (++zeroes > 2) return false; }
            else if (dy < min) { min = dy; minX = x; minY = y; }
            else if (dy > max) { max = dy; maxX = x; maxY = y; }
          }
        if (min === 0 || max === 0) return false;
        return (manySiblings(d, minX, minY) && manySiblings(other, minX, minY)) || (manySiblings(d, maxX, maxY) && manySiblings(other, maxX, maxY));
      };
      const maxDelta = 35215 * 0.1 * 0.1;
      let diff = 0, total = 0;
      for (let p = 0; p < w * h; p++) {
        const i = p * 4;
        if (inMask[p]) { out.data.set([200, 200, 255, 255], i); continue; }
        total++;
        const x = p % w, y = (p - x) / w;
        if (delta(pe, pa, i, i) > maxDelta) {
          if (antialiased(pe, pa, x, y) || antialiased(pa, pe, x, y)) out.data.set([255, 200, 0, 255], i);
          else { diff++; out.data.set([255, 0, 0, 255], i); }
        } else { const g = 255 - (255 - Y(pa, i)) * 0.15; out.data.set([g, g, g, 255], i); }
      }
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.putImageData(out, 0, 0);
      const buf = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let k = 0; k < buf.length; k += 0x8000) bin += String.fromCharCode(...buf.subarray(k, k + 0x8000));
      return { ratio: diff / total, diff, size: `${w}×${h}`, png: btoa(bin) };
    },
    { e: expected.toString('base64'), a: actual.toString('base64'), masks },
  );
}
