// Earth Pulse — Ahmedabad. Single source of truth for the locked study area,
// the analysis grid, the acquisition calendar, module definitions and the
// official source list. The AOI is LOCKED (PRD integrity rule 10): changing it
// requires a manifest version bump.

export const AOI = Object.freeze({
  id: "ahmedabad-sabarmati-v1",
  name: "Ahmedabad–Sabarmati Urban Corridor, Gujarat, India",
  short: "Ahmedabad–Sabarmati",
  west: 72.42,
  south: 22.88,
  east: 72.72,
  north: 23.19,
  center: { lng: 72.57, lat: 23.035 },
  crs: "EPSG:4326",
  analysisCrs: "EPSG:32643",
});

export const AOI_BBOX = [AOI.west, AOI.south, AOI.east, AOI.north];

// Analysis grid used by the illustrative demo layers. 0.002 deg ≈ 205 m (E-W)
// × 221 m (N-S) at 23°N. Real GCOV posting is 10–20 m and GUNW 80 m; the demo
// grid is deliberately coarser so pixels are visible and inspectable.
export const GRID = Object.freeze({
  dx: 0.002,
  dy: 0.002,
  cols: 150,
  rows: 155,
});

// Physical constants (illustrative defaults; real values come from metadata).
export const NISAR_L_BAND_WAVELENGTH_M = 0.2384; // ~1.257 GHz centre frequency
export const DEMO_LOOKS = 400; // effective looks after multilooking to the 80 m GUNW posting
export const DEMO_INCIDENCE_DEG = 37;

// Acquisition calendar for the demo record. Dates follow NISAR's 12-day
// repeat and the real ASF release timeline: provisional L-band from
// 17 Jun 2026, a documented data gap 27 Jul – 10 Aug 2026, validated
// products from 21 Oct 2026. `wetness` drives the synthetic monsoon signal.
export const GCOV_DATES = [
  { date: "2026-06-17", time: "00:41", maturity: "PROVISIONAL", wetness: 0.1 },
  { date: "2026-06-29", time: "00:41", maturity: "PROVISIONAL", wetness: 0.35 },
  { date: "2026-07-11", time: "00:41", maturity: "PROVISIONAL", wetness: 0.7 },
  { date: "2026-07-23", time: "00:41", maturity: "PROVISIONAL", wetness: 0.95 },
  { date: "2026-08-04", time: null, maturity: null, wetness: null, gap: "Inside the ASF-documented NISAR data gap (27 Jul – 10 Aug 2026)." },
  { date: "2026-08-16", time: "00:41", maturity: "PROVISIONAL", wetness: 0.85 },
  { date: "2026-08-28", time: "00:41", maturity: "PROVISIONAL", wetness: 0.75 },
  { date: "2026-09-09", time: "00:41", maturity: "PROVISIONAL", wetness: 0.55 },
  { date: "2026-09-21", time: "00:41", maturity: "PROVISIONAL", wetness: 0.35 },
  { date: "2026-10-03", time: "00:41", maturity: "PROVISIONAL", wetness: 0.2 },
  { date: "2026-10-15", time: "00:41", maturity: "PROVISIONAL", wetness: 0.1 },
  { date: "2026-10-27", time: "00:41", maturity: "VALIDATED", wetness: 0.05 },
  { date: "2026-11-08", time: "00:41", maturity: "VALIDATED", wetness: 0.03 },
];

export const AVAILABLE_GCOV = GCOV_DATES.filter((d) => !d.gap);

// GUNW pairs chain consecutive provisional acquisitions. The 23 Jul → 16 Aug
// pair spans the data gap (24 days). Pairs never mix provisional/validated.
export const GUNW_PAIRS = (() => {
  const prov = AVAILABLE_GCOV.filter((d) => d.maturity === "PROVISIONAL");
  const pairs = [];
  for (let i = 0; i < prov.length - 1; i += 1) {
    pairs.push({
      id: `pair-${i + 1}`,
      index: i,
      reference: prov[i].date,
      secondary: prov[i + 1].date,
      days: daysBetween(prov[i].date, prov[i + 1].date),
      polarization: "HH",
      maturity: "PROVISIONAL",
    });
  }
  return pairs;
})();

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

// The five lenses. Names follow the master plan; subtitles are plain-language.
export const LENSES = [
  {
    id: "floodghost",
    name: "Floodghost",
    title: "Water and inundation",
    question: "Where did the water go?",
    product: "GCOV",
    color: "#36A9D6",
  },
  {
    id: "river-memory",
    name: "River Memory",
    title: "River margins and dynamics",
    question: "What changed along the Sabarmati?",
    product: "GCOV",
    color: "#5B8DB8",
  },
  {
    id: "ground-zero",
    name: "Ground Zero",
    title: "Ground movement",
    question: "Is the land moving?",
    product: "GUNW",
    color: "#7B4CA8",
  },
  {
    id: "surface-change",
    name: "Surface Change",
    title: "Surface change and urban growth",
    question: "What became brighter or darker?",
    product: "GCOV",
    color: "#E4627A",
  },
  {
    id: "connections",
    name: "Connections",
    title: "Side-by-side comparison",
    question: "Two lenses, one city.",
    product: "GCOV + GUNW",
    color: "#E7A34D",
  },
];

export const lensById = (id) => LENSES.find((l) => l.id === id) || LENSES[0];

// Approximate Sabarmati centreline (lng, lat), north to south. Editorial
// geometry for the illustrative demo only — not a surveyed or legal boundary.
export const SABARMATI_LINE = [
  [72.648, 23.19], [72.641, 23.168], [72.632, 23.145], [72.623, 23.122],
  [72.613, 23.104], [72.601, 23.093], [72.591, 23.081], [72.586, 23.07],
  [72.583, 23.06], [72.579, 23.05], [72.576, 23.041], [72.574, 23.032],
  [72.572, 23.022], [72.569, 23.012], [72.564, 23.002], [72.557, 22.993],
  [72.549, 22.978], [72.541, 22.962], [72.534, 22.944], [72.528, 22.925],
  [72.522, 22.905], [72.515, 22.88],
];

// The engineered riverfront reach (approx. Vasna barrage to Indira bridge).
export const RIVERFRONT_LAT = { south: 22.99, north: 23.1 };

// Small water bodies used by the synthetic field (centre, radius km).
export const LAKES = [
  { name: "Kankaria Lake", lng: 72.6011, lat: 23.0063, r: 0.52 },
  { name: "Vastrapur Lake", lng: 72.5293, lat: 23.039, r: 0.22 },
  { name: "Chandola Lake", lng: 72.596, lat: 22.984, r: 0.62 },
];

// Offline gazetteer (approximate centroids). Used by the explorer search so it
// works without a network; Nominatim augments it when online.
export const PLACES = [
  { name: "Sabarmati Riverfront", lat: 23.035, lng: 72.576, kind: "River" },
  { name: "Gandhi Ashram", lat: 23.0607, lng: 72.5807, kind: "Landmark" },
  { name: "Ellis Bridge", lat: 23.0222, lng: 72.5712, kind: "Bridge" },
  { name: "Vasna Barrage", lat: 22.9935, lng: 72.5577, kind: "River" },
  { name: "Kankaria Lake", lat: 23.0063, lng: 72.6011, kind: "Water" },
  { name: "Vastrapur Lake", lat: 23.039, lng: 72.5293, kind: "Water" },
  { name: "Chandola Lake", lat: 22.984, lng: 72.596, kind: "Water" },
  { name: "Narendra Modi Stadium, Motera", lat: 23.0918, lng: 72.5975, kind: "Landmark" },
  { name: "Ahmedabad Airport (SVPI)", lat: 23.0726, lng: 72.6263, kind: "Landmark" },
  { name: "Maninagar", lat: 22.9963, lng: 72.6024, kind: "Area" },
  { name: "Sarkhej Roza", lat: 22.9767, lng: 72.5011, kind: "Landmark" },
  { name: "Juhapura", lat: 22.995, lng: 72.525, kind: "Area" },
  { name: "Naroda", lat: 23.071, lng: 72.661, kind: "Area" },
  { name: "Vatva GIDC", lat: 22.958, lng: 72.638, kind: "Industrial" },
  { name: "Narol", lat: 22.969, lng: 72.596, kind: "Area" },
  { name: "Odhav", lat: 23.024, lng: 72.66, kind: "Industrial" },
  { name: "Ramol", lat: 22.99, lng: 72.66, kind: "Area" },
  { name: "Isanpur", lat: 22.977, lng: 72.6, kind: "Area" },
  { name: "Lambha", lat: 22.948, lng: 72.585, kind: "Area" },
  { name: "Thaltej", lat: 23.05, lng: 72.508, kind: "Area" },
  { name: "Bopal", lat: 23.033, lng: 72.465, kind: "Area" },
  { name: "Bodakdev", lat: 23.043, lng: 72.51, kind: "Area" },
  { name: "Sola", lat: 23.075, lng: 72.514, kind: "Area" },
  { name: "Gota", lat: 23.102, lng: 72.541, kind: "Area" },
  { name: "Chandkheda", lat: 23.11, lng: 72.584, kind: "Area" },
  { name: "Shahibaug", lat: 23.056, lng: 72.592, kind: "Area" },
  { name: "Paldi", lat: 23.011, lng: 72.56, kind: "Area" },
  { name: "Navrangpura", lat: 23.037, lng: 72.556, kind: "Area" },
];

export const PORTALS = {
  asf: "https://search.asf.alaska.edu/",
  earthdata: "https://search.earthdata.nasa.gov/search",
  gcovProvisional: "https://search.earthdata.nasa.gov/search?q=NISAR_L2_GCOV_PROVISIONAL_V1",
  gunwProvisional: "https://search.earthdata.nasa.gov/search?q=NISAR_L2_GUNW_PROVISIONAL_V1",
  gcovValidated: "https://search.earthdata.nasa.gov/search?q=NISAR_L2_GCOV_V1",
  gunwValidated: "https://search.earthdata.nasa.gov/search?q=NISAR_L2_GUNW_V1",
  challenge: "https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/?tab=resources",
};

export const SOURCES = [
  { group: "Data portals", title: "NASA Earthdata Search", url: "https://search.earthdata.nasa.gov/search", note: "Observation discovery and downloads." },
  { group: "Data portals", title: "ASF Vertex", url: "https://search.asf.alaska.edu/", note: "SAR spatial and temporal acquisition search." },
  { group: "Data portals", title: "NISAR GCOV, provisional collection", url: PORTALS.gcovProvisional, note: "NISAR_L2_GCOV_PROVISIONAL_V1" },
  { group: "Data portals", title: "NISAR GUNW, provisional collection", url: PORTALS.gunwProvisional, note: "NISAR_L2_GUNW_PROVISIONAL_V1" },
  { group: "Data portals", title: "NISAR GCOV, validated collection", url: PORTALS.gcovValidated, note: "NISAR_L2_GCOV_V1" },
  { group: "Data portals", title: "NISAR GUNW, validated collection", url: PORTALS.gunwValidated, note: "NISAR_L2_GUNW_V1" },
  { group: "Data portals", title: "Space Apps 2026: Dancing with the SARs", url: PORTALS.challenge, note: "Challenge resources." },
  { group: "Technical documentation", title: "NISAR Data User Guide", url: "https://nisar-docs.asf.alaska.edu/", note: "Product specifications and tutorials." },
  { group: "Technical documentation", title: "ASF GCOV Product Guide", url: "https://nisar-docs.asf.alaska.edu/gcov/", note: "Terrain-corrected gamma-nought; actual channels and layers." },
  { group: "Technical documentation", title: "ASF GUNW Product Guide", url: "https://nisar-docs.asf.alaska.edu/gunw/", note: "Unwrapped phase, coherence, corrections." },
  { group: "Technical documentation", title: "ASF Data Availability Overview", url: "https://nisar-docs.asf.alaska.edu/availability-overview/", note: "2026 date ranges, releases and the data gap." },
  { group: "Technical documentation", title: "ASF earthaccess guide", url: "https://nisar-docs.asf.alaska.edu/earthaccess/", note: "Authentication and HTTPS links." },
  { group: "Technical documentation", title: "ASF Harmony guide", url: "https://nisar-docs.asf.alaska.edu/harmony/", note: "Variable extraction and subsetting to COG." },
  { group: "Technical documentation", title: "ASF GDAL guide", url: "https://nisar-docs.asf.alaska.edu/gdal/", note: "Authenticated HDF5 access." },
  { group: "Learning", title: "NASA Intro to SAR", url: "https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar", note: "Roughness, wavelength, scattering." },
  { group: "Learning", title: "NASA ARSET training", url: "https://appliedsciences.nasa.gov/get-involved/training", note: "Remote sensing and disaster training." },
  { group: "Learning", title: "NISAR StoryMaps", url: "https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/", note: "Educational applications." },
  { group: "Learning", title: "NISAR applications white papers", url: "https://nisar.jpl.nasa.gov/applications/societal-benefit/", note: "Societal-use evidence." },
  { group: "Learning", title: "UAVSAR postcards", url: "https://uavsar.jpl.nasa.gov/education/postcards.html", note: "Radar visualisation for education." },
  { group: "Learning", title: "CSA SAR Python tutorial", url: "https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial", note: "Code reference, not Ahmedabad pixels." },
  { group: "Historical research (citation only, not NISAR measurements)", title: "Pandit et al. (2025), Mapping Land Subsidence in Ahmedabad City, ISPRS Annals", url: "https://doi.org/10.5194/isprs-annals-X-G-2025-613-2025", note: "Sentinel-1, ~2020–2023. Historical context only." },
  { group: "Historical research (citation only, not NISAR measurements)", title: "Zhu et al. (2026), Vertical Land Motion and Human Exposure Across India's Coastal Regions, GRL", url: "https://doi.org/10.1029/2025GL120539", note: "Historical context only." },
];
