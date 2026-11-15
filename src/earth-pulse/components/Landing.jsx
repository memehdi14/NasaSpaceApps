import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lookPresets } from "../../data/look-presets.js";
import { areaOptions } from "../../data/geography.js";
import { createCountryMapData } from "../../utils/dot-generation.js";
import { DEFAULT_FLOW_SETTINGS, DEFAULT_SPACE_SETTINGS, SPACE_BACKGROUND_BASE } from "../../config/backgrounds.js";
import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion.js";
import { AOI } from "../config.js";
import { inAoi, searchLocal, searchNominatim } from "../search.js";
import { BrandMark, StatusLine } from "./Common.jsx";

const GlobeBackground = lazy(() => import("../../components/globe-background.jsx").then((m) => ({ default: m.GlobeBackground })));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Globe look: the GlobeStudio "Original" earth (terrain, rivers, borders,
// space backdrop), re-tinted to the Earth Pulse water accent.
const preset = lookPresets.find((p) => p.id === "original") || lookPresets[0];
const LOOK = {
  ...preset.settings,
  globeSettings: {
    ...preset.settings.globeSettings,
    glowColor: "#36A9D6",
    glowStrength: 62,
    autoSpin: true,
    autoSpinSpeed: 10,
    network: false,
  },
};

export function Landing({ onEnter, onOpenStory, onOpenSources, sourceStatus }) {
  const reduced = usePrefersReducedMotion();
  const controlRef = useRef(null);
  const pinRef = useRef(null);
  const tempPinRef = useRef(null);
  const aoiRef = useRef(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [heroIn, setHeroIn] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | turning | zoom | aoi | fade
  const [tempPin, setTempPin] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [highlightAhm, setHighlightAhm] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pickedRef = useRef("");
  const tempPinData = useRef(null);
  tempPinData.current = tempPin;

  const ids = useMemo(() => areaOptions[0]?.ids || [], []);
  const mapData = useMemo(() => createCountryMapData(ids, LOOK.density), [ids]);

  useEffect(() => {
    document.title = "Earth Pulse, Ahmedabad: NISAR evidence explorer";
    const t = setTimeout(() => setHeroIn(true), reduced ? 0 : 2200);
    return () => clearTimeout(t);
  }, [reduced]);

  // Bring India into view on load, then let the slow spin take over.
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (controlRef.current) {
        controlRef.current.rotateTo(21, 66);
        clearInterval(id);
      } else if (tries > 400) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Overlay tracking loop: pins and AOI outline follow the rotating globe.
  useEffect(() => {
    let raf = 0;
    const place = (el, pos) => {
      if (!el) return;
      if (!pos || !pos.visible) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }
      el.style.opacity = String(Math.min(1, pos.facing * 3));
      el.style.pointerEvents = "auto";
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    };
    const tick = () => {
      const ctl = controlRef.current;
      if (ctl) {
        place(pinRef.current, ctl.project(AOI.center.lat, AOI.center.lng));
        const tp = tempPinData.current;
        if (tp) place(tempPinRef.current, ctl.project(tp.lat, tp.lng));
        const ph = phaseRef.current;
        if (aoiRef.current && (ph === "zoom" || ph === "aoi" || ph === "fade")) {
          const pts = [];
          const steps = 6;
          const edge = (lat1, lng1, lat2, lng2) => {
            for (let s = 0; s < steps; s += 1) {
              const t = s / steps;
              const p = ctl.project(lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t);
              if (p) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
            }
          };
          edge(AOI.north, AOI.west, AOI.north, AOI.east);
          edge(AOI.north, AOI.east, AOI.south, AOI.east);
          edge(AOI.south, AOI.east, AOI.south, AOI.west);
          edge(AOI.south, AOI.west, AOI.north, AOI.west);
          aoiRef.current.setAttribute("points", pts.join(" "));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dive = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    const ctl = controlRef.current;
    if (!ctl || reduced) {
      onEnter();
      return;
    }
    setResults([]);
    setPhase("turning");
    ctl.pauseSpin(true);
    setMapZoom(1);
    ctl.rotateTo(AOI.center.lat, AOI.center.lng);
    await sleep(1200);
    setPhase("zoom");
    ctl.setZoom(2.6, 1900);
    await sleep(1700);
    setPhase("aoi");
    await sleep(800);
    setPhase("fade");
    await sleep(650);
    onEnter();
  }, [onEnter, reduced]);

  // ---------- search ----------
  useEffect(() => {
    const q = query.trim();
    setSearchError("");
    if (q.length < 2 || q === pickedRef.current) {
      setResults([]);
      return undefined;
    }
    const local = searchLocal(q, 4);
    setResults(local);
    setActiveIdx(-1);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const remote = await searchNominatim(q, { signal: ctrl.signal });
        const seen = new Set(local.map((r) => r.name.toLowerCase()));
        setResults([...local, ...remote.filter((r) => !seen.has(r.name.toLowerCase()))].slice(0, 6));
      } catch (err) {
        if (err.name !== "AbortError" && local.length === 0) setSearchError("Place search is offline. Try a landmark in Ahmedabad, such as Kankaria Lake.");
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const flyToResult = useCallback((r) => {
    const ctl = controlRef.current;
    setResults([]);
    pickedRef.current = r.name;
    setQuery(r.name);
    if (!ctl) return;
    ctl.pauseSpin(true);
    ctl.rotateTo(r.lat, r.lng);
    const inside = inAoi(r.lat, r.lng);
    setHighlightAhm(inside);
    setTempPin({ ...r, inside });
  }, []);

  useEffect(() => {
    if (!tempPin) return undefined;
    const t = setTimeout(() => {
      setTempPin(null);
      setHighlightAhm(false);
    }, tempPin.inside ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [tempPin]);

  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[activeIdx >= 0 ? activeIdx : 0];
      if (pick) flyToResult(pick);
    } else if (e.key === "Escape") {
      setResults([]);
    }
  };

  const busy = phase !== "idle";

  return (
    <div className={`ep ep-landing phase-${phase}`}>
      <div
        className="ep-globe-wrap"
        onPointerDown={() => controlRef.current?.pauseSpin(true)}
      >
        <Suspense fallback={<div className="ep-globe-placeholder" aria-hidden="true" />}>
          <GlobeBackground
            controlRef={controlRef}
            mapData={mapData}
            exportable={false}
            selectedDots={new Set()}
            setSelectedDots={() => {}}
            dotColor={LOOK.dotColor}
            dotSize={LOOK.dotSize}
            dotsVisible
            shape={LOOK.shape}
            asciiSymbol={LOOK.asciiSymbol}
            dotGradient={null}
            dotColorAlpha={1}
            renderMode={LOOK.renderMode}
            worldFill={LOOK.worldFill}
            worldStroke={LOOK.worldStroke}
            riversVisible
            riversColor="rgba(54, 169, 214, 0.85)"
            citiesVisible={false}
            selectionCountryCodes={ids}
            background={SPACE_BACKGROUND_BASE}
            transparent
            morphMode="globe"
            interactive
            mapOffset={mapOffset}
            setMapOffset={setMapOffset}
            mapZoom={mapZoom}
            setMapZoom={setMapZoom}
            mapDepth={55}
            tiltX={0}
            tiltY={0}
            panelCollapsed
            spaceSettings={LOOK.spaceSettings || DEFAULT_SPACE_SETTINGS}
            flowSettings={LOOK.flowSettings || DEFAULT_FLOW_SETTINGS}
            shaderSettings={LOOK.shaderSettings}
            globeSettings={LOOK.globeSettings}
            backgroundStyle="space"
            reducedMotion={reduced}
            perfHud={false}
            label="Earth globe. Ahmedabad is marked; select it to open the explorer."
          />
        </Suspense>
      </div>

      <div className="ep-globe-overlay" aria-hidden={busy ? "true" : undefined}>
        <svg className="ep-aoi-svg" aria-hidden="true">
          <polygon ref={aoiRef} points="" />
        </svg>
        <button
          ref={pinRef}
          type="button"
          className={`ep-pin ${highlightAhm ? "is-highlight" : ""}`}
          onClick={dive}
          disabled={busy}
          aria-label="Ahmedabad. Open the Earth Pulse explorer"
        >
          <span className="ep-pin-ring" />
          <span className="ep-pin-ring ep-pin-ring--late" />
          <span className="ep-pin-dot" />
          <span className="ep-pin-reticle" aria-hidden="true" />
          <span className="ep-pin-label">
            Ahmedabad
            <small>{highlightAhm ? "This is our study area. Select to explore" : "Sabarmati study area"}</small>
          </span>
        </button>
        {tempPin && !tempPin.inside ? (
          <div ref={tempPinRef} className="ep-temp-pin" role="status">
            <span className="ep-temp-dot" />
            <span className="ep-temp-label">{tempPin.name}</span>
          </div>
        ) : (
          <div ref={tempPinRef} hidden />
        )}
      </div>

      <header className="ep-landing-top">
        <a className="ep-wordmark" href="/" aria-label="Earth Pulse home">
          <BrandMark />
          <span>
            <strong>Earth Pulse</strong>
            <em>Ahmedabad</em>
          </span>
        </a>
        <nav className="ep-landing-nav" aria-label="Primary">
          <button type="button" onClick={onOpenStory}>Story</button>
          <button type="button" onClick={onEnter}>Explorer</button>
          <button type="button" onClick={onOpenSources}>Sources</button>
        </nav>
      </header>

      <section className={`ep-hero ${heroIn ? "is-in" : ""}`} aria-labelledby="ep-hero-title">
        <h1 id="ep-hero-title">The city is changing in three different ways.</h1>
        <p>
          Follow Sabarmati water, river margins, and the ground beneath Ahmedabad through the
          eyes of NASA–ISRO’s NISAR radar.
        </p>
        <div className="ep-hero-actions">
          <button type="button" className="ep-btn ep-btn--primary" onClick={dive} disabled={busy}>
            Enter Ahmedabad
          </button>
          <button type="button" className="ep-btn ep-btn--ghost" onClick={onOpenStory} disabled={busy}>
            Watch the 60-second explanation
          </button>
        </div>
        <StatusLine status={sourceStatus} />
      </section>

      <div className="ep-globe-search" role="search">
        <label htmlFor="ep-globe-q" className="ep-sr">Search any place on Earth</label>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="ep-search-icon">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="ep-globe-q"
          type="search"
          autoComplete="off"
          placeholder="Search any place on Earth"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          disabled={busy}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="ep-globe-results"
          aria-activedescendant={activeIdx >= 0 ? `ep-gr-${activeIdx}` : undefined}
        />
        {searching ? <span className="ep-search-spin" aria-label="Searching" /> : null}
        {results.length > 0 ? (
          <ul id="ep-globe-results" className="ep-search-results" role="listbox">
            {results.map((r, idx) => (
              <li
                key={r.id}
                id={`ep-gr-${idx}`}
                role="option"
                aria-selected={idx === activeIdx}
                className={idx === activeIdx ? "is-active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  flyToResult(r);
                }}
              >
                <span>{r.name}</span>
                <small>{inAoi(r.lat, r.lng) ? "Inside the study area" : r.detail}</small>
              </li>
            ))}
          </ul>
        ) : null}
        {searchError ? <p className="ep-search-error">{searchError}</p> : null}
      </div>

      <div className="ep-dive-caption" aria-live="polite">
        {phase === "turning" ? "Turning to Ahmedabad" : null}
        {phase === "zoom" ? "Descending to the Sabarmati corridor" : null}
        {phase === "aoi" || phase === "fade" ? `Study area locked: ${AOI.west}–${AOI.east}°E, ${AOI.south}–${AOI.north}°N` : null}
      </div>
      <div className="ep-fade-veil" aria-hidden="true" />
    </div>
  );
}
