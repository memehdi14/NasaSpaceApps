// Builds the evidence record for one pixel in one lens. Every number here is
// from the illustrative synthetic field and is labelled as such by the UI.

import { AVAILABLE_GCOV, DEMO_INCIDENCE_DEG, DEMO_LOOKS, GUNW_PAIRS, formatDate } from "./config.js";
import {
  CHANGE,
  fmt,
  fmtSigned,
  isValid,
  losStdFromCoherence,
  verticalFromLos,
  waterCandidate,
  weightedVelocity,
  wrapPhase,
} from "./math.js";
import { CELL_AREA, defaultRefs, gcovDb, temporalConsistency } from "./layers.js";
import {
  GUNW_WAVELENGTH,
  cellCenter,
  cumulativeSeries,
  getGunw,
  getStatic,
  pixelId,
  rawPhaseRad,
} from "./synthetic.js";

const CHANGE_NAMES = {
  [CHANGE.PERSISTENT]: "Persistent candidate water",
  [CHANGE.LOST]: "Water on date A only",
  [CHANGE.NEW]: "Water on date B only",
  [CHANGE.NEITHER]: "Neither date (land)",
  [CHANGE.UNKNOWN]: "Unknown (invalid on a date)",
};

const waterLabel = (w) => (w === 1 ? "Candidate water" : w === 0 ? "Not water" : "Unknown");

export function inspectPixel(module, params, i) {
  const { lat, lng } = cellCenter(i);
  const base = {
    id: pixelId(i),
    index: i,
    lat,
    lng,
    location: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`,
    areaKm2: CELL_AREA[i],
  };
  const p = params;
  if (module === "floodghost" || module === "surface-change" || module === "river-memory") {
    const hhA = gcovDb(p.dateA, "HH", p.speckle)[i];
    const hvA = gcovDb(p.dateA, "HV", p.speckle)[i];
    const hhB = gcovDb(p.dateB, "HH", p.speckle)[i];
    const hvB = gcovDb(p.dateB, "HV", p.speckle)[i];
    const wA = waterCandidate(hhA, p.tau);
    const wB = waterCandidate(hhB, p.tau);
    const valid = isValid(hhA);
    if (module === "floodghost") {
      const primary = p.pol === "HV" ? hvA : hhA;
      let headline = fmt(primary, 1, "dB");
      let status = valid ? waterLabel(wA) : "Invalid (masked)";
      if (p.fgView === "vegflood") {
        const s = getStatic();
        const d = isValid(hhA) && isValid(hhB) ? hhB - hhA : NaN;
        headline = fmtSigned(d, 1, "dB ΔHH");
        status = !isValid(d) ? "Unknown" : wB === 1 ? "Candidate open water on date B" : s.veg[i] > 0.5 && d > 3 ? "POSSIBLE_DOUBLE_BOUNCE (hypothesis)" : "No double-bounce signature";
      }
      return {
        ...base,
        headline,
        popup: [["Value", headline], ["Date", p.fgView === "vegflood" ? `${p.dateA} → ${p.dateB}` : p.dateA], ["Status", status]],
        rows: [
          ["HH on date A", fmt(hhA, 1, "dB")],
          ["HV on date A", fmt(hvA, 1, "dB")],
          ["HH on date B", fmt(hhB, 1, "dB")],
          ["Threshold τ", `${p.tau} dB`],
          ["Classification", status],
          ["Mask", valid ? "Valid" : "Invalid (layover, shadow or fill)"],
        ],
        quote: valid
          ? `This pixel returned ${fmt(hhA, 1, "dB")} HH on ${formatDate(p.dateA)}. Returns below ${p.tau} dB may indicate smooth water, but could also be radar shadow, smooth tarmac or another smooth surface.`
          : "No valid radar return on this date. Missing data is shown as unknown, never as zero.",
        status: p.fgView === "vegflood" ? "HYPOTHESIS" : "INTERPRETATION",
      };
    }
    if (module === "river-memory") {
      let cls = CHANGE.UNKNOWN;
      if (isValid(wA) && isValid(wB)) cls = wA === 1 && wB === 1 ? CHANGE.PERSISTENT : wA === 1 ? CHANGE.LOST : wB === 1 ? CHANGE.NEW : CHANGE.NEITHER;
      return {
        ...base,
        headline: CHANGE_NAMES[cls],
        popup: [["Class", CHANGE_NAMES[cls]], ["Dates", `${p.dateA} → ${p.dateB}`]],
        rows: [
          ["Date A", `${formatDate(p.dateA)}: ${waterLabel(wA)}`],
          ["Date B", `${formatDate(p.dateB)}: ${waterLabel(wB)}`],
          ["HH on A", fmt(hhA, 1, "dB")],
          ["HH on B", fmt(hhB, 1, "dB")],
          ["Pixel area", `${(CELL_AREA[i] * 1e6).toFixed(0)} m²`],
        ],
        quote: "A new water signature is not necessarily permanent riverbank erosion. Water level, river management, wind and vegetation can produce the same change.",
        status: "DERIVED",
      };
    }
    const pol = p.pol;
    const a = pol === "HV" ? hvA : hhA;
    const b = pol === "HV" ? hvB : hhB;
    const d = isValid(a) && isValid(b) ? b - a : NaN;
    const watery = wA === 1 || wB === 1;
    const cls = !isValid(d) ? "Unknown" : watery ? "Water on a date (excluded)" : d > p.scThresh ? "Brightened" : d < -p.scThresh ? "Darkened" : "Stable within threshold";
    return {
      ...base,
      headline: fmtSigned(d, 1, "dB"),
      popup: [["ΔB", fmtSigned(d, 1, "dB")], ["Dates", `${p.dateA} → ${p.dateB}`], ["Class", cls]],
      rows: [
        [`${pol}${pol} on A`, fmt(a, 1, "dB")],
        [`${pol}${pol} on B`, fmt(b, 1, "dB")],
        ["Change ΔB", fmtSigned(d, 1, "dB")],
        ["Threshold", `±${p.scThresh} dB`],
        ["Class", cls],
      ],
      quote: "Brightening can mean new construction, but also wetter soil, crop growth or a change in viewing geometry. It flags a place to check, not a building permit.",
      status: "INTERPRETATION",
    };
  }

  // Ground Zero
  const refs = p.refs || defaultRefs();
  const s = getStatic();
  const comp = s.component[i];
  const pair = GUNW_PAIRS.find((x) => x.id === p.gzPair) || GUNW_PAIRS[0];
  const g = getGunw(pair.id);
  const ref = refs[comp];
  const coh = g.coherence[i];
  const decor = !isValid(g.losMm[i]);
  const total = decor ? NaN : g.losMm[i] + (p.applyIono ? 0 : g.ionoMm[i]);
  const refVal = isValid(g.losMm[ref]) ? g.losMm[ref] + (p.applyIono ? 0 : g.ionoMm[ref]) : NaN;
  const rel = total - refVal;
  const raw = decor ? NaN : rawPhaseRad(g.losMm[i], g.ionoMm[i]);
  const corrected = decor ? NaN : rawPhaseRad(g.losMm[i], 0);
  const sigma = losStdFromCoherence(coh, DEMO_LOOKS, GUNW_WAVELENGTH) * 1000;
  const series = cumulativeSeries(i, p.applyIono, refs);
  const fit = weightedVelocity(series.days, series.values, series.weights);
  const { consistency } = temporalConsistency();
  const rate = isValid(fit.slope) ? fit.slope * 365 : NaN;
  let headline = fmtSigned(rel, 1, "mm");
  if (p.gzStat === "cumulative") headline = fmtSigned(series.values[series.values.length - 1], 1, "mm");
  if (p.gzStat === "velocity") headline = fmtSigned(rate, 1, "mm/yr");
  if (p.gzStat === "coherence") headline = `γ = ${coh.toFixed(2)}`;
  return {
    ...base,
    headline: decor ? "Decorrelated" : headline,
    popup: [
      ["Value", decor ? "Decorrelated" : headline],
      ["Pair", `${pair.reference} → ${pair.secondary}`],
      ["Coherence", coh.toFixed(2)],
    ],
    rows: [
      ["LOS displacement", decor ? "Decorrelated (water or masked)" : `${fmtSigned(rel, 1, "mm")} rel. to reference`],
      ["Random uncertainty σ", isValid(sigma) && !decor ? `±${sigma.toFixed(1)} mm (coherence only)` : "No data"],
      ["Coherence γ", coh.toFixed(2)],
      ["Temporal consistency", `${Math.round(consistency[i] * 100)}% of pairs γ ≥ 0.3`],
      ["Connected component", `${comp} (${comp === 1 ? "west bank" : "east bank"})`],
      ["Reference pixel", pixelId(ref)],
      ["Phase, raw wrapped", decor ? "No data" : `${wrapPhase(raw).toFixed(2)} rad`],
      ["Phase, corrected", decor ? "No data" : `${corrected.toFixed(2)} rad`],
      ["Corrections applied", p.applyIono ? "Ionosphere (demo layer)" : "None"],
      ["Sign convention", "+ = away from sensor (demo)"],
      ["Vertical-only assumption", decor ? "No data" : `${fmtSigned(verticalFromLos(rel, DEMO_INCIDENCE_DEG) * -1, 1, "mm")} up, assumes no horizontal motion`],
      ["Rate from all pairs", isValid(rate) ? `${fmtSigned(rate, 1, "mm/yr")}, R² ${fit.r2.toFixed(2)}, n = ${fit.n}` : fit.reason || "No data"],
    ],
    series,
    fit,
    quote: "LOS is not vertical. The satellite sees motion along one direction only, so the vertical component cannot be uniquely recovered from one look angle. One pair is an interval, not a trend.",
    status: "DERIVED",
    pair,
  };
}

export function waterAreaForExport(stats) {
  return stats;
}

export { AVAILABLE_GCOV };
