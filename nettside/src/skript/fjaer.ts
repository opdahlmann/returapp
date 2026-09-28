// Fjær (spring) med Apples to parametre: dempingsforhold (1 = ingen oversving) og respons i sekunder.
// Alltid avbrytbar: nytt mål midt i bevegelsen beholder farten, så det aldri blir noe «hopp» eller «murvegg».
export class Fjaer {
  value: number;
  velocity = 0;
  target: number;
  private stiffness: number;
  private damping: number;
  private frame = 0;
  private sist = 0;
  constructor(start: number, { damping = 1, response = 0.4 }: { damping?: number; response?: number } = {}, private onUpdate: (v: number) => void = () => {}, private onSettle: () => void = () => {}) {
    this.value = start;
    this.target = start;
    const w = (2 * Math.PI) / response;
    this.stiffness = w * w;
    this.damping = 2 * damping * w;
  }
  /** Hopp rett til en verdi (under et drag). */
  set(v: number) { this.stop(); this.value = v; this.target = v; this.velocity = 0; this.onUpdate(v); }
  /** Nytt mål, valgfritt med startfart i enheter per sekund (fingerens fart ved slipp). */
  to(target: number, velocity = this.velocity) {
    this.target = target;
    this.velocity = velocity;
    if (!this.frame) { this.sist = performance.now(); this.frame = requestAnimationFrame(this.tick); }
  }
  stop() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; }
  get running() { return this.frame !== 0; }
  private tick = (t: number) => {
    let dt = Math.min((t - this.sist) / 1000, 0.064);
    this.sist = t;
    // Semi-implisitt Euler i små steg, stabilt også når en fane har stått i bakgrunnen.
    while (dt > 0) {
      const h = Math.min(dt, 1 / 120);
      const a = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    if (Math.abs(this.velocity) < 0.5 && Math.abs(this.value - this.target) < 0.1) {
      this.value = this.target; this.velocity = 0; this.frame = 0;
      this.onUpdate(this.value); this.onSettle();
      return;
    }
    this.onUpdate(this.value);
    this.frame = requestAnimationFrame(this.tick);
  };
}

/** Hvor et kast ender (Apples projeksjon fra Designing Fluid Interfaces). v i px/s. */
export const projiser = (v: number, d = 0.998) => (v / 1000) * d / (1 - d);

/** Gummistrikk forbi en kant: jo lenger forbi, desto mindre følger flaten med. */
export const strikk = (overskudd: number, dimensjon: number, c = 0.55) => (overskudd * dimensjon * c) / (dimensjon + c * Math.abs(overskudd));

/** Fart fra de siste pekerhendelsene (px/s), så slippet arver fingerens fart. */
export class Fartsmaaler {
  private p: [number, number][] = [];
  add(x: number, t = performance.now()) { this.p.push([x, t]); if (this.p.length > 6) this.p.shift(); }
  reset() { this.p = []; }
  get velocity() {
    const n = this.p.length;
    if (n < 2) return 0;
    const [x0, t0] = this.p[0]!, [x1, t1] = this.p[n - 1]!;
    return t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
  }
}

export const reduserBevegelse = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
