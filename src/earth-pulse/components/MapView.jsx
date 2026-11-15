import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AOI, GRID, PLACES, SABARMATI_LINE } from "../config.js";
import { renderLayer } from "../layers.js";
import { cellBounds, cellCenter, cellIndexAt } from "../synthetic.js";

const IMAGE_COORDS = [
  [AOI.west, AOI.north],
  [AOI.east, AOI.north],
  [AOI.east, AOI.south],
  [AOI.west, AOI.south],
];
const BOUNDS = [
  [AOI.west, AOI.south],
  [AOI.east, AOI.north],
];
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const EMPTY = { type: "FeatureCollection", features: [] };

// Lower number wins label space first.
const PLACE_PRIORITY = { River: 0, Landmark: 1, Water: 2, Bridge: 3, Industrial: 4, Area: 5 };

const SAT_ATTRIBUTION = "Basemap: Esri World Imagery (Esri, Maxar, Earthstar Geographics). Context only, not NISAR data.";

function baseStyle() {
  return {
    version: 8,
    sources: {
      sat: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 17,
        attribution: SAT_ATTRIBUTION,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0a121b" } },
      { id: "sat", type: "raster", source: "sat", paint: { "raster-brightness-max": 0.82, "raster-saturation": -0.25 } },
    ],
  };
}

const cellPolygon = (i) => {
  const b = cellBounds(i);
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south], [b.west, b.north]]],
    },
  };
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function MapView({
  layer,
  opacity = 1,
  showData = true,
  showUnknown = true,
  showAoi = true,
  showRiver = false,
  showPlaces = true,
  basemap = "satellite",
  selected = null,
  refPoints = null,
  popupFor = null,
  onPick,
  pickMode = null,
  swipe = null, // { pos, onChange, leftLabel, rightLabel }
  arriveFromGlobe = false,
  flyTarget = null,
  searchMarker = null,
  syncGroup = null,
  compact = false,
  label = "Map of the Ahmedabad study area",
  children,
}) {
  const containerRef = useRef(null);
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const canvasRef = useRef(null);
  const popupRef = useRef(null);
  const markersRef = useRef([]);
  const searchMarkerRef = useRef(null);
  const coordsRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [swipeCol, setSwipeCol] = useState(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;

  // ---------- create map ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let map;
    try {
      map = new maplibregl.Map({
        container: el,
        style: baseStyle(),
        center: arriveFromGlobe ? [AOI.center.lng, AOI.center.lat] : [AOI.center.lng, AOI.center.lat],
        zoom: arriveFromGlobe ? 4.2 : 10.6,
        minZoom: 3,
        maxZoom: 17,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Map failed to start", err);
      return undefined;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
    canvasRef.current = document.createElement("canvas");

    // Start the attribution collapsed so it never sits on top of the legend.
    map.once("load", () => {
      el.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    });
    map.on("load", () => {
      map.addSource("data", { type: "image", url: BLANK_PNG, coordinates: IMAGE_COORDS });
      map.addLayer({ id: "data", type: "raster", source: "data", paint: { "raster-resampling": "nearest", "raster-fade-duration": 0, "raster-opacity": 1 } });
      map.addSource("aoi", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...IMAGE_COORDS, IMAGE_COORDS[0]] } },
      });
      map.addLayer({ id: "aoi", type: "line", source: "aoi", paint: { "line-color": "#36A9D6", "line-width": 1.6, "line-dasharray": [3, 2] } });
      map.addSource("river", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: SABARMATI_LINE } } });
      map.addLayer({ id: "river", type: "line", source: "river", layout: { visibility: "none" }, paint: { "line-color": "#EEF4F7", "line-width": 1.4, "line-dasharray": [1, 2], "line-opacity": 0.8 } });
      map.addSource("sel", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "sel-fill", type: "fill", source: "sel", paint: { "fill-color": "#ffffff", "fill-opacity": 0.12 } });
      map.addLayer({ id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#ffffff", "line-width": 2.2 } });
      map.addSource("refs", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "refs", type: "circle", source: "refs", paint: { "circle-radius": 6, "circle-color": "#0c1520", "circle-stroke-color": "#E7A34D", "circle-stroke-width": 2.5 } });
      setReady(true);
      if (arriveFromGlobe) {
        map.fitBounds(BOUNDS, { padding: 30, duration: 2600, essential: true, curve: 1.6 });
      } else {
        map.fitBounds(BOUNDS, { padding: 30, duration: 0 });
      }
    });

    map.on("click", (e) => {
      const i = cellIndexAt(e.lngLat.lng, e.lngLat.lat);
      if (i < 0) return;
      onPickRef.current?.(i, pickModeRef.current);
    });
    map.on("mousemove", (e) => {
      if (!coordsRef.current) return;
      const inside = cellIndexAt(e.lngLat.lng, e.lngLat.lat) >= 0;
      coordsRef.current.textContent = `${e.lngLat.lat.toFixed(4)}°N ${e.lngLat.lng.toFixed(4)}°E${inside ? "" : " (outside AOI)"}`;
      map.getCanvas().style.cursor = inside ? (pickModeRef.current ? "copy" : "crosshair") : "";
    });

    return () => {
      popupRef.current?.remove();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      searchMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- sync (Connections) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !syncGroup || !ready) return undefined;
    syncGroup.add(map);
    const onMove = () => {
      if (map.__epSyncing) return;
      for (const other of syncGroup) {
        if (other === map) continue;
        other.__epSyncing = true;
        other.jumpTo({ center: map.getCenter(), zoom: map.getZoom() });
        other.__epSyncing = false;
      }
    };
    map.on("move", onMove);
    return () => {
      syncGroup.delete(map);
      map.off("move", onMove);
    };
  }, [syncGroup, ready]);

  // ---------- swipe column follows the divider ----------
  const updateSwipeCol = useCallback(() => {
    const map = mapRef.current;
    const wrap = wrapRef.current;
    if (!map || !wrap || !swipe) {
      setSwipeCol(null);
      return;
    }
    const x = wrap.clientWidth * swipe.pos;
    const ll = map.unproject([x, wrap.clientHeight / 2]);
    const col = Math.round((ll.lng - AOI.west) / GRID.dx);
    setSwipeCol(Math.max(0, Math.min(GRID.cols, col)));
  }, [swipe]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    updateSwipeCol();
    if (!swipe) return undefined;
    map.on("move", updateSwipeCol);
    return () => map.off("move", updateSwipeCol);
  }, [ready, swipe, updateSwipeCol]);

  // ---------- render data raster ----------
  // PNG encoding happens off the main thread via toBlob, and stale renders
  // are dropped so fast slider drags never queue up work.
  const renderSeq = useRef(0);
  const blobUrlRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !layer) return;
    const canvas = canvasRef.current;
    renderLayer(canvas, layer, { showUnknown, swipeCol: swipe ? swipeCol : null });
    const seq = ++renderSeq.current;
    canvas.toBlob((blob) => {
      if (!blob || seq !== renderSeq.current || !mapRef.current) return;
      const url = URL.createObjectURL(blob);
      const prev = blobUrlRef.current;
      blobUrlRef.current = url;
      const src = mapRef.current.getSource("data");
      if (src) src.updateImage({ url, coordinates: IMAGE_COORDS });
      if (prev) setTimeout(() => URL.revokeObjectURL(prev), 2000);
    });
  }, [layer, ready, showUnknown, swipeCol, swipe]);

  useEffect(() => () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  // Opacity is a paint property, so dragging the slider costs nothing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty("data", "raster-opacity", opacity);
  }, [opacity, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("data", "visibility", showData ? "visible" : "none");
    map.setLayoutProperty("aoi", "visibility", showAoi ? "visible" : "none");
    map.setLayoutProperty("river", "visibility", showRiver ? "visible" : "none");
    map.setLayoutProperty("sat", "visibility", basemap === "satellite" ? "visible" : "none");
  }, [ready, showData, showAoi, showRiver, basemap]);

  // ---------- place labels ----------
  // Labels are DOM markers, so MapLibre does not de-clutter them. We do it
  // ourselves: higher-priority places claim space first, anything that would
  // overlap an already shown label is hidden until there is room for it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!showPlaces) return undefined;

    const items = [...PLACES]
      .sort((a, b) => (PLACE_PRIORITY[a.kind] ?? 9) - (PLACE_PRIORITY[b.kind] ?? 9))
      .map((p) => {
        const el = document.createElement("div");
        el.className = "ep-place-marker";
        el.dataset.kind = p.kind;
        const label = document.createElement("span");
        label.textContent = p.name;
        el.append(label);
        const marker = new maplibregl.Marker({ element: el, anchor: "left", offset: [-4, 0] }).setLngLat([p.lng, p.lat]).addTo(map);
        markersRef.current.push(marker);
        return { p, el, marker, w: 0, h: 0 };
      });

    let raf = 0;
    const layout = () => {
      raf = 0;
      const pad = 4;
      const container = map.getContainer();
      const { clientWidth: W, clientHeight: H } = container;
      // Overlays (badge, legend, zoom buttons) count as occupied space so a
      // label never sits half-hidden underneath them.
      const origin = container.getBoundingClientRect();
      const placed = [...(wrapRef.current?.querySelectorAll(".ep-map-badge, .ep-map-legend, .ep-map-controls, .ep-coords") || [])].map((o) => {
        const r = o.getBoundingClientRect();
        return { x0: r.left - origin.left, x1: r.right - origin.left, y0: r.top - origin.top, y1: r.bottom - origin.top };
      });
      for (const it of items) {
        if (!it.w) {
          it.w = it.el.offsetWidth;
          it.h = it.el.offsetHeight;
        }
        const pt = map.project([it.p.lng, it.p.lat]);
        const box = { x0: pt.x - 4 - pad, x1: pt.x - 4 + it.w + pad, y0: pt.y - it.h / 2 - pad, y1: pt.y + it.h / 2 + pad };
        const offscreen = box.x1 < 0 || box.x0 > W || box.y1 < 0 || box.y0 > H;
        const hit = offscreen || placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
        it.el.classList.toggle("is-hidden", hit);
        if (!hit) placed.push(box);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(layout);
    };
    schedule();
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      map.off("move", schedule);
      map.off("resize", schedule);
    };
  }, [ready, showPlaces]);

  // ---------- selection + popup ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("sel");
    src?.setData(selected != null && selected >= 0 ? { type: "FeatureCollection", features: [cellPolygon(selected)] } : EMPTY);
    popupRef.current?.remove();
    popupRef.current = null;
    if (selected == null || selected < 0 || !popupFor) return;
    const rows = popupFor(selected);
    if (!rows) return;
    const { lng, lat } = cellCenter(selected);
    const html = `<dl>${rows.rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>${
      rows.note ? `<div class="ep-pop-note">${escapeHtml(rows.note)}</div>` : ""
    }`;
    popupRef.current = new maplibregl.Popup({ className: "ep-popup", closeButton: true, closeOnClick: false, offset: 14, maxWidth: "280px" })
      .setLngLat([lng + GRID.dx / 2, lat])
      .setHTML(html)
      .addTo(map);
  }, [selected, ready, popupFor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const feats = (refPoints || []).filter((i) => i >= 0).map((i) => {
      const { lng, lat } = cellCenter(i);
      return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } };
    });
    map.getSource("refs")?.setData({ type: "FeatureCollection", features: feats });
  }, [refPoints, ready]);

  // ---------- fly to search results ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flyTarget) return;
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: flyTarget.zoom ?? 13.5, duration: 1400, essential: true });
  }, [flyTarget, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;
    if (!searchMarker) return;
    const el = document.createElement("div");
    el.className = "ep-search-marker";
    el.title = searchMarker.name;
    searchMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([searchMarker.lng, searchMarker.lat]).addTo(map);
  }, [searchMarker, ready]);

  // Resize when container changes (panels, mobile sheet).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
      updateSwipeCol();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateSwipeCol]);

  const zoomBy = (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 250 });
  const fit = () => mapRef.current?.fitBounds(BOUNDS, { padding: 30, duration: 600 });

  // ---------- swipe dragging ----------
  const dragRef = useRef(false);
  const onSwipeDown = (e) => {
    dragRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onSwipeMove = (e) => {
    if (!dragRef.current || !swipe || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    swipe.onChange(Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width)));
  };
  const onSwipeUp = (e) => {
    dragRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onSwipeKey = (e) => {
    if (!swipe) return;
    if (e.key === "ArrowLeft") swipe.onChange(Math.max(0.02, swipe.pos - 0.04));
    else if (e.key === "ArrowRight") swipe.onChange(Math.min(0.98, swipe.pos + 0.04));
    else return;
    e.preventDefault();
  };

  return (
    <div className="ep-map-wrap" ref={wrapRef}>
      <div className="ep-map" ref={containerRef} role="application" aria-label={label} />
      <div className="ep-map-controls">
        <button type="button" className="ep-icon-btn" onClick={() => zoomBy(1)} aria-label="Zoom in">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="ep-icon-btn" onClick={() => zoomBy(-1)} aria-label="Zoom out">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="ep-icon-btn" onClick={fit} aria-label="Fit the study area">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
        </button>
      </div>
      {!compact ? <div className="ep-coords" ref={coordsRef} aria-hidden="true">Move over the map</div> : null}
      {swipe ? (
        <div className="ep-swipe" style={{ left: `${swipe.pos * 100}%` }}>
          <span className="ep-swipe-tag is-left">{swipe.leftLabel}</span>
          <span className="ep-swipe-tag is-right">{swipe.rightLabel}</span>
          <button
            type="button"
            className="ep-swipe-handle"
            role="slider"
            aria-label="Compare dates. Use left and right arrows to move the divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(swipe.pos * 100)}
            onPointerDown={onSwipeDown}
            onPointerMove={onSwipeMove}
            onPointerUp={onSwipeUp}
            onPointerCancel={onSwipeUp}
            onKeyDown={onSwipeKey}
          >
            <span aria-hidden="true">◂</span> A | B <span aria-hidden="true">▸</span>
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
