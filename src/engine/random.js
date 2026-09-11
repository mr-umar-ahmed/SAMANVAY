/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Every synthetic dataset and every stochastic search in SAMANVAY is seeded so
 * that a demo run is reproducible: the same seed always yields the same
 * corridor registers, the same timetable and the same optimised plan.
 */
export function createRng(seed = 26027) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Uniform float in [0, 1). */
    next,
    /** Uniform float in [min, max). */
    range: (min, max) => min + (max - min) * next(),
    /** Uniform integer in [min, max] inclusive. */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** Pick one element of an array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Bernoulli trial. */
    chance: (p) => next() < p,
    /** Standard normal via Box-Muller. */
    normal: (mean = 0, sd = 1) => {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    },
    /** Weibull sample with shape beta and scale eta (inverse CDF). */
    weibull: (beta, eta) => eta * Math.pow(-Math.log(1 - next()), 1 / beta),
    /** Fisher-Yates shuffle (returns a new array). */
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  };
}
