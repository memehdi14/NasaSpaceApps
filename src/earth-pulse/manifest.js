import { useEffect, useState } from "react";

// Loads the provenance manifest written by pipelines/inventory_ahmedabad.py.
// Status is derived strictly from real records: a layer only counts as
// verified when it carries both a NASA granule ID and an HTTPS URL.
export const VERIFIED_STATES = new Set(["QC_ACCEPTED", "DERIVED", "PUBLIC"]);

export function deriveStatus(manifest) {
  if (!manifest?.layers) return "NOT_VERIFIED";
  const layers = Object.values(manifest.layers);
  const verified = layers.filter((l) => l && l.granule_id && l.nasa_https_url && VERIFIED_STATES.has(l.status));
  if (verified.length === 0) return "NOT_VERIFIED";
  if (verified.length < layers.length) return "PARTIAL";
  return "VERIFIED";
}

export function moduleAvailability(manifest) {
  const l = manifest?.layers || {};
  const ok = (x) => Boolean(x && x.granule_id && x.nasa_https_url && VERIFIED_STATES.has(x.status));
  const gcov = ok(l.gcov_baseline);
  const gcovPair = gcov && ok(l.gcov_comparison);
  const gunw = ok(l.gunw_pair);
  return {
    floodghost: gcov,
    "river-memory": gcovPair,
    "surface-change": gcovPair,
    "ground-zero": gunw,
    connections: gcov || gunw,
  };
}

export function useManifest() {
  const [state, setState] = useState({ status: "LOADING", data: null, error: null });
  useEffect(() => {
    let alive = true;
    fetch("/data/earth-pulse/manifest.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Manifest request failed (${r.status})`);
        return r.json();
      })
      .then((data) => alive && setState({ status: deriveStatus(data), data, error: null }))
      .catch((err) => alive && setState({ status: "NOT_VERIFIED", data: null, error: err.message }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
