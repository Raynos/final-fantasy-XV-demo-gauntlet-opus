/** Deterministic, fast PRNG (mulberry32). Every system must use a seeded RNG
 *  so screenshots are reproducible between runs and between agents. */
export class Rng {
  s!: number;
  constructor(seed = 1337) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick(arr: any) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  /** Normally distributed (Box-Muller). */
  gauss(mu = 0, sigma = 1) {
    const u = Math.max(1e-7, this.next()), v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Uniform point on a disc of `r`. */
  disc(r = 1) {
    const a = this.next() * Math.PI * 2, d = Math.sqrt(this.next()) * r;
    return [Math.cos(a) * d, Math.sin(a) * d];
  }
}
