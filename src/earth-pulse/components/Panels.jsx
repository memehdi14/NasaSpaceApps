import { PORTALS, formatDate } from "../config.js";
import { isValid } from "../math.js";

// Values only at real acquisition dates. A segment is dashed where it crosses
// a missing acquisition (the ASF data gap) and is never interpolated as data.
export function TimeSeriesChart({ points, unit, highlight = [], fit = null, gapAfter = [], label, height = 150 }) {
  const W = 300;
  const H = height;
  const m = { l: 38, r: 8, t: 10, b: 26 };
  const valid = points.filter((p) => isValid(p.value));
  if (valid.length === 0) return <p className="ep-hint">No valid observations at this pixel.</p>;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  let lo = Math.min(...valid.map((p) => p.value));
  let hi = Math.max(...valid.map((p) => p.value));
  if (fit) {
    lo = Math.min(lo, fit.y0, fit.y1);
    hi = Math.max(hi, fit.y0, fit.y1);
  }
  if (hi - lo < 1e-6) {
    hi += 1;
    lo -= 1;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const x = (d) => m.l + ((Date.parse(d) - t0) / span) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const segs = [];
  for (let k = 0; k < points.length - 1; k += 1) {
    const a = points[k];
    const b = points[k + 1];
    if (!isValid(a.value) || !isValid(b.value)) continue;
    segs.push({ a, b, gap: gapAfter.includes(a.date) });
  }
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <figure style={{ margin: 0 }}>
      <svg className="ep-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line className="ep-chart-axis" x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} />
        {ticks.map((t) => (
          <g key={t}>
            <line className="ep-chart-axis" x1={m.l - 3} x2={W - m.r} y1={y(t)} y2={y(t)} strokeOpacity="0.35" />
            <text x={m.l - 5} y={y(t) + 3} textAnchor="end">{Math.abs(t) >= 100 ? t.toFixed(0) : t.toFixed(1)}</text>
          </g>
        ))}
        {segs.map((s) => (
          <line key={s.a.date} className={s.gap ? "ep-chart-gap" : "ep-chart-line"} x1={x(s.a.date)} y1={y(s.a.value)} x2={x(s.b.date)} y2={y(s.b.value)} />
        ))}
        {fit ? <line className="ep-chart-fit" x1={x(points[0].date)} y1={y(fit.y0)} x2={x(points[points.length - 1].date)} y2={y(fit.y1)} /> : null}
        {points.map((p) =>
          isValid(p.value) ? (
            <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={highlight.includes(p.date) ? 4.5 : 3.2} className={`ep-chart-pt ${p.validated ? "is-validated" : ""} ${highlight.includes(p.date) ? "is-sel" : ""}`}>
              <title>{`${formatDate(p.date)}: ${p.value.toFixed(2)} ${unit}${p.note ? ` (${p.note})` : ""}`}</title>
            </circle>
          ) : null,
        )}
        <text x={m.l} y={H - 8}>{formatDate(points[0].date)}</text>
        <text x={W - m.r} y={H - 8} textAnchor="end">{formatDate(points[points.length - 1].date)}</text>
        <text x={4} y={m.t + 4}>{unit}</text>
      </svg>
    </figure>
  );
}

export function DataGapNotice({ module, product }) {
  const collection = product === "GUNW" ? "NISAR_L2_GUNW_PROVISIONAL_V1" : "NISAR_L2_GCOV_PROVISIONAL_V1";
  const body =
    product === "GUNW"
      ? "No coherent GUNW pair has been authenticated for the Ahmedabad AOI. A valid interferogram needs two acquisitions, good coherence and successful phase unwrapping. This lens activates when NASA returns a valid pair."
      : "No GCOV acquisitions have been authenticated for the Ahmedabad AOI yet. This lens activates when the inventory script records real NASA granules in the manifest.";
  return (
    <div className="ep-gap-notice" role="status">
      <div className="ep-gap-card">
        <h3>{module} has no verified NASA data yet</h3>
        <p>{body}</p>
        <p>
          Collection: <code>{collection}</code>
          <br />
          Run <code>python pipelines/inventory_ahmedabad.py</code> with a NASA Earthdata Login.
        </p>
        <div className="ep-gap-actions">
          <a className="ep-btn ep-btn--primary ep-btn--small" href={PORTALS.asf} target="_blank" rel="noreferrer noopener">Search ASF Vertex</a>
          <a className="ep-btn ep-btn--ghost ep-btn--small" href={product === "GUNW" ? PORTALS.gunwProvisional : PORTALS.gcovProvisional} target="_blank" rel="noreferrer noopener">
            Open in Earthdata Search
          </a>
        </div>
      </div>
    </div>
  );
}

export function IntervalDisplay({ pair }) {
  return (
    <div>
      <dl className="ep-kv">
        <dt>Reference</dt><dd>{formatDate(pair.reference)}, 00:41 UTC</dd>
        <dt>Secondary</dt><dd>{formatDate(pair.secondary)}, 00:41 UTC</dd>
        <dt>Interval</dt><dd>{pair.days} days{pair.days > 12 ? " (spans the ASF data gap)" : ""}</dd>
        <dt>Polarisation</dt><dd>{pair.polarization}, frequency A</dd>
      </dl>
      <p className="ep-warn">This map shows relative line-of-sight displacement between these two dates only. It is not a subsidence trend or rate.</p>
    </div>
  );
}

export const WHAT_YOU_SEE = {
  floodghost: {
    observation: "GCOV L-band gamma-nought backscatter, shown in decibels.",
    interpretation: "Low returns may be smooth open water. High returns are usually buildings or vegetation.",
    causes: "Radar shadow, smooth roads and runways, calm reservoirs, wind roughening water, viewing geometry.",
    trust: "Candidate mask only. Not independently verified water.",
  },
  "river-memory": {
    observation: "Two candidate water masks from GCOV on two actual acquisition dates.",
    interpretation: "Where the dark water signature appeared, disappeared or persisted between the dates.",
    causes: "Water level, barrage releases, wet soil, vegetation growth and wind can all move the apparent edge.",
    trust: "Changes smaller than one pixel cannot be confirmed. A moved edge is not proof of erosion.",
  },
  "ground-zero": {
    observation: "GUNW unwrapped phase converted to line-of-sight displacement, with coherence.",
    interpretation: "Relative motion toward or away from the satellite between the pair dates, measured against a reference pixel.",
    causes: "Atmospheric delay, ionosphere, unwrapping errors, orbit residuals and seasonal soil moisture.",
    trust: "Line of sight is not vertical. One pair is an interval, not a trend. Water is decorrelated, never zero.",
  },
  "surface-change": {
    observation: "Change in GCOV backscatter between two dates, in decibels.",
    interpretation: "Brightening can follow new construction or vegetation growth; darkening can follow clearing or flooding.",
    causes: "Soil moisture, crop cycles, geometry differences and provisional versus validated processing.",
    trust: "A screening layer to decide where to look, not a land-use map.",
  },
};

export function WhatYouSee({ module }) {
  const w = WHAT_YOU_SEE[module];
  if (!w) return null;
  return (
    <dl className="ep-kv ep-wys">
      <dt>Observation</dt><dd>{w.observation}</dd>
      <dt>Interpretation</dt><dd>{w.interpretation}</dd>
      <dt>Other causes</dt><dd>{w.causes}</dd>
      <dt>Trust and limits</dt><dd>{w.trust}</dd>
    </dl>
  );
}
