// ILLUSTRATIVE DEMO DATA — NOT NASA MEASUREMENTS.
//
// A deterministic, physically-motivated synthetic field over the locked
// Ahmedabad AOI. It exists so every interaction in the explorer can be
// exercised before real NISAR granules are authenticated. The generator is
// seeded, so the same pixel always returns the same value. Every consumer of
// this module must label its output ILLUSTRATIVE.

import {
  AOI,
  AVAILABLE_GCOV,
  DEMO_INCIDENCE_DEG,
  DEMO_LOOKS,
  GRID,
  GUNW_PAIRS,
  LAKES,
  NISAR_L_BAND_WAVELENGTH_M,
  RIVERFRONT_LAT,
  SABARMATI_LINE,
  daysBetween,
} from "./config.js";
import { losMetersToPhase, losStdFromCoherence, wrapPhase } from "./math.js";

const { cols: COLS, rows: ROWS, dx: DX, dy: DY } = GRID;
export const N = COLS * ROWS;
const KM_LAT = 110.574;
const KM_LNG = 111.32 * Math.cos((AOI.center.lat * Math.PI) / 180);

export const cellCenter = (i) => {
  const r = Math.floor(i / COLS);
  const c = i - r * COLS;
  return { lng: AOI.west + (c + 0.5) * DX, lat: AOI.north - (r + 0.5) * DY, r, c };
};

export const cellIndexAt = (lng, lat) => {
  const c = Math.floor((lng - AOI.west) / DX);
  const r = Math.floor((AOI.north - lat) / DY);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
};

export const cellBounds = (i) => {
  const r = Math.floor(i / COLS);
  const c = i - r * COLS;
  const w = AOI.west + c * DX;
  const n = AOI.north - r * DY;
  return { west: w, east: w + DX, north: n, south: n - DY };
};

export const pixelId = (i) => `AHMD_${String(i).padStart(5, "0")}`;

// ---------- seeded noise ----------
function hash3(a, b, s) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash3(x0, y0, seed);
  const b = hash3(x0 + 1, y0, seed);
  const c = hash3(x0, y0 + 1, seed);
  const d = hash3(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x, y, seed, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

const gauss = (dKm, sigmaKm) => Math.exp(-(dKm * dKm) / (2 * sigmaKm * sigmaKm));
const distKm = (lng1, lat1, lng2, lat2) => Math.hypot((lng1 - lng2) * KM_LNG, (lat1 - lat2) * KM_LAT);

function riverInfo(lng, lat) {
  // Distance (km) to the centreline polyline and signed side (west < 0).
  let best = Infinity;
  let side = 0;
  for (let k = 0; k < SABARMATI_LINE.length - 1; k += 1) {
    const [x1, y1] = SABARMATI_LINE[k];
    const [x2, y2] = SABARMATI_LINE[k + 1];
    const ax = (lng - x1) * KM_LNG;
    const ay = (lat - y1) * KM_LAT;
    const bx = (x2 - x1) * KM_LNG;
    const by = (y2 - y1) * KM_LAT;
    const t = Math.max(0, Math.min(1, (ax * bx + ay * by) / (bx * bx + by * by)));
    const d = Math.hypot(ax - t * bx, ay - t * by);
    if (d < best) {
      best = d;
      // cross product sign: the centreline runs north→south (by < 0), so a
      // point to the west yields a negative cross (bx·ay − by·ax).
      side = bx * ay - by * ax < 0 ? -1 : 1;
    }
  }
  return { d: best, side };
}

// ---------- static fields ----------
let STATIC = null;

const SUBSIDENCE_BOWLS = [
  // Synthetic bowls. Placement is loosely inspired by the published
  // historical Sentinel-1 finding of localized subsidence in SW and SE
  // Ahmedabad (Pandit et al. 2025); amplitudes are invented for the demo.
  { lng: 72.515, lat: 22.985, sigma: 2.3, vUp: -36 },
  { lng: 72.635, lat: 22.972, sigma: 2.7, vUp: -28 },
  { lng: 72.664, lat: 23.062, sigma: 1.6, vUp: -12 },
];

const CONSTRUCTION = [
  { lng: 72.478, lat: 23.084, r: 0.9, onset: 3 },
  { lng: 72.664, lat: 23.112, r: 0.8, onset: 5 },
  { lng: 72.618, lat: 22.928, r: 0.7, onset: 7 },
  { lng: 72.505, lat: 23.135, r: 1.0, onset: 2 },
  { lng: 72.452, lat: 22.962, r: 0.6, onset: 9 },
];

export function getStatic() {
  if (STATIC) return STATIC;
  const urban = new Float32Array(N);
  const veg = new Float32Array(N);
  const riverDist = new Float32Array(N);
  const side = new Int8Array(N);
  const halfWidthBase = new Float32Array(N);
  const riverfront = new Uint8Array(N);
  const lake = new Float32Array(N); // lake radius scale or 0
  const pond = new Float32Array(N);
  const texture = new Float32Array(N);
  const invalid = new Uint8Array(N);
  const vUp = new Float32Array(N);
  const construction = new Int8Array(N).fill(-1);
  const component = new Uint8Array(N);

  for (let i = 0; i < N; i += 1) {
    const { lng, lat, r, c } = cellCenter(i);
    const ri = riverInfo(lng, lat);
    riverDist[i] = ri.d;
    side[i] = ri.side;
    const inFront = lat > RIVERFRONT_LAT.south && lat < RIVERFRONT_LAT.north;
    riverfront[i] = inFront ? 1 : 0;
    halfWidthBase[i] = inFront ? 0.19 : 0.13;

    const dCentre = distKm(lng, lat, 72.575, 23.035);
    const n1 = fbm(c / 9, r / 9, 11);
    let u = gauss(dCentre, 7.2) * 0.95 + (n1 - 0.5) * 0.45;
    // western suburbs extend further along SG Highway
    u += gauss(distKm(lng, lat, 72.505, 23.05), 4) * 0.35;
    u -= gauss(ri.d, 0.35) * 0.3;
    urban[i] = Math.max(0, Math.min(1, u));

    const n2 = fbm(c / 7, r / 7, 29);
    veg[i] = Math.max(0, Math.min(1, (1 - urban[i]) * (0.35 + n2 * 0.9) + gauss(ri.d, 1.1) * 0.35 * (1 - urban[i])));

    let lk = 0;
    for (const L of LAKES) {
      const d = distKm(lng, lat, L.lng, L.lat);
      if (d < L.r * 1.6) lk = Math.max(lk, 1 - d / (L.r * 1.6));
    }
    lake[i] = lk;
    pond[i] = (1 - urban[i]) * fbm(c / 5, r / 5, 53);
    texture[i] = fbm(c / 3, r / 3, 71) - 0.5;

    // layover/shadow-like invalid clusters (~1%)
    invalid[i] = fbm(c / 2.2, r / 2.2, 97) > 0.83 ? 1 : 0;

    let v = 0;
    for (const b of SUBSIDENCE_BOWLS) v += b.vUp * gauss(distKm(lng, lat, b.lng, b.lat), b.sigma);
    vUp[i] = v + (fbm(c / 6, r / 6, 113) - 0.5) * 4;

    for (let k = 0; k < CONSTRUCTION.length; k += 1) {
      const s = CONSTRUCTION[k];
      if (distKm(lng, lat, s.lng, s.lat) < s.r * (0.75 + fbm(c / 2, r / 2, 131 + k) * 0.5)) construction[i] = s.onset;
    }
    component[i] = ri.side < 0 ? 1 : 2;
  }
  STATIC = { urban, veg, riverDist, side, halfWidthBase, riverfront, lake, pond, texture, invalid, vUp, construction, component };
  return STATIC;
}

// Is the pixel open water at a given wetness (ground truth of the synthetic
// world, before radar noise and thresholding)?
function trueWater(s, i, m) {
  const halfWidth = s.riverfront[i] ? s.halfWidthBase[i] : s.halfWidthBase[i] + m * 0.38;
  if (s.riverDist[i] < halfWidth) return true;
  if (s.lake[i] > 0.38 - m * 0.18) return true;
  if (s.pond[i] > 0.74 - m * 0.13 && s.urban[i] < 0.35) return true;
  return false;
}

// ---------- GCOV ----------
const gcovCache = new Map();

export function dateIndex(iso) {
  return AVAILABLE_GCOV.findIndex((d) => d.date === iso);
}

// Returns { HH, HV } Float32Arrays of gamma-nought dB; NaN = invalid pixel.
export function getGcov(iso) {
  if (gcovCache.has(iso)) return gcovCache.get(iso);
  const k = dateIndex(iso);
  if (k < 0) return null;
  const meta = AVAILABLE_GCOV[k];
  const m = meta.wetness;
  const s = getStatic();
  const HH = new Float32Array(N);
  const HV = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const { r, c } = cellCenter(i);
    const randomInvalid = hash3(c, r, 900 + k) > 0.996;
    if (s.invalid[i] || randomInvalid) {
      HH[i] = NaN;
      HV[i] = NaN;
      continue;
    }
    const speckleHH = (hash3(c, r, 300 + k) - 0.5) * 3.0;
    const speckleHV = (hash3(c, r, 600 + k) - 0.5) * 3.0;
    if (trueWater(s, i, m)) {
      const wind = (hash3(Math.floor(c / 6), Math.floor(r / 6), 77 + k) - 0.5) * 2;
      HH[i] = -21.5 + wind + s.texture[i] * 2 + speckleHH;
      HV[i] = -28 + wind * 0.5 + speckleHV;
      continue;
    }
    const u = s.urban[i];
    let hh = -12.8 + 8.6 * u + s.texture[i] * 3 + 1.4 * m * (1 - u); // wet soil brightens
    let hv = hh - (5.5 + 3.5 * (1 - u)) + s.veg[i] * 2.2;
    // Vegetated lowland near the river: double-bounce hypothesis signal
    if (s.veg[i] > 0.55 && s.riverDist[i] < 1.6 && m > 0.6) {
      hh += 4.2 * (m - 0.45);
      hv += 0.6 * m;
    }
    if (s.construction[i] >= 0 && k >= s.construction[i]) {
      hh += 5.5;
      hv += 3.2;
    }
    HH[i] = hh + speckleHH;
    HV[i] = hv + speckleHV;
  }
  const out = { HH, HV, meta };
  gcovCache.set(iso, out);
  return out;
}

// ---------- GUNW ----------
const gunwCache = new Map();
const WAVELENGTH = NISAR_L_BAND_WAVELENGTH_M;
const LOS_UP = Math.cos((DEMO_INCIDENCE_DEG * Math.PI) / 180);

// Returns displacement fields for one pair. Units: mm. Sign convention for
// the demo: positive = range increase (motion away from the sensor).
export function getGunw(pairId) {
  if (gunwCache.has(pairId)) return gunwCache.get(pairId);
  const pair = GUNW_PAIRS.find((p) => p.id === pairId);
  if (!pair) return null;
  const s = getStatic();
  const k = pair.index;
  const mRef = AVAILABLE_GCOV.find((d) => d.date === pair.reference)?.wetness ?? 0;
  const mSec = AVAILABLE_GCOV.find((d) => d.date === pair.secondary)?.wetness ?? 0;
  const mAvg = (mRef + mSec) / 2;
  const losMm = new Float32Array(N); // corrected, before reference subtraction
  const ionoMm = new Float32Array(N); // ionospheric correction layer
  const coherence = new Float32Array(N);
  const decorrelated = new Uint8Array(N);
  const rampAx = (hash3(k, 1, 501) - 0.5) * 6; // mm across AOI
  const rampAy = (hash3(k, 2, 502) - 0.5) * 6;
  for (let i = 0; i < N; i += 1) {
    const { r, c } = cellCenter(i);
    const isWater = trueWater(s, i, Math.max(mRef, mSec));
    const u = s.urban[i];
    let g = isWater ? 0.06 + hash3(c, r, 700 + k) * 0.08 : 0.36 + 0.58 * u - 0.26 * mAvg * (1 - u) + (hash3(c, r, 800 + k) - 0.5) * 0.16;
    if (pair.days > 12) g *= 0.88;
    if (s.construction[i] >= 0 && s.construction[i] > k && s.construction[i] <= k + 1) g *= 0.4;
    g = Math.max(0.02, Math.min(0.98, g));
    coherence[i] = g;
    if (isWater || s.invalid[i]) {
      decorrelated[i] = 1;
      losMm[i] = NaN;
      ionoMm[i] = NaN;
      continue;
    }
    const deform = (-s.vUp[i] * LOS_UP * pair.days) / 365; // away from sensor when sinking
    const tropo = (fbm(c / 32, r / 32, 1000 + k) - 0.5) * 2.4;
    const iono = rampAx * (c / COLS - 0.5) + rampAy * (r / ROWS - 0.5);
    const sigma = losStdFromCoherence(g, DEMO_LOOKS, WAVELENGTH) * 1000;
    const noise = (hash3(c, r, 1200 + k) + hash3(c, r, 1300 + k) + hash3(c, r, 1400 + k) - 1.5) * 2 * sigma;
    losMm[i] = deform + tropo + noise; // what remains after iono is removed
    ionoMm[i] = iono;
  }
  const out = { pair, losMm, ionoMm, coherence, decorrelated };
  gunwCache.set(pairId, out);
  return out;
}

export function rawPhaseRad(losMm, ionoMm) {
  const total = (losMm + ionoMm) / 1000;
  return losMetersToPhase(total, WAVELENGTH);
}

export function wrappedPhaseRad(losMm, ionoMm) {
  return wrapPhase(rawPhaseRad(losMm, ionoMm));
}

export const GUNW_WAVELENGTH = WAVELENGTH;
export const GUNW_LOS_UP = LOS_UP;
export { COLS, ROWS, DX, DY };

// Cumulative displacement series per pixel at every chained date: the input
// to the weighted velocity estimate. Returns { dates, days, values, weights }.
export function cumulativeSeries(i, applyIono, refIndexByComponent) {
  const s = getStatic();
  const comp = s.component[i];
  const ref = refIndexByComponent?.[comp];
  const dates = [GUNW_PAIRS[0].reference];
  const days = [0];
  const values = [0];
  const weights = [1];
  let acc = 0;
  let broken = false;
  for (const p of GUNW_PAIRS) {
    const g = getGunw(p.id);
    let v = g.losMm[i] + (applyIono ? 0 : g.ionoMm[i]);
    if (ref != null && ref >= 0) {
      const rv = g.losMm[ref] + (applyIono ? 0 : g.ionoMm[ref]);
      v -= rv;
    }
    if (!Number.isFinite(v)) broken = true;
    acc += v;
    dates.push(p.secondary);
    days.push(daysBetween(GUNW_PAIRS[0].reference, p.secondary));
    values.push(broken ? NaN : acc);
    weights.push(g.coherence[i] ** 2);
  }
  return { dates, days, values, weights };
}
