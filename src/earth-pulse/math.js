// Earth Pulse — the mathematics from the master plan, sections 8–10, as pure
// functions. Missing values are always NaN (never 0): zero is a physical
// measurement, missing means unknown.

export const isValid = (v) => typeof v === "number" && Number.isFinite(v);

// 8.1  B_dB = 10 log10(p), defined only for positive, finite diagonal power.
export function powerToDb(p) {
  if (!isValid(p) || p <= 0) return NaN;
  return 10 * Math.log10(p);
}

export function dbToPower(db) {
  if (!isValid(db)) return NaN;
  return 10 ** (db / 10);
}

// ΔB = 10 log10(p2 / p1)
export function deltaDb(p1, p2) {
  if (!isValid(p1) || !isValid(p2) || p1 <= 0 || p2 <= 0) return NaN;
  return 10 * Math.log10(p2 / p1);
}

// 8.2  Ŵ_t(x) = 1{B_t(x) < τ} · M_valid. Returns 1, 0, or NaN (unknown).
export function waterCandidate(db, tau) {
  if (!isValid(db)) return NaN;
  return db < tau ? 1 : 0;
}

// 8.3  Set-theoretic change classes for two aligned masks within valid V.
export const CHANGE = Object.freeze({
  NEITHER: 0,
  PERSISTENT: 1,
  LOST: 2, // water on date 1 only
  NEW: 3, // water on date 2 only
  UNKNOWN: 4,
});

export function changeClass(w1, w2) {
  if (!isValid(w1) || !isValid(w2)) return CHANGE.UNKNOWN;
  if (w1 === 1 && w2 === 1) return CHANGE.PERSISTENT;
  if (w1 === 1 && w2 === 0) return CHANGE.LOST;
  if (w1 === 0 && w2 === 1) return CHANGE.NEW;
  return CHANGE.NEITHER;
}

// Pixel area on a lat/lng grid, in km², using the local metric scale (never
// degrees²). Equivalent to a projected-grid area for cells this small.
export function cellAreaKm2(lat, dxDeg, dyDeg) {
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  return dxDeg * kmPerDegLng * dyDeg * kmPerDegLat;
}

// 8.4  P_W(x) = Σ M_valid Ŵ / Σ M_valid — fraction of valid dates as water.
export function waterPersistence(candidates) {
  let valid = 0;
  let water = 0;
  for (const w of candidates) {
    if (!isValid(w)) continue;
    valid += 1;
    water += w;
  }
  return valid === 0 ? NaN : water / valid;
}

// 8.6  δA ≲ L ε + π ε²  (geometric buffer bound, not a confidence interval)
export function boundaryAreaUncertainty(lengthM, epsM) {
  if (!isValid(lengthM) || !isValid(epsM) || lengthM < 0 || epsM < 0) return NaN;
  return lengthM * epsM + Math.PI * epsM * epsM;
}

// 9.1  d_LOS = (λ / 4π) Δφ  (sign convention must be read from metadata)
export function phaseToLosMeters(phaseRad, wavelengthM) {
  if (!isValid(phaseRad) || !isValid(wavelengthM)) return NaN;
  return (wavelengthM / (4 * Math.PI)) * phaseRad;
}

export function losMetersToPhase(dM, wavelengthM) {
  if (!isValid(dM) || !isValid(wavelengthM)) return NaN;
  return (4 * Math.PI * dM) / wavelengthM;
}

// 9.3  Wrap phase to (−π, π].
export function wrapPhase(phi) {
  if (!isValid(phi)) return NaN;
  const twoPi = 2 * Math.PI;
  let w = ((phi + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (w === -Math.PI) w = Math.PI;
  return w;
}

// 9.4  Vertical-only assumption: d_U = d_LOS / l_U. Labeled, never default.
export function verticalFromLos(dLos, incidenceDeg) {
  if (!isValid(dLos) || !isValid(incidenceDeg)) return NaN;
  const lu = Math.cos((incidenceDeg * Math.PI) / 180);
  return lu === 0 ? NaN : dLos / lu;
}

// 9.6  Var(φ) ≈ (1 − γ²) / (2 L γ²);  σ_d ≈ (λ / 4π) σ_φ
export function phaseStdFromCoherence(gamma, looks) {
  if (!isValid(gamma) || gamma <= 0 || gamma > 1 || !isValid(looks) || looks <= 0) return NaN;
  return Math.sqrt((1 - gamma * gamma) / (2 * looks * gamma * gamma));
}

export function losStdFromCoherence(gamma, looks, wavelengthM) {
  const s = phaseStdFromCoherence(gamma, looks);
  return isValid(s) ? (wavelengthM / (4 * Math.PI)) * s : NaN;
}

// 9.5  Weighted least-squares slope
//   v̂ = Σ w (t − t̄_w)(d − d̄_w) / Σ w (t − t̄_w)²
// Requires at least three dated observations (two intervals). One pair can
// never produce a rate: integrity rule 4.
export function weightedVelocity(times, values, weights) {
  const pts = [];
  for (let i = 0; i < times.length; i += 1) {
    if (isValid(times[i]) && isValid(values[i]) && isValid(weights[i]) && weights[i] > 0) {
      pts.push([times[i], values[i], weights[i]]);
    }
  }
  if (pts.length < 3) {
    return { slope: NaN, r2: NaN, n: pts.length, reason: "At least two intervals (three dates) are required; a single pair cannot establish a rate." };
  }
  let sw = 0;
  let st = 0;
  let sd = 0;
  for (const [t, d, w] of pts) {
    sw += w;
    st += w * t;
    sd += w * d;
  }
  const tBar = st / sw;
  const dBar = sd / sw;
  let num = 0;
  let den = 0;
  for (const [t, d, w] of pts) {
    num += w * (t - tBar) * (d - dBar);
    den += w * (t - tBar) ** 2;
  }
  if (den === 0) return { slope: NaN, r2: NaN, n: pts.length, reason: "All observations share one date." };
  const slope = num / den;
  const intercept = dBar - slope * tBar;
  let ssRes = 0;
  let ssTot = 0;
  for (const [t, d, w] of pts) {
    ssRes += w * (d - (intercept + slope * t)) ** 2;
    ssTot += w * (d - dBar) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2, n: pts.length, reason: null };
}

// 3×3 boxcar speckle filter applied in the linear power domain.
export function boxcarDb(db, cols, rows) {
  const out = new Float32Array(db.length);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!isValid(db[i])) {
        out[i] = NaN;
        continue;
      }
      let sum = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -1; dc <= 1; dc += 1) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols) continue;
          const v = db[rr * cols + cc];
          if (!isValid(v)) continue;
          sum += 10 ** (v / 10);
          n += 1;
        }
      }
      out[i] = n ? 10 * Math.log10(sum / n) : NaN;
    }
  }
  return out;
}

export const fmt = (v, digits = 1, unit = "") => (isValid(v) ? `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}` : "No data");
export const fmtSigned = (v, digits = 1, unit = "") =>
  isValid(v) ? `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}${unit ? ` ${unit}` : ""}` : "No data";
