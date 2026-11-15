import { useEffect, useMemo, useRef, useState } from "react";

// KaTeX (and its fonts and CSS) only loads when a formula is first shown,
// which is inside the Science modal, not on page load.
let katexPromise = null;
const loadKatex = () => {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => m.default);
  }
  return katexPromise;
};

export function BrandMark({ size = 30 }) {
  // A radar footprint over a river meander: the product in one glyph.
  return (
    <svg className="ep-brandmark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeOpacity="0.45" />
      <path d="M5 21c4-1 6-6 10-6s6 5 12 3" fill="none" stroke="#36A9D6" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 3.5a12.5 12.5 0 0 1 12.5 12.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 8a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.7" />
      <circle cx="16" cy="16" r="2.2" fill="#E7A34D" />
    </svg>
  );
}

const STATUS_COPY = {
  NOT_VERIFIED: { label: "Awaiting NASA verification", tone: "warn" },
  PARTIAL: { label: "Partially verified", tone: "info" },
  VERIFIED: { label: "NASA source verified", tone: "ok" },
  LOADING: { label: "Checking manifest", tone: "muted" },
};

export function StatusLine({ status }) {
  const s = STATUS_COPY[status] || STATUS_COPY.LOADING;
  return (
    <p className="ep-statusline">
      <span>Study area: Ahmedabad–Sabarmati, 72.42–72.72°E, 22.88–23.19°N</span>
      <span className={`ep-status-chip tone-${s.tone}`}>Source status: {s.label}</span>
    </p>
  );
}

const PROV = {
  OBSERVED: "ok",
  DERIVED: "info",
  INTERPRETATION: "amber",
  HYPOTHESIS: "orange",
  ILLUSTRATIVE: "muted",
  UNAVAILABLE: "bad",
};

export function ProvBadge({ kind }) {
  return <span className={`ep-prov ep-prov--${PROV[kind] || "muted"}`}>{kind.toLowerCase()}</span>;
}

export function Modal({ title, onClose, children, wide = false, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const node = ref.current;
    node?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && node) {
        const f = node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  const id = labelledBy || `ep-modal-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="ep ep-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`ep-modal ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}>
        <header className="ep-modal-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="ep-icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="ep-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Tex({ children, block = false }) {
  const [katex, setKatex] = useState(null);
  useEffect(() => {
    let alive = true;
    loadKatex().then((k) => alive && setKatex(() => k)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const html = useMemo(() => {
    if (!katex) return null;
    try {
      return katex.renderToString(children, { displayMode: block, throwOnError: false, strict: "ignore", trust: false });
    } catch {
      return null;
    }
  }, [katex, children, block]);
  if (!html) return <code>{children}</code>;
  // KaTeX output is generated locally from constant strings in this codebase.
  // eslint-disable-next-line react/no-danger
  return <span className={block ? "ep-tex-block" : "ep-tex"} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Legend({ legend }) {
  if (!legend) return null;
  if (legend.type === "gradient") {
    return (
      <div className="ep-legend" role="img" aria-label={`${legend.title}. From ${legend.min} to ${legend.max}.`}>
        <div className="ep-legend-title">{legend.title}</div>
        <div className="ep-legend-bar" style={{ background: `linear-gradient(90deg, ${legend.stops.join(", ")})` }} />
        <div className="ep-legend-scale">
          <span>{legend.min}</span>
          <span>{legend.mid}</span>
          <span>{legend.max}</span>
        </div>
        {legend.left ? (
          <div className="ep-legend-scale ep-legend-dir">
            <span>{legend.left}</span>
            <span>{legend.right}</span>
          </div>
        ) : null}
        <div className="ep-legend-item ep-legend-item--unknown">
          <i className="ep-swatch is-hatch" /> Unknown, invalid or decorrelated
        </div>
      </div>
    );
  }
  return (
    <div className="ep-legend">
      <div className="ep-legend-title">{legend.title}</div>
      <ul>
        {legend.items.map((it) => (
          <li key={it.label} className="ep-legend-item">
            <i className={`ep-swatch ${it.hatch ? "is-hatch" : ""}`} style={it.hatch ? undefined : { background: it.color }} />
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function Slider({ id, label, value, min, max, step, onChange, format = (v) => v, hint }) {
  return (
    <div className="ep-slider">
      <div className="ep-slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <p className="ep-hint">{hint}</p> : null}
    </div>
  );
}

export function Segmented({ label, value, options, onChange, name }) {
  return (
    <fieldset className="ep-seg">
      <legend>{label}</legend>
      <div className="ep-seg-row">
        {options.map((o) => (
          <label key={o.value} className={`${value === o.value ? "is-on" : ""} ${o.disabled ? "is-disabled" : ""}`} title={o.title}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Check({ label, checked, onChange, hint }) {
  return (
    <label className="ep-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ep-check-box" aria-hidden="true" />
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
