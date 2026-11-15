import { AOI, LAKES, SABARMATI_LINE } from "../config.js";

const W = 580;
const H = 400;
const C = {
  bg: "#142333", line: "#264054", text: "#EEF4F7", muted: "#A7BAC6", dim: "#6F8EA2",
  water: "#36A9D6", amber: "#E7A34D", purple: "#7B4CA8", teal: "#3DB8A5", pin: "#FF6B35",
};
const T = (props) => <text fill={C.muted} fontSize="13" fontFamily="Space Grotesk, sans-serif" {...props} />;

export function AhmedabadAOIMap() {
  const pad = 40;
  const sx = (lng) => pad + ((lng - AOI.west) / (AOI.east - AOI.west)) * (W - pad * 2);
  const sy = (lat) => pad + ((AOI.north - lat) / (AOI.north - AOI.south)) * (H - pad * 2);
  const river = SABARMATI_LINE.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const kmPx = (W - pad * 2) / ((AOI.east - AOI.west) * 111.32 * Math.cos((23 * Math.PI) / 180));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Illustrative map of the Ahmedabad study rectangle with the Sabarmati river running north to south">
      <rect x={pad} y={pad} width={W - pad * 2} height={H - pad * 2} fill="none" stroke={C.water} strokeDasharray="6 4" />
      <circle cx={sx(72.575)} cy={sy(23.035)} r="120" fill={C.text} opacity="0.05" />
      <polyline points={river} fill="none" stroke={C.water} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {LAKES.map((l) => <circle key={l.name} cx={sx(l.lng)} cy={sy(l.lat)} r="6" fill={C.water} />)}
      <circle cx={sx(AOI.center.lng)} cy={sy(AOI.center.lat)} r="6" fill={C.pin} stroke="#fff" strokeWidth="2" />
      <T x={sx(72.585) + 10} y={sy(23.07)}>Sabarmati</T>
      <T x={sx(72.6) + 10} y={sy(23.006) + 4}>Kankaria</T>
      <T x={sx(AOI.center.lng) - 98} y={sy(AOI.center.lat) + 4} fill={C.text}>City centre</T>
      <T x={pad} y={pad - 12} fontSize="12" fill={C.dim}>72.42°E, 23.19°N</T>
      <T x={W - pad} y={H - pad + 22} fontSize="12" fill={C.dim} textAnchor="end">72.72°E, 22.88°N</T>
      <line x1={pad + 12} y1={H - pad - 14} x2={pad + 12 + kmPx * 5} y2={H - pad - 14} stroke={C.text} strokeWidth="2" />
      <T x={pad + 12} y={H - pad - 22} fontSize="12" fill={C.text}>5 km</T>
    </svg>
  );
}

export function RadarSchematic() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schematic of a radar satellite sending microwave pulses through clouds to the ground and receiving echoes">
      <g transform="translate(70 60)">
        <rect x="-26" y="-12" width="52" height="24" rx="4" fill={C.line} stroke={C.muted} />
        <rect x="-74" y="-6" width="42" height="12" fill={C.water} opacity="0.7" />
        <rect x="32" y="-6" width="42" height="12" fill={C.water} opacity="0.7" />
        <rect x="-8" y="12" width="16" height="22" fill={C.muted} />
      </g>
      <T x="40" y="28" fill={C.text}>NISAR (L-band, ~24 cm wavelength)</T>
      <g opacity="0.85">
        {[0, 1, 2].map((k) => (
          <ellipse key={k} cx={230 + k * 70} cy="170" rx="70" ry="24" fill="#2A3F52" />
        ))}
      </g>
      <T x="420" y="160">Monsoon cloud</T>
      <path d="M90 100 L330 330" stroke={C.amber} strokeWidth="3" strokeDasharray="10 6" />
      <path d="M118 96 L346 316" stroke={C.water} strokeWidth="2" />
      <polygon points="346,316 334,302 352,304" fill={C.water} />
      <T x="168" y="250" fill={C.amber}>pulse out</T>
      <T x="252" y="226" fill={C.water}>echo back</T>
      <rect x="0" y="330" width={W} height="70" fill="#1F3A2E" />
      <path d="M0 340 Q 145 325 290 342 T 580 336" stroke={C.water} strokeWidth="8" fill="none" opacity="0.8" />
      <T x="380" y="380" fill={C.text}>Works day or night, through cloud</T>
    </svg>
  );
}

export function ScatteringDiagram() {
  const half = W / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Two panels. Left, open water reflects the pulse away so it looks dark. Right, flooded vegetation bounces the pulse back via trunk and water, so it can look bright.">
      <line x1={half} y1="20" x2={half} y2={H - 20} stroke={C.line} />
      <T x="24" y="40" fill={C.text} fontSize="15">Open water: looks dark</T>
      <rect x="20" y="300" width={half - 40} height="40" fill={C.water} opacity="0.55" />
      <path d="M40 90 L150 300" stroke={C.amber} strokeWidth="3" />
      <path d="M150 300 L262 100" stroke={C.amber} strokeWidth="3" strokeDasharray="6 5" opacity="0.6" />
      <polygon points="262,100 250,112 266,116" fill={C.amber} opacity="0.6" />
      <T x="24" y="372">Mirror-like surface sends energy away</T>
      <T x={half + 20} y="40" fill={C.text} fontSize="15">Flooded vegetation: can look bright</T>
      <rect x={half + 20} y="300" width={half - 40} height="40" fill={C.water} opacity="0.55" />
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(${half + 90 + k * 70} 0)`}>
          <rect x="-4" y="190" width="8" height="112" fill="#7A5A3A" />
          <circle cx="0" cy="182" r="26" fill="#2E6B47" />
        </g>
      ))}
      <path d={`M${half + 30} 90 L${half + 154} 300 L${half + 156} 200 L${half + 40} 96`} stroke={C.amber} strokeWidth="3" fill="none" />
      <T x={half + 20} y="372">Trunk plus water: a double bounce</T>
      <T x={half + 20} y="392" fontSize="12" fill={C.dim}>A hypothesis to test, not proof of flooding</T>
    </svg>
  );
}

export function ObservationVsCause() {
  const box = (x, y, w, label, sub, color = C.line) => (
    <g>
      <rect x={x} y={y} width={w} height="62" rx="10" fill={C.bg} stroke={color} />
      <T x={x + 14} y={y + 26} fill={C.text}>{label}</T>
      <T x={x + 14} y={y + 46} fontSize="12">{sub}</T>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="One observed change in the water edge can be produced by three different physical causes">
      {box(150, 26, 280, "Observed: the dark edge moved", "Water mask on date A differs from date B", C.water)}
      <path d="M290 88 L110 168 M290 88 L290 168 M290 88 L470 168" stroke={C.muted} strokeWidth="1.5" />
      {box(14, 170, 186, "Water level rose", "Bank unchanged")}
      {box(204, 170, 172, "Bank eroded", "Land lost")}
      {box(380, 170, 186, "Roughness changed", "Wind, vegetation, soil")}
      <rect x="40" y="276" width="500" height="92" rx="12" fill="none" stroke={C.amber} strokeDasharray="6 4" />
      <T x="60" y="306" fill={C.amber} fontSize="14">Same radar observation, different causes</T>
      <T x="60" y="330">Two masks cannot tell these apart. More dates and</T>
      <T x="60" y="350">independent evidence are needed before calling it erosion.</T>
    </svg>
  );
}

export function PhaseDerivation() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Two passes of the satellite see the same ground point; a small change in range shows up as a phase difference">
      <g fill={C.muted}>
        <rect x="50" y="40" width="40" height="18" rx="3" />
        <rect x="120" y="30" width="40" height="18" rx="3" />
      </g>
      <T x="40" y="28" fontSize="12">pass 1</T>
      <T x="128" y="22" fontSize="12">pass 2, 12 days later</T>
      <path d="M70 58 L330 300" stroke={C.teal} strokeWidth="2" />
      <path d="M140 48 L330 316" stroke={C.purple} strokeWidth="2" strokeDasharray="7 5" />
      <rect x="250" y="300" width="160" height="12" fill="#3A4F62" />
      <rect x="250" y="316" width="160" height="12" fill="#52697E" />
      <T x="420" y="312" fontSize="12">ground before</T>
      <T x="420" y="330" fontSize="12">ground after</T>
      <path d="M40 210 q 15 -30 30 0 t 30 0 t 30 0 t 30 0 t 30 0" stroke={C.teal} fill="none" strokeWidth="2" />
      <path d="M52 220 q 15 -30 30 0 t 30 0 t 30 0 t 30 0 t 30 0" stroke={C.purple} fill="none" strokeWidth="2" />
      <T x="40" y="250" fontSize="12">phase shift Δφ between the two echoes</T>
      <rect x="320" y="70" width="236" height="110" rx="12" fill={C.bg} stroke={C.line} />
      <text x="338" y="112" fill={C.text} fontFamily="JetBrains Mono, monospace" fontSize="18">d = λ·Δφ / 4π</text>
      <T x="338" y="140" fontSize="12">λ ≈ 0.24 m for NISAR L-band</T>
      <T x="338" y="160" fontSize="12">Δφ = 1 rad gives about 19 mm</T>
      <T x="40" y="380" fill={C.amber} fontSize="12">Line-of-sight only. One pair is an interval, not a trend.</T>
    </svg>
  );
}

export const ILLUSTRATIONS = { AhmedabadAOIMap, RadarSchematic, ScatteringDiagram, ObservationVsCause, PhaseDerivation };
