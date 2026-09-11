/**
 * Weibull survival model.
 *
 * The failure probability of an asset that has run t days since its last
 * overhaul is  P_f(t) = 1 - exp(-(t / eta)^beta).
 *
 * Shape (beta) and scale (eta) are fitted per asset class from the historical
 * failure register by maximum likelihood, supporting right-censored records
 * (assets that have not failed yet). The fit is a plain Newton iteration on
 * the profile likelihood for beta — no external library.
 */

/** Cumulative failure probability. */
export function weibullCdf(t, beta, eta) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-Math.pow(t / eta, beta));
}

/** Hazard rate h(t) = (beta/eta) (t/eta)^(beta-1). */
export function weibullHazard(t, beta, eta) {
  if (t <= 0) return 0;
  return (beta / eta) * Math.pow(t / eta, beta - 1);
}

/**
 * Conditional probability of failing in the next `window` days given survival
 * up to `t` — the quantity that matters when deciding how long a task can wait.
 */
export function conditionalFailure(t, window, beta, eta) {
  const sT = Math.exp(-Math.pow(t / eta, beta));
  const sTw = Math.exp(-Math.pow((t + window) / eta, beta));
  if (sT <= 0) return 1;
  return 1 - sTw / sT;
}

/**
 * Fit (beta, eta) by MLE.
 * @param {Array<{t:number, failed:boolean}>} records  t = age in days at
 *        failure (failed=true) or at census (failed=false).
 */
export function fitWeibull(records, { maxIter = 60, tol = 1e-7 } = {}) {
  const data = records.filter((r) => r.t > 0);
  const n = data.length;
  const r = data.filter((d) => d.failed).length;
  if (n === 0 || r === 0) return { beta: 1.5, eta: 1000, n, failures: r, converged: false, logLik: NaN };

  const ts = data.map((d) => d.t);
  const lnT = ts.map((t) => Math.log(t));
  const sumLnTfail = data.reduce((s, d) => s + (d.failed ? Math.log(d.t) : 0), 0);

  // Profile likelihood equation for beta:
  //   g(b) = sum(t^b ln t)/sum(t^b) - 1/b - (1/r) sum_fail(ln t) = 0
  const g = (b) => {
    let a = 0;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const tb = Math.pow(ts[i], b);
      a += tb * lnT[i];
      c += tb;
    }
    return a / c - 1 / b - sumLnTfail / r;
  };
  const dg = (b) => {
    let a = 0;
    let c = 0;
    let e = 0;
    for (let i = 0; i < n; i++) {
      const tb = Math.pow(ts[i], b);
      a += tb * lnT[i];
      c += tb;
      e += tb * lnT[i] * lnT[i];
    }
    return e / c - (a / c) * (a / c) + 1 / (b * b);
  };

  let beta = 1.5;
  let converged = false;
  for (let i = 0; i < maxIter; i++) {
    const step = g(beta) / dg(beta);
    let next = beta - step;
    if (!Number.isFinite(next) || next <= 0.05) next = beta / 2;
    if (next > 20) next = 20;
    if (Math.abs(next - beta) < tol) {
      beta = next;
      converged = true;
      break;
    }
    beta = next;
  }
  const sumTb = ts.reduce((s, t) => s + Math.pow(t, beta), 0);
  const eta = Math.pow(sumTb / r, 1 / beta);

  let logLik = 0;
  for (const d of data) {
    const z = Math.pow(d.t / eta, beta);
    if (d.failed) logLik += Math.log(beta / eta) + (beta - 1) * Math.log(d.t / eta) - z;
    else logLik += -z;
  }
  return { beta, eta, n, failures: r, converged, logLik };
}

/** Characteristic life and B10 life (age at which 10 % have failed). */
export function weibullSummary(beta, eta) {
  const b10 = eta * Math.pow(-Math.log(0.9), 1 / beta);
  const median = eta * Math.pow(Math.log(2), 1 / beta);
  return { beta, eta, b10Days: b10, medianDays: median, wearOut: beta > 1 };
}
