// Turns module parameters into a renderable, inspectable layer:
//   { kind, values, classes, colorAt(i) -> [r,g,b,a] | null, unknown(i), legend, stats }
// Rendering produces a nearest-neighbour canvas that MapLibre drapes over the
// AOI as an image source.

import { AVAILABLE_GCOV, GRID, GUNW_PAIRS, daysBetween } from "./config.js";
import {
  CHANGE,
  boxcarDb,
  cellAreaKm2,
  changeClass,
  isValid,
  waterCandidate,
  waterPersistence,
  weightedVelocity,
} from "./math.js";
import { N, cellCenter, cumulativeSeries, getGcov, getGunw, getStatic } from "./synthetic.js";

const { cols: COLS, rows: ROWS, dx: DX, dy: DY } = GRID;

export const DEFAULT_PARAMS = {
  dateA: "2026-06-17",
  dateB: "2026-07-23",
  pol: "HH",
  tau: -17,
  speckle: false,
  fgView: "water",
  rmSwipe: false,
  swipeContent: "water",
  gzPair: "pair-3",
  gzStat: "pair",
  cohMin: 0.3,
  consMin: 0.5,
  r2Min: 0.3,
  applyIono: true,
  refs: null, // { 1: cellIndex, 2: cellIndex }
  scThresh: 3,
  opacity: 0.85,
};

const hex = (h) => {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (stops, t) => {
  const x = Math.max(0, Math.min(1, t));
  for (let k = 0; k < stops.length - 1; k += 1) {
    const [p0, c0] = stops[k];
    const [p1, c1] = stops[k + 1];
    if (x <= p1) {
      const u = (x - p0) / (p1 - p0 || 1);
      return [lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), lerp(c0[2], c1[2], u)];
    }
  }
  return stops[stops.length - 1][1];
};

export const COLORS = {
  water: hex("#36A9D6"),
  vegflood: hex("#E7A34D"),
  losNeg: hex("#7B4CA8"),
  losZero: hex("#EEF4F7"),
  losPos: hex("#3DB8A5"),
  unknown: hex("#3A3A3A"),
  lost: hex("#5B8DB8"),
  newWater: hex("#E7A34D"),
  neither: hex("#1A2D40"),
  brighten: hex("#E4627A"),
  darken: hex("#5B8DB8"),
};

const LOS_STOPS = [
  [0, COLORS.losNeg],
  [0.5, COLORS.losZero],
  [1, COLORS.losPos],
];
const SC_STOPS = [
  [0, COLORS.darken],
  [0.5, [238, 244, 247]],
  [1, COLORS.brighten],
];

export const CHANGE_LEGEND = [
  { cls: CHANGE.PERSISTENT, color: "#36A9D6", label: "Persistent candidate water" },
  { cls: CHANGE.LOST, color: "#5B8DB8", label: "Water on date A only" },
  { cls: CHANGE.NEW, color: "#E7A34D", label: "Water on date B only" },
  { cls: CHANGE.NEITHER, color: "#1A2D40", label: "Neither date, land (left clear)" },
  { cls: CHANGE.UNKNOWN, color: "#3A3A3A", label: "Unknown or invalid", hatch: true },
];

// ---------- cached building blocks ----------
const dbCache = new Map();
export function gcovDb(date, pol, speckle) {
  const key = `${date}|${pol}|${speckle ? 1 : 0}`;
  if (dbCache.has(key)) return dbCache.get(key);
  const g = getGcov(date);
  if (!g) return null;
  const raw = g[pol];
  const out = speckle ? boxcarDb(raw, COLS, ROWS) : raw;
  dbCache.set(key, out);
  return out;
}

const cellArea = new Float32Array(N);
for (let i = 0; i < N; i += 1) cellArea[i] = cellAreaKm2(cellCenter(i).lat, DX, DY);
export const CELL_AREA = cellArea;

export function waterMask(date, tau, speckle, pol = "HH") {
  const db = gcovDb(date, pol, speckle);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) out[i] = waterCandidate(db[i], tau);
  return out;
}

export function waterAreaSeries(tau, speckle) {
  return AVAILABLE_GCOV.map((d) => {
    const w = waterMask(d.date, tau, speckle);
    let area = 0;
    let valid = 0;
    for (let i = 0; i < N; i += 1) {
      if (!isValid(w[i])) continue;
      valid += 1;
      if (w[i] === 1) area += cellArea[i];
    }
    return { date: d.date, maturity: d.maturity, areaKm2: area, validFraction: valid / N };
  });
}

export function defaultRefs() {
  // Stable urban reference pixels on each bank (component 1 = west, 2 = east).
  const pick = (lng, lat) => {
    const c = Math.floor((lng - 72.42) / DX);
    const r = Math.floor((23.19 - lat) / DY);
    return r * COLS + c;
  };
  return { 1: pick(72.555, 23.045), 2: pick(72.6, 23.05) };
}

// GUNW temporal consistency: fraction of pairs with coherence ≥ 0.3
let consistencyCache = null;
export function temporalConsistency() {
  if (consistencyCache) return consistencyCache;
  const out = new Float32Array(N);
  const meanCoh = new Float32Array(N);
  for (const p of GUNW_PAIRS) {
    const g = getGunw(p.id);
    for (let i = 0; i < N; i += 1) {
      if (g.coherence[i] >= 0.3 && !g.decorrelated[i]) out[i] += 1;
      meanCoh[i] += g.coherence[i];
    }
  }
  for (let i = 0; i < N; i += 1) {
    out[i] /= GUNW_PAIRS.length;
    meanCoh[i] /= GUNW_PAIRS.length;
  }
  consistencyCache = { consistency: out, meanCoh };
  return consistencyCache;
}

const velocityCache = new Map();
export function velocityField(applyIono, refs) {
  const key = `${applyIono}|${refs[1]}|${refs[2]}`;
  if (velocityCache.has(key)) return velocityCache.get(key);
  const v = new Float32Array(N);
  const r2 = new Float32Array(N);
  const nObs = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) {
    const s = cumulativeSeries(i, applyIono, refs);
    const fit = weightedVelocity(s.days, s.values, s.weights);
    v[i] = isValid(fit.slope) ? fit.slope * 365 : NaN;
    r2[i] = fit.r2;
    nObs[i] = fit.n;
  }
  const out = { v, r2, nObs };
  velocityCache.set(key, out);
  return out;
}

// Displacement of one pair relative to the reference pixel of the same
// connected component. Pixels whose component reference is invalid are NaN.
export function pairRelative(pairId, applyIono, refs) {
  const g = getGunw(pairId);
  const s = getStatic();
  const out = new Float32Array(N);
  const refVal = {};
  for (const comp of [1, 2]) {
    const ri = refs[comp];
    refVal[comp] = ri >= 0 ? g.losMm[ri] + (applyIono ? 0 : g.ionoMm[ri]) : NaN;
  }
  for (let i = 0; i < N; i += 1) {
    const val = g.losMm[i] + (applyIono ? 0 : g.ionoMm[i]);
    out[i] = val - refVal[s.component[i]];
  }
  return out;
}

export function cumulativeRelative(applyIono, refs) {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    const s = cumulativeSeries(i, applyIono, refs);
    out[i] = s.values[s.values.length - 1];
  }
  return out;
}

const cumulativeCache = new Map();
function cumulativeCached(applyIono, refs) {
  const key = `${applyIono}|${refs[1]}|${refs[2]}`;
  if (!cumulativeCache.has(key)) cumulativeCache.set(key, cumulativeRelative(applyIono, refs));
  return cumulativeCache.get(key);
}

// ---------- module layers ----------
function dbGray(db) {
  const t = (db + 25) / 23;
  const v = Math.round(255 * Math.max(0, Math.min(1, t)) ** 0.9);
  return [v * 0.92, v * 0.96, v, 235];
}

export function buildLayer(module, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const refs = p.refs || defaultRefs();
  switch (module) {
    case "floodghost":
      return floodghost(p);
    case "river-memory":
      return riverMemory(p);
    case "ground-zero":
      return groundZero(p, refs);
    case "surface-change":
      return surfaceChange(p);
    default:
      return floodghost(p);
  }
}

function floodghost(p) {
  const a = p.alpha ?? Math.round(p.opacity * 255);
  if (p.fgView === "backscatter") {
    const db = gcovDb(p.dateA, p.pol, p.speckle);
    return {
      kind: "continuous",
      unit: "dB",
      values: db,
      colorAt: (i) => (isValid(db[i]) ? dbGray(db[i]) : null),
      legend: { type: "gradient", title: `γ⁰ backscatter ${p.pol}${p.pol} (dB)`, stops: ["#0b0f14", "#f0f4f6"], min: "−25 dB", mid: "−13.5", max: "−2 dB" },
      describe: `${p.pol}${p.pol} gamma-nought on ${p.dateA}`,
    };
  }
  if (p.fgView === "persistence") {
    const dates = AVAILABLE_GCOV.filter((d) => d.date >= p.dateA && d.date <= p.dateB);
    const masks = dates.map((d) => waterMask(d.date, p.tau, p.speckle));
    const vals = new Float32Array(N);
    for (let i = 0; i < N; i += 1) vals[i] = waterPersistence(masks.map((m) => m[i]));
    return {
      kind: "continuous",
      unit: "fraction",
      values: vals,
      nDates: dates.length,
      colorAt: (i) => {
        const v = vals[i];
        if (!isValid(v) || v === 0) return null;
        const c = ramp([[0, [24, 52, 74]], [1, COLORS.water]], v);
        return [c[0], c[1], c[2], Math.round(a * (0.35 + 0.65 * v))];
      },
      legend: { type: "gradient", title: `Water persistence P_W (${dates.length} dates)`, stops: ["#18344a", "#36A9D6"], min: "0", mid: "0.5", max: "1" },
      describe: `Fraction of ${dates.length} valid dates between ${p.dateA} and ${p.dateB} classified as candidate water`,
    };
  }
  const wA = waterMask(p.dateA, p.tau, p.speckle);
  if (p.fgView === "vegflood") {
    const wB = waterMask(p.dateB, p.tau, p.speckle);
    const hhA = gcovDb(p.dateA, "HH", p.speckle);
    const hhB = gcovDb(p.dateB, "HH", p.speckle);
    const s = getStatic();
    const flag = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      if (!isValid(hhA[i]) || !isValid(hhB[i]) || !isValid(wB[i])) flag[i] = NaN;
      else if (wB[i] === 1) flag[i] = 1;
      else if (s.veg[i] > 0.5 && hhB[i] - hhA[i] > 3) flag[i] = 2;
      else flag[i] = 0;
    }
    return {
      kind: "classes",
      unit: "class",
      values: flag,
      colorAt: (i) => {
        if (flag[i] === 1) return [...COLORS.water, a];
        if (flag[i] === 2) return [...COLORS.vegflood, a];
        return null;
      },
      legend: {
        type: "classes",
        title: "Candidate water and double-bounce hypothesis",
        items: [
          { color: "#36A9D6", label: `Open-water candidate on ${p.dateB}` },
          { color: "#E7A34D", label: "Possible double-bounce (HH rose > 3 dB, vegetated)" },
          { color: "#3A3A3A", label: "Unknown or invalid", hatch: true },
        ],
      },
      describe: `HH change ${p.dateA} → ${p.dateB} in vegetated pixels`,
    };
  }
  return {
    kind: "classes",
    unit: "class",
    values: wA,
    colorAt: (i) => (wA[i] === 1 ? [...COLORS.water, a] : null),
    legend: {
      type: "classes",
      title: `Open-water candidate, τ = ${p.tau} dB`,
      items: [
        { color: "#36A9D6", label: `Backscatter below τ on ${p.dateA}` },
        { color: "#3A3A3A", label: "Unknown or invalid", hatch: true },
      ],
    },
    describe: `HH below ${p.tau} dB on ${p.dateA}`,
  };
}

function riverMemory(p) {
  const a = p.alpha ?? Math.round(p.opacity * 255);
  const wA = waterMask(p.dateA, p.tau, p.speckle);
  const wB = waterMask(p.dateB, p.tau, p.speckle);
  const cls = new Uint8Array(N);
  const stats = { persistent: 0, lost: 0, newWater: 0, neither: 0, unknownCells: 0 };
  for (let i = 0; i < N; i += 1) {
    const k = changeClass(wA[i], wB[i]);
    cls[i] = k;
    if (k === CHANGE.PERSISTENT) stats.persistent += cellArea[i];
    else if (k === CHANGE.LOST) stats.lost += cellArea[i];
    else if (k === CHANGE.NEW) stats.newWater += cellArea[i];
    else if (k === CHANGE.NEITHER) stats.neither += cellArea[i];
    else stats.unknownCells += 1;
  }
  stats.unknownFraction = stats.unknownCells / N;
  const colors = {
    [CHANGE.PERSISTENT]: [...COLORS.water, a],
    [CHANGE.LOST]: [...COLORS.lost, a],
    [CHANGE.NEW]: [...COLORS.newWater, a],
    [CHANGE.NEITHER]: null,
  };
  const dbA = gcovDb(p.dateA, "HH", p.speckle);
  const dbB = gcovDb(p.dateB, "HH", p.speckle);
  return {
    kind: "classes",
    unit: "class",
    values: cls,
    unknownAt: (i) => cls[i] === CHANGE.UNKNOWN,
    colorAt: (i) => colors[cls[i]] ?? null,
    swipeLeft: (i) => (p.swipeContent === "water" ? (wA[i] === 1 ? [...COLORS.water, a] : null) : isValid(dbA[i]) ? dbGray(dbA[i]) : null),
    swipeRight: (i) => (p.swipeContent === "water" ? (wB[i] === 1 ? [...COLORS.water, a] : null) : isValid(dbB[i]) ? dbGray(dbB[i]) : null),
    legend: { type: "classes", title: `Water change ${p.dateA} → ${p.dateB}`, items: CHANGE_LEGEND },
    stats,
    describe: `Set-theoretic change of candidate water masks`,
  };
}

function groundZero(p, refs) {
  const a = p.alpha ?? Math.round(p.opacity * 255);
  const { consistency, meanCoh } = temporalConsistency();
  let vals;
  let coh;
  let range = 8;
  let unit = "mm";
  let title;
  let r2 = null;
  if (p.gzStat === "coherence") {
    const g = getGunw(p.gzPair);
    vals = g.coherence;
    return {
      kind: "continuous",
      unit: "γ",
      values: vals,
      colorAt: (i) => {
        const v = Math.round(255 * vals[i]);
        return [v * 0.9, v * 0.95, v, 220];
      },
      legend: { type: "gradient", title: "Interferometric coherence γ", stops: ["#000000", "#f0f4f6"], min: "0", mid: "0.5", max: "1" },
      describe: `Coherence of ${p.gzPair}`,
    };
  }
  if (p.gzStat === "pair") {
    const g = getGunw(p.gzPair);
    vals = pairRelative(p.gzPair, p.applyIono, refs);
    coh = g.coherence;
    range = 8;
    title = "LOS displacement over pair";
  } else if (p.gzStat === "cumulative") {
    vals = cumulativeCached(p.applyIono, refs);
    coh = meanCoh;
    range = 16;
    title = `Cumulative LOS since ${GUNW_PAIRS[0].reference}`;
  } else {
    const vf = velocityField(p.applyIono, refs);
    vals = vf.v;
    r2 = vf.r2;
    coh = meanCoh;
    range = 40;
    unit = "mm/yr";
    title = `Interval-average LOS rate (${GUNW_PAIRS.length} pairs)`;
  }
  const passes = (i) => {
    if (!isValid(vals[i])) return false;
    if (coh[i] < p.cohMin) return false;
    if (consistency[i] < p.consMin) return false;
    if (r2 && !(r2[i] >= p.r2Min)) return false;
    return true;
  };
  const filteredOut = (i) => isValid(vals[i]) && !passes(i);
  return {
    kind: "continuous",
    unit,
    values: vals,
    range,
    passes,
    filteredOut,
    unknownAt: (i) => !isValid(vals[i]),
    colorAt: (i) => {
      if (!passes(i)) return null;
      const c = ramp(LOS_STOPS, (vals[i] + range) / (2 * range));
      return [c[0], c[1], c[2], a];
    },
    legend: {
      type: "gradient",
      title: `${title} (${unit})`,
      stops: ["#7B4CA8", "#EEF4F7", "#3DB8A5"],
      min: `−${range}`,
      mid: "0",
      max: `+${range}`,
      left: "toward sensor",
      right: "away from sensor",
    },
    describe: title,
  };
}

function surfaceChange(p) {
  const a = p.alpha ?? Math.round(p.opacity * 255);
  const A = gcovDb(p.dateA, p.pol, p.speckle);
  const B = gcovDb(p.dateB, p.pol, p.speckle);
  const wA = waterMask(p.dateA, p.tau, p.speckle);
  const wB = waterMask(p.dateB, p.tau, p.speckle);
  const d = new Float32Array(N);
  let brighter = 0;
  let darker = 0;
  for (let i = 0; i < N; i += 1) {
    if (!isValid(A[i]) || !isValid(B[i])) d[i] = NaN;
    else d[i] = B[i] - A[i];
    if (isValid(d[i]) && wA[i] !== 1 && wB[i] !== 1) {
      if (d[i] > p.scThresh) brighter += cellArea[i];
      else if (d[i] < -p.scThresh) darker += cellArea[i];
    }
  }
  const maturityA = AVAILABLE_GCOV.find((x) => x.date === p.dateA)?.maturity;
  const maturityB = AVAILABLE_GCOV.find((x) => x.date === p.dateB)?.maturity;
  return {
    kind: "continuous",
    unit: "dB",
    values: d,
    colorAt: (i) => {
      const v = d[i];
      if (!isValid(v) || Math.abs(v) < p.scThresh || wA[i] === 1 || wB[i] === 1) return null;
      const c = ramp(SC_STOPS, (v + 10) / 20);
      return [c[0], c[1], c[2], a];
    },
    legend: {
      type: "gradient",
      title: `Backscatter change ΔB ${p.pol}${p.pol} (dB)`,
      stops: ["#5B8DB8", "#EEF4F7", "#E4627A"],
      min: "−10",
      mid: `|ΔB| < ${p.scThresh} hidden`,
      max: "+10",
      left: "darker",
      right: "brighter",
    },
    stats: { brighterKm2: brighter, darkerKm2: darker, mixedMaturity: maturityA !== maturityB },
    describe: `ΔB = B(${p.dateB}) − B(${p.dateA})`,
  };
}

// ---------- canvas rendering ----------
export const RENDER_SCALE = 4;

export function renderLayer(canvas, layer, opts = {}) {
  const S = RENDER_SCALE;
  const W = COLS * S;
  const H = ROWS * S;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const { showUnknown = true, swipeCol = null } = opts;
  const unknownFn = layer.unknownAt || ((i) => !isValid(layer.values[i]));
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = r * COLS + c;
      let col;
      if (swipeCol != null && layer.swipeLeft) col = c < swipeCol ? layer.swipeLeft(i) : layer.swipeRight(i);
      else col = layer.colorAt(i);
      const unknown = showUnknown && unknownFn(i);
      if (!col && !unknown) continue;
      for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) {
          const o = ((r * S + y) * W + (c * S + x)) * 4;
          if (unknown) {
            const stripe = (x + y) % S === 0;
            data[o] = stripe ? 150 : 58;
            data[o + 1] = stripe ? 150 : 58;
            data[o + 2] = stripe ? 150 : 58;
            data[o + 3] = 200;
          } else {
            data[o] = col[0];
            data[o + 1] = col[1];
            data[o + 2] = col[2];
            data[o + 3] = col[3];
          }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export { daysBetween };
