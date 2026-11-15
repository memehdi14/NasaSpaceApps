import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AOI, AVAILABLE_GCOV, GCOV_DATES, GUNW_PAIRS, LENSES, formatDate, lensById } from "../config.js";
import { DEFAULT_PARAMS, buildLayer, defaultRefs, waterAreaSeries } from "../layers.js";
import { inspectPixel } from "../inspector.js";
import { moduleAvailability } from "../manifest.js";
import { inAoi, searchLocal, searchNominatim } from "../search.js";
import { cellIndexAt, getStatic, pixelId } from "../synthetic.js";
import { BrandMark, Check, Legend, ProvBadge, Segmented, Slider, downloadJson } from "./Common.jsx";
import { MapView } from "./MapView.jsx";
import { ProvenanceModal } from "./Modals.jsx";
import { DataGapNotice, IntervalDisplay, TimeSeriesChart, WhatYouSee } from "./Panels.jsx";
import { ConnectionsView } from "./ConnectionsView.jsx";

const LENS_ICONS = {
  floodghost: <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />,
  "river-memory": <path d="M5 3c4 3-2 6 2 9s-2 6 2 9M15 3c4 3-2 6 2 9s-2 6 2 9" />,
  "ground-zero": <path d="M3 8h18M3 13c3 0 4 3 9 3s6-3 9-3M8 3v5M12 3v5M16 3v5" />,
  "surface-change": <path d="M4 21V9h5v12M10 21V4h5v17M16 21v-8h4v8M3 21h18" />,
  connections: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
};

const LensIcon = ({ id }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {LENS_ICONS[id]}
  </svg>
);

const VARIABLE_PATHS = {
  floodghost: "/science/LSAR/GCOV/grids/frequencyA/HHHH",
  "river-memory": "/science/LSAR/GCOV/grids/frequencyA/HHHH",
  "surface-change": "/science/LSAR/GCOV/grids/frequencyA/{HHHH|HVHV}",
  "ground-zero": "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH/unwrappedPhase",
};

const readUrl = () => {
  const m = new URLSearchParams(window.location.search).get("module");
  return LENSES.some((l) => l.id === m) ? m : "floodghost";
};

// Acquisition dates directly followed by a missing slot (the ASF data gap).
const GAP_START_DATES = GCOV_DATES.filter((d, k) => !d.gap && GCOV_DATES[k + 1]?.gap).map((d) => d.date);

export function Explorer({ manifest, arrivedFromGlobe, onGlobe, onOpenStory, onOpenScience, onOpenSources }) {
  const [module, setModule] = useState(readUrl);
  const [params, setParams] = useState(() => ({ ...DEFAULT_PARAMS, refs: defaultRefs() }));
  const [dataMode, setDataMode] = useState("demo");
  const [selected, setSelected] = useState(null);
  const [arm, setArm] = useState("A");
  const [swipePos, setSwipePos] = useState(0.5);
  const [layersOn, setLayersOn] = useState({ data: true, unknown: true, aoi: true, river: false, places: true });
  const [basemap, setBasemap] = useState("satellite");
  const [pickRef, setPickRef] = useState(false);
  const [sheet, setSheet] = useState("peek"); // mobile bottom sheet: peek | open | tall
  const [provOpen, setProvOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState(null);
  const [searchMarker, setSearchMarker] = useState(null);

  const lens = lensById(module);
  const availability = useMemo(() => moduleAvailability(manifest?.data), [manifest]);
  const nasaMode = dataMode === "nasa";
  const unavailable = nasaMode && !availability[module];
  const set = useCallback((patch) => setParams((p) => ({ ...p, ...patch })), []);

  useEffect(() => {
    document.title = `${lens.name}, Earth Pulse Ahmedabad`;
    const q = new URLSearchParams(window.location.search);
    q.set("module", module);
    window.history.replaceState({}, "", `/explorer?${q.toString()}`);
  }, [module, lens.name]);

  useEffect(() => {
    if (module !== "ground-zero") setPickRef(false);
  }, [module]);

  // Keep date B strictly after date A for every comparison view.
  useEffect(() => {
    if (params.dateA < params.dateB) return;
    const next = AVAILABLE_GCOV.find((d) => d.date > params.dateA);
    if (next) set({ dateB: next.date });
    else {
      const prev = [...AVAILABLE_GCOV].reverse().find((d) => d.date < params.dateA);
      if (prev) set({ dateA: prev.date, dateB: params.dateA });
    }
  }, [params.dateA, params.dateB, set]);

  // ---------- derived layer and evidence ----------
  const layer = useMemo(() => {
    if (module === "connections" || unavailable || params.dateA >= params.dateB) return null;
    return buildLayer(module, { ...params, alpha: Math.round(params.opacity * 255) });
  }, [module, params, unavailable]);

  const series = useMemo(() => (module === "river-memory" ? waterAreaSeries(params.tau, params.speckle) : null), [module, params.tau, params.speckle]);

  const evidence = useMemo(() => {
    if (selected == null || module === "connections" || unavailable) return null;
    return inspectPixel(module, params, selected);
  }, [selected, module, params, unavailable]);

  const popupFor = useCallback(
    (i) => {
      if (module === "connections" || unavailable) return null;
      const ev = inspectPixel(module, params, i);
      return { rows: [["Pixel ID", ev.id], ...ev.popup], note: "Illustrative demo value, not a NISAR measurement" };
    },
    [module, params, unavailable],
  );

  const onPick = useCallback(
    (i, mode) => {
      if (mode === "ref") {
        const comp = getStatic().component[i];
        set({ refs: { ...params.refs, [comp]: i } });
        setPickRef(false);
        return;
      }
      setSelected(i);
      setSheet((s) => (s === "peek" ? "open" : s));
    },
    [params.refs, set],
  );

  // ---------- dates ----------
  const assignDate = (date) => {
    let a = params.dateA;
    let b = params.dateB;
    if (arm === "A") a = date;
    else b = date;
    if (a === b) return;
    if (a > b) [a, b] = [b, a];
    set({ dateA: a, dateB: b });
    setArm(arm === "A" ? "B" : "A");
  };
  const maturityA = AVAILABLE_GCOV.find((d) => d.date === params.dateA)?.maturity;
  const maturityB = AVAILABLE_GCOV.find((d) => d.date === params.dateB)?.maturity;
  const mixedMaturity = Boolean(maturityA && maturityB && maturityA !== maturityB);
  const pair = GUNW_PAIRS.find((p) => p.id === params.gzPair) || GUNW_PAIRS[0];

  // ---------- place search (inside the AOI) ----------
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [hitIdx, setHitIdx] = useState(-1);
  const [searchNote, setSearchNote] = useState("");
  const pickedRef = useRef("");
  useEffect(() => {
    const term = q.trim();
    setSearchNote("");
    if (term.length < 2 || term === pickedRef.current) {
      setHits([]);
      return undefined;
    }
    const local = searchLocal(term, 6);
    setHits(local);
    setHitIdx(-1);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const remote = await searchNominatim(`${term}, Ahmedabad`, { bounded: true, signal: ctrl.signal });
        const seen = new Set(local.map((r) => r.name.toLowerCase()));
        const merged = [...local, ...remote.filter((r) => inAoi(r.lat, r.lng) && !seen.has(r.name.toLowerCase()))].slice(0, 7);
        setHits(merged);
        if (merged.length === 0) setSearchNote("No match inside the study area.");
      } catch (err) {
        if (err.name !== "AbortError" && local.length === 0) setSearchNote("No offline match, and online search is unavailable.");
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const goTo = (r) => {
    pickedRef.current = r.name;
    setQ(r.name);
    setHits([]);
    setSearchNote("");
    setFlyTarget({ lng: r.lng, lat: r.lat, zoom: 14, t: Date.now() });
    setSearchMarker(r);
    const i = cellIndexAt(r.lng, r.lat);
    if (i >= 0) setSelected(i);
  };
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHitIdx((x) => Math.min(hits.length - 1, x + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHitIdx((x) => Math.max(0, x - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = hits[hitIdx >= 0 ? hitIdx : 0];
      if (h) goTo(h);
    } else if (e.key === "Escape") setHits([]);
  };

  // ---------- provenance + exports ----------
  const provenance = useMemo(() => {
    if (module === "connections") return null;
    const gunw = module === "ground-zero";
    return {
      layer_id: `demo-${module}-${gunw ? `${pair.reference}_${pair.secondary}` : `${params.dateA}_${params.dateB}`}`,
      aoi_id: AOI.id,
      status: "ILLUSTRATIVE",
      product: gunw ? "NISAR_L2_GUNW_PROVISIONAL_V1 (schema only)" : "NISAR_L2_GCOV_PROVISIONAL_V1 (schema only)",
      granule_id: null,
      nasa_https_url: null,
      acquisition_times_utc: gunw ? [`${pair.reference}T00:41Z`, `${pair.secondary}T00:41Z`] : [`${params.dateA}T00:41Z`, `${params.dateB}T00:41Z`],
      variable_path: `${VARIABLE_PATHS[module]} (demo mapping)`,
      projection_epsg: 4326,
      processing: "Browser synthetic generator, src/earth-pulse/synthetic.js (seeded)",
      input_pixel_masks: ["NaN", "non-positive power", "layover/shadow (synthetic)", gunw ? "decorrelated water" : "fill values"],
      valid_pixel_fraction: layer ? Array.from(layer.values).filter((v) => Number.isFinite(v)).length / layer.values.length : null,
      limitations: ["Synthetic demo data. Not a NASA observation.", "Replace with QC_ACCEPTED COGs from the pipeline before any claim."],
      source_license: "Not applicable (synthetic)",
    };
  }, [module, pair, params.dateA, params.dateB, layer]);

  const exportRiver = () => {
    const st = layer?.stats;
    downloadJson(`river-memory-${params.dateA}_${params.dateB}.json`, {
      export_type: "RIVER_MEMORY_EVIDENCE",
      data_status: "ILLUSTRATIVE",
      aoi: AOI.id,
      date_1: params.dateA,
      date_2: params.dateB,
      source_granule_1: "NOT_VERIFIED",
      source_granule_2: "NOT_VERIFIED",
      polarization: "HH",
      threshold_dB: params.tau,
      threshold_procedure: "user-set slider over histogram (demo)",
      speckle_filter: params.speckle ? "3x3 boxcar in linear power" : "none",
      persistent_water_km2: st ? Number(st.persistent.toFixed(3)) : null,
      new_water_km2: st ? Number(st.newWater.toFixed(3)) : null,
      lost_water_km2: st ? Number(st.lost.toFixed(3)) : null,
      unknown_fraction: st ? Number(st.unknownFraction.toFixed(4)) : null,
      boundary_uncertainty_note: "Positional uncertainty about one demo pixel (~200 m). Changes smaller than a pixel cannot be confirmed.",
      caveat: "Candidate water classification only. Not independently verified. Synthetic demo data.",
    });
  };

  const exportPixel = () => {
    if (!evidence) return;
    const { refs, ...rest } = params;
    downloadJson(`${evidence.id}-${module}-evidence.json`, {
      export_type: "PIXEL_EVIDENCE",
      data_status: "ILLUSTRATIVE",
      module,
      pixel_id: evidence.id,
      location: { lat: evidence.lat, lon: evidence.lng },
      parameters: { ...rest, reference_pixels: { west: pixelId(refs[1]), east: pixelId(refs[2]) } },
      values: Object.fromEntries(evidence.rows),
      explanation: evidence.quote,
      provenance,
    });
  };

  // ---------- render ----------
  const swipe =
    module === "river-memory" && params.rmSwipe && !unavailable
      ? { pos: swipePos, onChange: setSwipePos, leftLabel: `A ${params.dateA}`, rightLabel: `B ${params.dateB}` }
      : null;
  const refPoints = module === "ground-zero" ? [params.refs[1], params.refs[2]] : null;
  const showsPairDates = module === "ground-zero";
  const singleDateView = module === "floodghost" && (params.fgView === "backscatter" || params.fgView === "water");

  const pickLens = (id) => {
    setModule(id);
    setSelected(null);
  };

  return (
    <div className={`ep ep-explorer ${arrivedFromGlobe ? "is-arriving" : ""}`} style={{ "--lens-color": lens.color }}>
      <header className="ep-topbar">
        <button type="button" className="ep-wordmark ep-wordmark--btn" onClick={onGlobe} aria-label="Back to the globe">
          <BrandMark />
          <span>
            <strong>Earth Pulse, Ahmedabad</strong>
            <em>NISAR evidence explorer</em>
          </span>
        </button>
        <div className="ep-place-search" role="search">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <label htmlFor="ep-place-q" className="ep-sr">Search a location in Ahmedabad</label>
          <input
            id="ep-place-q"
            type="search"
            placeholder="Search a location in Ahmedabad"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            onBlur={() => setTimeout(() => setHits([]), 150)}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="ep-place-results"
          />
          {hits.length > 0 || searchNote ? (
            <ul id="ep-place-results" role="listbox">
              {hits.map((h, k) => (
                <li
                  key={h.id}
                  role="option"
                  aria-selected={k === hitIdx}
                  className={k === hitIdx ? "is-active" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    goTo(h);
                  }}
                >
                  <span>{h.name}</span>
                  <small>{h.source === "local" ? h.detail : "Map search"}</small>
                </li>
              ))}
              {hits.length === 0 && searchNote ? <li className="ep-empty">{searchNote}</li> : null}
            </ul>
          ) : null}
        </div>
        <nav className="ep-tabs" aria-label="Sections">
          <button type="button" onClick={onOpenStory}>Story</button>
          <button type="button" aria-current="page">Explorer</button>
          <button type="button" onClick={onOpenScience}>Science</button>
          <button type="button" onClick={onOpenSources}>Sources</button>
        </nav>
        <div className="ep-topbar-right">
          <div className="ep-mode-toggle" role="group" aria-label="Data mode">
            <button type="button" aria-pressed={!nasaMode} onClick={() => setDataMode("demo")}>Demo data</button>
            <button type="button" aria-pressed={nasaMode} onClick={() => setDataMode("nasa")}>NASA verified</button>
          </div>
        </div>
      </header>

      {nasaMode ? (
        <div className={`ep-banner ${manifest.status === "VERIFIED" ? "is-verified" : ""}`} role="status">
          <strong>NASA verified mode.</strong>
          <span>
            {manifest.status === "VERIFIED"
              ? "Every lens reads QC-accepted NASA layers from the manifest."
              : "No Ahmedabad NISAR granule is authenticated in the manifest yet, so lenses without verified data show what is missing instead of a map."}
          </span>
          <button type="button" onClick={onOpenSources}>Why?</button>
        </div>
      ) : (
        <div className="ep-banner" role="status">
          <strong>Proposed interface.</strong>
          <span>Map layers are illustrative synthetic data, not measured NISAR observations.</span>
          <button type="button" onClick={() => setDataMode("nasa")}>Show verified data only</button>
        </div>
      )}

      <div className="ep-main">
        <aside className="ep-rail" aria-label="Lenses">
          <div>
            <h2 className="ep-rail-title">Lenses</h2>
            <ul className="ep-lens-list">
              {LENSES.map((l) => {
                const off = nasaMode && !availability[l.id];
                return (
                  <li key={l.id}>
                    <button type="button" className="ep-lens" aria-pressed={module === l.id} style={{ "--lens-color": l.color }} onClick={() => pickLens(l.id)}>
                      <span className="ep-lens-icon"><LensIcon id={l.id} /></span>
                      <span>
                        <span className="ep-lens-name">{l.title}</span>
                        <span className="ep-lens-q">{l.name}: {l.question}</span>
                        <span className={`ep-lens-state ${off ? "is-off" : ""}`}>{off ? `${l.product}: unavailable` : nasaMode ? `${l.product}: verified` : `${l.product}: demo data`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="ep-rail-card">
            <h3>Study area</h3>
            <dl>
              <dt>AOI</dt><dd>{AOI.id}</dd>
              <dt>Longitude</dt><dd>{AOI.west} to {AOI.east}°E</dd>
              <dt>Latitude</dt><dd>{AOI.south} to {AOI.north}°N</dd>
              <dt>Analysis CRS</dt><dd>{AOI.analysisCrs}</dd>
            </dl>
          </div>
          <div className="ep-rail-card">
            <h3>Source status</h3>
            <dl>
              <dt>GCOV</dt><dd className={availability.floodghost ? "tone-ok" : "tone-warn"}>{availability.floodghost ? "Verified" : "Not verified"}</dd>
              <dt>GUNW</dt><dd className={availability["ground-zero"] ? "tone-ok" : "tone-warn"}>{availability["ground-zero"] ? "Verified" : "Not verified"}</dd>
              <dt>Inventory</dt><dd>{manifest?.data?.inventory?.status || "UNSEARCHED"}</dd>
            </dl>
            <p>Granule IDs appear here only after the inventory script returns real NASA records.</p>
          </div>
        </aside>

        <nav className="ep-mobile-tabs" aria-label="Lenses">
          {LENSES.map((l) => (
            <button key={l.id} type="button" aria-pressed={module === l.id} style={{ "--lens-color": l.color }} onClick={() => pickLens(l.id)}>
              {l.name}
            </button>
          ))}
        </nav>

        <section className="ep-stage" aria-label={`${lens.title} map`}>
          {module === "connections" ? (
            <div className="ep-map-wrap">
              <ConnectionsView params={params} basemap={basemap} layersOn={layersOn} nasaMode={nasaMode} availability={availability} selected={selected} onSelect={setSelected} flyTarget={flyTarget} />
            </div>
          ) : (
            <MapView
              layer={layer}
              showData={layersOn.data}
              showUnknown={layersOn.unknown}
              showAoi={layersOn.aoi}
              showRiver={layersOn.river}
              showPlaces={layersOn.places}
              basemap={basemap}
              selected={selected}
              refPoints={refPoints}
              popupFor={popupFor}
              onPick={onPick}
              pickMode={pickRef ? "ref" : null}
              swipe={swipe}
              arriveFromGlobe={arrivedFromGlobe}
              flyTarget={flyTarget}
              searchMarker={searchMarker}
              label={`${lens.title} map of the Ahmedabad study area. Select a pixel to see its evidence.`}
            >
              {!unavailable ? (
                <div className="ep-map-badge">
                  <b>Illustrative</b> synthetic layer, not measured NISAR data. {layer?.describe ? `${layer.describe}.` : ""}
                </div>
              ) : null}
              {pickRef ? <div className="ep-map-badge ep-map-badge--pick">Click a pixel to make it the reference for its bank.</div> : null}
              {unavailable ? <DataGapNotice module={lens.name} product={lens.product} /> : null}
              {!unavailable && layer && layersOn.data ? (
                <div className="ep-map-legend">
                  <Legend
                    legend={
                      swipe
                        ? {
                            type: "classes",
                            title: `Swipe: ${params.swipeContent === "water" ? "candidate water" : "HH backscatter"}, A left, B right`,
                            items: [
                              params.swipeContent === "water" ? { color: "#36A9D6", label: `Candidate water on that side’s date` } : { color: "#A7BAC6", label: "Brighter grey is a stronger radar return" },
                              { color: "#3A3A3A", label: "Unknown or invalid", hatch: true },
                            ],
                          }
                        : layer.legend
                    }
                  />
                </div>
              ) : null}
            </MapView>
          )}

          <div className="ep-timeline">
            <div className="ep-timeline-head">
              {showsPairDates ? (
                <span>Select a date to choose the GUNW pair that starts there. Pair: {pair.reference} → {pair.secondary}</span>
              ) : singleDateView ? (
                <span>Select an acquisition to view it. Showing {formatDate(params.dateA)}</span>
              ) : (
                <>
                  <span>Set date</span>
                  <span className="ep-arm" role="group" aria-label="Which date to set">
                    <button type="button" aria-pressed={arm === "A"} onClick={() => setArm("A")}>A {params.dateA}</button>
                    <button type="button" aria-pressed={arm === "B"} onClick={() => setArm("B")}>B {params.dateB}</button>
                  </span>
                </>
              )}
              <button type="button" className="ep-link" onClick={onOpenScience}>Why are there gaps?</button>
            </div>
            <div className="ep-track" role="group" aria-label="Acquisition timeline">
              {GCOV_DATES.map((d) => {
                const isA = !showsPairDates && d.date === params.dateA;
                const isB = !showsPairDates && !singleDateView && d.date === params.dateB;
                const inPair = showsPairDates && (d.date === pair.reference || d.date === pair.secondary);
                const startsPair = GUNW_PAIRS.find((p) => p.reference === d.date);
                const disabled = Boolean(d.gap) || (showsPairDates && !startsPair);
                const title = d.gap
                  ? d.gap
                  : showsPairDates && !startsPair
                    ? `${formatDate(d.date)}: no GUNW pair starts here. Validated scenes are never paired with provisional ones.`
                    : `${formatDate(d.date)}, ${d.time} UTC, ${d.maturity.toLowerCase()}`;
                return (
                  <button
                    key={d.date}
                    type="button"
                    className={`ep-tick ${d.gap ? "is-gap" : ""} ${d.maturity === "VALIDATED" ? "is-validated" : ""} ${isA ? "is-a" : ""} ${isB ? "is-b" : ""} ${inPair ? "is-inpair" : ""}`}
                    aria-disabled={disabled}
                    title={title}
                    aria-label={title}
                    onClick={() => {
                      if (disabled) return;
                      if (showsPairDates) set({ gzPair: startsPair.id });
                      else if (singleDateView) set({ dateA: d.date });
                      else assignDate(d.date);
                    }}
                  >
                    <span className="ep-tick-mark">{isA ? "A" : isB ? "B" : inPair ? (d.date === pair.reference ? "ref" : "sec") : ""}</span>
                    <span className="ep-tick-dot" />
                    <span className="ep-tick-label">{d.date.slice(5)}</span>
                  </button>
                );
              })}
            </div>
            <div className="ep-timeline-foot">
              <span><i style={{ background: "#A7BAC6" }} />Provisional</span>
              <span><i style={{ background: "#3aaf72" }} />Validated</span>
              <span><i style={{ border: "1.5px dashed #6f8ea2" }} />No acquisition (ASF gap)</span>
              <span>12-day repeat, demo calendar, 2026</span>
            </div>
          </div>
        </section>

        <aside className={`ep-panel ${sheet === "open" ? "is-open" : sheet === "tall" ? "is-open is-tall" : ""}`} aria-label="Evidence panel">
          <button type="button" className="ep-sheet-toggle" onClick={() => setSheet((s) => (s === "peek" ? "open" : s === "open" ? "tall" : "peek"))} aria-expanded={sheet !== "peek"}>
            <span>{evidence ? `${evidence.id}: ${evidence.headline}` : `${lens.name} settings and evidence`}</span>
            <span aria-hidden="true">{sheet === "tall" ? "▾" : "▴"}</span>
          </button>

          {module === "connections" ? (
            <ConnectionsSide params={params} set={set} selected={selected} />
          ) : (
            <>
              <section className="ep-sec">
                <h3>Layers</h3>
                <div className="ep-stack" style={{ gap: 2 }}>
                  <Check label={`${lens.title} layer`} checked={layersOn.data} onChange={(v) => setLayersOn((s) => ({ ...s, data: v }))} />
                  <Check label="Unknown and invalid pixels" hint="Hatched grey. Never drawn as zero." checked={layersOn.unknown} onChange={(v) => setLayersOn((s) => ({ ...s, unknown: v }))} />
                  <Check label="Study area outline" checked={layersOn.aoi} onChange={(v) => setLayersOn((s) => ({ ...s, aoi: v }))} />
                  <Check label="Sabarmati centreline" hint="Editorial line, not a surveyed boundary." checked={layersOn.river} onChange={(v) => setLayersOn((s) => ({ ...s, river: v }))} />
                  <Check label="Place labels" checked={layersOn.places} onChange={(v) => setLayersOn((s) => ({ ...s, places: v }))} />
                </div>
                <div className="ep-stack" style={{ marginTop: 10 }}>
                  <Segmented
                    name="basemap"
                    label="Basemap"
                    value={basemap}
                    onChange={setBasemap}
                    options={[
                      { value: "satellite", label: "Satellite context", title: "Esri World Imagery, context only, not NISAR" },
                      { value: "none", label: "None, data only" },
                    ]}
                  />
                  <Slider id="ep-opacity" label="Layer opacity" value={params.opacity} min={0.2} max={1} step={0.05} onChange={(v) => set({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
                </div>
              </section>

              {unavailable ? null : (
                <ModuleControls module={module} params={params} set={set} pickRef={pickRef} setPickRef={setPickRef} pair={pair} layer={layer} mixedMaturity={mixedMaturity} series={series} exportRiver={exportRiver} />
              )}

              <section className="ep-sec">
                <h3>
                  {evidence ? "Pixel inspector" : "What you see"} <ProvBadge kind={unavailable ? "UNAVAILABLE" : "ILLUSTRATIVE"} />
                </h3>
                {unavailable ? (
                  <>
                    <p>This lens is unavailable in NASA verified mode. The API contract returns:</p>
                    <code className="ep-code">
                      {JSON.stringify({ aoi_id: AOI.id, module, dataset_status: "UNAVAILABLE", measurements: [], reason: `No Ahmedabad ${lens.product} data has been authenticated and quality-screened yet` }, null, 2)}
                    </code>
                  </>
                ) : evidence ? (
                  <PixelEvidence evidence={evidence} module={module} onClear={() => setSelected(null)} onExport={exportPixel} />
                ) : (
                  <>
                    <WhatYouSee module={module} />
                    <p className="ep-empty-cta" style={{ marginTop: 12 }}>Select any pixel on the map to see its evidence.</p>
                  </>
                )}
              </section>

              {!unavailable && provenance ? (
                <section className="ep-sec">
                  <h3>Data source</h3>
                  <dl className="ep-kv">
                    <dt>Collection</dt><dd>{module === "ground-zero" ? "NISAR_L2_GUNW_PROVISIONAL_V1" : "NISAR_L2_GCOV_PROVISIONAL_V1"}</dd>
                    <dt>Granule</dt><dd>NOT VERIFIED</dd>
                    <dt>Acquired</dt><dd>{provenance.acquisition_times_utc.map((t) => t.slice(0, 10)).join(" → ")}</dd>
                    <dt>Variable</dt><dd>{VARIABLE_PATHS[module]}</dd>
                  </dl>
                  <div className="ep-actions">
                    <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={() => setProvOpen(true)}>View provenance</button>
                    <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={() => downloadJson(`${provenance.layer_id}-proof.json`, provenance)}>Download proof JSON</button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </aside>
      </div>
      {provOpen && provenance ? <ProvenanceModal record={provenance} demo onClose={() => setProvOpen(false)} /> : null}
    </div>
  );
}

function ModuleControls({ module, params, set, pickRef, setPickRef, pair, layer, mixedMaturity, series, exportRiver }) {
  const mixedWarn = mixedMaturity ? (
    <p className="ep-warn">Date A and date B come from different releases (provisional and validated). Differences may reflect processing, not the ground.</p>
  ) : null;

  if (module === "floodghost") {
    const compare = params.fgView === "vegflood" || params.fgView === "persistence";
    return (
      <section className="ep-sec">
        <h3>Analysis settings</h3>
        <div className="ep-stack">
          <Segmented
            name="fgview"
            label="Show"
            value={params.fgView}
            onChange={(v) => set({ fgView: v })}
            options={[
              { value: "water", label: "Water candidate" },
              { value: "backscatter", label: "Raw backscatter" },
              { value: "vegflood", label: "Double-bounce" },
              { value: "persistence", label: "Persistence" },
            ]}
          />
          {params.fgView === "backscatter" ? (
            <Segmented
              name="pol"
              label="Polarisation"
              value={params.pol}
              onChange={(v) => set({ pol: v })}
              options={[
                { value: "HH", label: "HH" },
                { value: "HV", label: "HV" },
                { value: "VV", label: "VV", disabled: true, title: "VV is not present in this acquisition's metadata" },
              ]}
            />
          ) : (
            <p className="ep-hint">Water candidates use HH. VV is disabled because it is not present in this acquisition.</p>
          )}
          <Slider id="ep-tau" label="Water threshold τ" value={params.tau} min={-25} max={-10} step={0.5} onChange={(v) => set({ tau: v })} format={(v) => `${v.toFixed(1)} dB`} hint="Pixels darker than τ become water candidates. Choose it from the histogram, not as a universal value." />
          <Check label="3×3 speckle filter" hint="Boxcar in linear power. It also blurs narrow channels." checked={params.speckle} onChange={(v) => set({ speckle: v })} />
          {compare ? (
            <p className="ep-hint">
              Uses dates A and B from the timeline{params.fgView === "persistence" ? ", plus every valid date between them" : ""}: {params.dateA} → {params.dateB}.
            </p>
          ) : null}
          {compare ? mixedWarn : null}
        </div>
      </section>
    );
  }

  if (module === "river-memory") {
    const st = layer?.stats;
    const pts = (series || []).map((s) => ({ date: s.date, value: s.areaKm2, validated: s.maturity === "VALIDATED" }));
    return (
      <>
        <section className="ep-sec">
          <h3>Analysis settings</h3>
          <div className="ep-stack">
            <Slider id="ep-tau-rm" label="Water threshold τ" value={params.tau} min={-25} max={-10} step={0.5} onChange={(v) => set({ tau: v })} format={(v) => `${v.toFixed(1)} dB`} />
            <Check label="3×3 speckle filter" checked={params.speckle} onChange={(v) => set({ speckle: v })} />
            <Check label="Swipe to compare date A and date B" hint="Drag the divider or focus it and use the arrow keys." checked={params.rmSwipe} onChange={(v) => set({ rmSwipe: v })} />
            {params.rmSwipe ? (
              <Segmented name="swipec" label="Swipe shows" value={params.swipeContent} onChange={(v) => set({ swipeContent: v })} options={[{ value: "water", label: "Water masks" }, { value: "backscatter", label: "Raw backscatter" }]} />
            ) : null}
            {mixedWarn}
          </div>
        </section>
        <section className="ep-sec">
          <h3>Change summary <small>{params.dateA} → {params.dateB}</small></h3>
          {st ? (
            <dl className="ep-kv">
              <dt>Persistent water</dt><dd>{st.persistent.toFixed(2)} km²</dd>
              <dt>Water on A only</dt><dd>{st.lost.toFixed(2)} km²</dd>
              <dt>Water on B only</dt><dd>{st.newWater.toFixed(2)} km²</dd>
              <dt>Unknown pixels</dt><dd>{(st.unknownFraction * 100).toFixed(1)}%</dd>
            </dl>
          ) : null}
          <p className="ep-quote">A new water signature is not necessarily permanent riverbank erosion. Changed boundaries need multiple dates and independent evidence.</p>
          <h3 style={{ marginTop: 14 }}>Candidate water area by date</h3>
          <TimeSeriesChart points={pts} unit="km²" highlight={[params.dateA, params.dateB]} gapAfter={GAP_START_DATES} label="Candidate water area at each acquisition date" />
          <p className="ep-caption">Area classified as candidate water at each observed date, not a continuous daily measurement. The dashed segment crosses the ASF data gap.</p>
          <div className="ep-actions">
            <button type="button" className="ep-btn ep-btn--primary ep-btn--small" onClick={exportRiver}>Export change evidence</button>
          </div>
        </section>
      </>
    );
  }

  if (module === "ground-zero") {
    return (
      <>
        <section className="ep-sec">
          <h3>GUNW interval</h3>
          <div className="ep-field" style={{ marginBottom: 10 }}>
            <label htmlFor="ep-pair">Pair</label>
            <select id="ep-pair" value={params.gzPair} onChange={(e) => set({ gzPair: e.target.value })}>
              {GUNW_PAIRS.map((p) => (
                <option key={p.id} value={p.id}>{p.reference} → {p.secondary} ({p.days} d)</option>
              ))}
            </select>
          </div>
          <IntervalDisplay pair={pair} />
        </section>
        <section className="ep-sec">
          <h3>Evidence settings</h3>
          <div className="ep-stack">
            <Segmented
              name="gzstat"
              label="Statistic"
              value={params.gzStat}
              onChange={(v) => set({ gzStat: v })}
              options={[
                { value: "pair", label: "Pair LOS (mm)" },
                { value: "cumulative", label: "Cumulative (mm)" },
                { value: "velocity", label: "Rate (mm/yr)", disabled: GUNW_PAIRS.length < 2, title: `Weighted fit across ${GUNW_PAIRS.length} chained pairs` },
                { value: "coherence", label: "Coherence" },
              ]}
            />
            {params.gzStat === "velocity" ? (
              <p className="ep-warn">
                Interval-average rate fitted across {GUNW_PAIRS.length} chained pairs ({GUNW_PAIRS[0].reference} to {GUNW_PAIRS[GUNW_PAIRS.length - 1].secondary}). Four months of data is not a long-term subsidence trend.
              </p>
            ) : null}
            <Check label="Apply ionospheric correction" hint="The GUNW correction layer is not applied by default. Applied once, never twice." checked={params.applyIono} onChange={(v) => set({ applyIono: v })} />
          </div>
        </section>
        <section className="ep-sec">
          <h3>Quality filters</h3>
          <div className="ep-stack">
            <Slider id="ep-coh" label="Coherence (min)" value={params.cohMin} min={0.1} max={0.9} step={0.05} onChange={(v) => set({ cohMin: v })} format={(v) => v.toFixed(2)} hint={params.gzStat === "pair" ? "Coherence of the selected pair." : "Mean coherence across pairs."} />
            <Slider id="ep-cons" label="Temporal consistency (min)" value={params.consMin} min={0} max={1} step={0.05} onChange={(v) => set({ consMin: v })} format={(v) => v.toFixed(2)} hint="Share of pairs in which the pixel stays coherent (γ ≥ 0.3)." />
            <Slider id="ep-r2" label="Rate fit R² (min)" value={params.r2Min} min={0} max={0.95} step={0.05} onChange={(v) => set({ r2Min: v })} format={(v) => v.toFixed(2)} hint={params.gzStat === "velocity" ? "Hides rates a straight line explains poorly." : "Applies to the rate statistic only."} />
          </div>
        </section>
        <section className="ep-sec">
          <h3>Reference pixels</h3>
          <p>Displacement is relative. Each connected component (west bank, east bank) gets its own reference, shown as amber rings.</p>
          <dl className="ep-kv">
            <dt>West bank</dt><dd>{pixelId(params.refs[1])}</dd>
            <dt>East bank</dt><dd>{pixelId(params.refs[2])}</dd>
          </dl>
          <div className="ep-actions">
            <button type="button" className={`ep-btn ep-btn--small ${pickRef ? "ep-btn--primary" : "ep-btn--ghost"}`} onClick={() => setPickRef(!pickRef)} aria-pressed={pickRef}>
              {pickRef ? "Cancel picking" : "Pick a reference pixel"}
            </button>
            <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={() => set({ refs: defaultRefs() })}>Reset references</button>
          </div>
        </section>
      </>
    );
  }

  if (module === "surface-change") {
    const st = layer?.stats;
    return (
      <section className="ep-sec">
        <h3>Analysis settings <small>{params.dateA} → {params.dateB}</small></h3>
        <div className="ep-stack">
          <Segmented name="pol-sc" label="Polarisation" value={params.pol} onChange={(v) => set({ pol: v })} options={[{ value: "HH", label: "HH" }, { value: "HV", label: "HV" }, { value: "VV", label: "VV", disabled: true, title: "Not present in this acquisition" }]} />
          <Slider id="ep-sc" label="Change threshold" value={params.scThresh} min={1} max={8} step={0.5} onChange={(v) => set({ scThresh: v })} format={(v) => `±${v.toFixed(1)} dB`} hint="Smaller changes are hidden as within noise." />
          {st ? (
            <dl className="ep-kv">
              <dt>Brightened area</dt><dd>{st.brighterKm2.toFixed(2)} km²</dd>
              <dt>Darkened area</dt><dd>{st.darkerKm2.toFixed(2)} km²</dd>
            </dl>
          ) : null}
          {mixedWarn}
          <p className="ep-hint">Pixels that are water on either date are excluded so open-water changes do not read as urban growth.</p>
        </div>
      </section>
    );
  }
  return null;
}

const ALTS = {
  floodghost: ["Radar shadow behind tall buildings or embankments", "Smooth tarmac, runways or rooftops", "Wind roughening water so it looks brighter", "Wet soil without standing water"],
  "river-memory": ["Barrage releases changing water level", "Seasonal wet margins rather than channel movement", "Vegetation growth on banks", "Geolocation error of about one pixel"],
  "ground-zero": ["Tropospheric delay differing between dates", "Ionospheric phase not fully removed", "Phase unwrapping error inside a component", "Seasonal swelling and shrinking of clay soils", "Horizontal motion projected into line of sight"],
  "surface-change": ["Soil moisture after rain", "Crop growth or harvest", "Viewing geometry or processing release differences", "Temporary structures or stockpiles"],
};

function PixelEvidence({ evidence, module, onClear, onExport }) {
  let chart = null;
  if (module === "ground-zero" && evidence.series) {
    const s = evidence.series;
    const pts = s.dates.map((d, k) => ({ date: d, value: s.values[k] }));
    const fit = Number.isFinite(evidence.fit?.slope)
      ? { y0: evidence.fit.intercept, y1: evidence.fit.intercept + evidence.fit.slope * s.days[s.days.length - 1] }
      : null;
    chart = (
      <>
        <h3 style={{ marginTop: 14 }}>Cumulative LOS at this pixel</h3>
        <TimeSeriesChart points={pts} unit="mm" fit={fit} highlight={[evidence.pair?.reference, evidence.pair?.secondary]} gapAfter={GAP_START_DATES} label="Cumulative line-of-sight displacement at each acquisition date" />
        <p className="ep-caption">Points at real pair dates only. Dashed amber line: weighted fit with coherence² weights. Dashed grey: the 24-day pair across the ASF data gap.</p>
      </>
    );
  }
  return (
    <div>
      <dl className="ep-kv">
        <dt>Pixel ID</dt><dd>{evidence.id}</dd>
        <dt>Location</dt><dd>{evidence.location}</dd>
      </dl>
      <div className="ep-big">{evidence.headline}</div>
      <dl className="ep-kv">
        {evidence.rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="ep-quote">{evidence.quote}</p>
      {chart}
      <h3 style={{ marginTop: 14 }}>Other explanations to rule out</h3>
      <ul className="ep-list">
        {(ALTS[module] || []).map((a) => <li key={a}>{a}</li>)}
      </ul>
      <div className="ep-actions">
        <button type="button" className="ep-btn ep-btn--primary ep-btn--small" onClick={onExport}>Download evidence JSON</button>
        <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={onClear}>Clear selection</button>
      </div>
    </div>
  );
}

function ConnectionsSide({ params, set, selected }) {
  const [note, setNote] = useState(() => {
    try {
      return window.localStorage.getItem("ep-hypothesis-note") || "";
    } catch {
      return "";
    }
  });
  const save = (v) => {
    setNote(v);
    try {
      window.localStorage.setItem("ep-hypothesis-note", v);
    } catch {
      /* storage unavailable: keep the note in memory only */
    }
  };
  const rec = useMemo(() => {
    if (selected == null) return null;
    return {
      water: inspectPixel("river-memory", params, selected),
      flood: inspectPixel("floodghost", { ...params, fgView: "water" }, selected),
      ground: inspectPixel("ground-zero", { ...params, gzStat: "pair" }, selected),
      surface: inspectPixel("surface-change", params, selected),
    };
  }, [selected, params]);
  const pair = GUNW_PAIRS.find((p) => p.id === params.gzPair) || GUNW_PAIRS[0];
  const aligned = params.dateA === pair.reference && params.dateB === pair.secondary;
  return (
    <>
      <section className="ep-sec">
        <h3>Time windows</h3>
        <div className="ep-stack">
          <div className="ep-field">
            <label htmlFor="ep-cA">Water date A</label>
            <select id="ep-cA" value={params.dateA} onChange={(e) => set({ dateA: e.target.value })}>
              {AVAILABLE_GCOV.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
            </select>
          </div>
          <div className="ep-field">
            <label htmlFor="ep-cB">Water date B</label>
            <select id="ep-cB" value={params.dateB} onChange={(e) => set({ dateB: e.target.value })}>
              {AVAILABLE_GCOV.filter((d) => d.date > params.dateA).map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
            </select>
          </div>
          <div className="ep-field">
            <label htmlFor="ep-cP">Ground pair</label>
            <select id="ep-cP" value={params.gzPair} onChange={(e) => set({ gzPair: e.target.value })}>
              {GUNW_PAIRS.map((p) => <option key={p.id} value={p.id}>{p.reference} → {p.secondary}</option>)}
            </select>
          </div>
          {aligned ? (
            <p className="ep-hint">Both lenses cover the same interval.</p>
          ) : (
            <p className="ep-warn">Observed during different time windows: water {params.dateA} → {params.dateB}, ground {pair.reference} → {pair.secondary}.</p>
          )}
        </div>
      </section>
      <section className="ep-sec">
        <h3>Evidence record <ProvBadge kind="ILLUSTRATIVE" /></h3>
        {rec ? (
          <dl className="ep-kv">
            <dt>Pixel</dt><dd>{rec.water.id}</dd>
            <dt>Location</dt><dd>{rec.water.location}</dd>
            <dt>Water on {params.dateA}</dt><dd>{rec.flood.rows[4][1]}</dd>
            <dt>Water change</dt><dd>{rec.water.headline}</dd>
            <dt>Surface change</dt><dd>{rec.surface.headline}</dd>
            <dt>LOS, {pair.days} days</dt>
            <dd>{rec.ground.headline === "Decorrelated" ? `No observation during ${pair.reference} → ${pair.secondary}` : rec.ground.rows[0][1]}</dd>
            <dt>Coherence</dt><dd>{rec.ground.rows[2][1]}</dd>
          </dl>
        ) : (
          <p className="ep-empty-cta">Select a pixel on either map to see every observation available for it.</p>
        )}
        <p className="ep-hint" style={{ marginTop: 10 }}>Missing observations are listed as missing, never as zero. No combined risk score is computed.</p>
      </section>
      <section className="ep-sec ep-notepad">
        <h3>Hypothesis notepad</h3>
        <label htmlFor="ep-note" className="ep-sr">Your hypothesis</label>
        <textarea id="ep-note" value={note} onChange={(e) => save(e.target.value)} placeholder="Could this be linked to drainage or compaction?" />
        <span className="ep-untested">Untested hypothesis. Your note only, saved in this browser, not a measured result.</span>
      </section>
      <section className="ep-sec">
        <p className="ep-quote">These maps can cover different time windows. Geographic overlap does not imply causation.</p>
      </section>
    </>
  );
}
