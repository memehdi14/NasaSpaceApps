import { useCallback, useMemo, useState } from "react";
import { GUNW_PAIRS, LENSES } from "../config.js";
import { buildLayer } from "../layers.js";
import { inspectPixel } from "../inspector.js";
import { Legend } from "./Common.jsx";
import { MapView } from "./MapView.jsx";
import { DataGapNotice } from "./Panels.jsx";

const SLOT_LENSES = LENSES.filter((l) => l.id !== "connections");

function Slot({ id, lensId, setLensId, params, basemap, layersOn, nasaMode, availability, selected, onSelect, syncGroup, flyTarget }) {
  const lens = SLOT_LENSES.find((l) => l.id === lensId);
  const unavailable = nasaMode && !availability[lensId];
  const layer = useMemo(() => {
    if (unavailable || params.dateA >= params.dateB) return null;
    const p = { ...params, alpha: Math.round(params.opacity * 255) };
    if (lensId === "floodghost") p.fgView = "water";
    if (lensId === "ground-zero") p.gzStat = "pair";
    return buildLayer(lensId, p);
  }, [lensId, params, unavailable]);
  const pair = GUNW_PAIRS.find((p) => p.id === params.gzPair) || GUNW_PAIRS[0];
  const span = lensId === "ground-zero" ? `${pair.reference} → ${pair.secondary}` : lensId === "floodghost" ? params.dateA : `${params.dateA} → ${params.dateB}`;
  const popupFor = useCallback(
    (i) => {
      if (unavailable) return null;
      const p = { ...params, fgView: "water", gzStat: "pair" };
      const ev = inspectPixel(lensId, p, i);
      return { rows: [["Pixel ID", ev.id], ...ev.popup], note: "Illustrative demo value" };
    },
    [lensId, params, unavailable],
  );
  return (
    <div className="ep-conn-slot">
      <MapView
        layer={layer}
        showData={layersOn.data}
        showUnknown={layersOn.unknown}
        showAoi={layersOn.aoi}
        showRiver={layersOn.river}
        showPlaces={false}
        basemap={basemap}
        selected={selected}
        popupFor={popupFor}
        onPick={(i) => onSelect(i)}
        syncGroup={syncGroup}
        flyTarget={flyTarget}
        compact
        label={`${lens.title} map, ${id === "left" ? "left" : "right"} slot`}
      >
        <div className="ep-conn-head">
          <label htmlFor={`ep-slot-${id}`} className="ep-sr">Lens for the {id} map</label>
          <select id={`ep-slot-${id}`} value={lensId} onChange={(e) => setLensId(e.target.value)}>
            {SLOT_LENSES.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
          <span>{span}</span>
        </div>
        {unavailable ? <DataGapNotice module={lens.name} product={lens.product} /> : null}
        {layer && layersOn.data ? (
          <div className="ep-map-legend">
            <Legend legend={layer.legend} />
          </div>
        ) : null}
      </MapView>
    </div>
  );
}

export function ConnectionsView(props) {
  const [left, setLeft] = useState("river-memory");
  const [right, setRight] = useState("ground-zero");
  const syncGroup = useMemo(() => new Set(), []);
  return (
    <div className="ep-conn">
      <Slot id="left" lensId={left} setLensId={setLeft} syncGroup={syncGroup} {...props} />
      <Slot id="right" lensId={right} setLensId={setRight} syncGroup={syncGroup} {...props} />
    </div>
  );
}
