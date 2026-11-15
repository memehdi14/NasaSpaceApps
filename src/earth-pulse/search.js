import { AOI, PLACES } from "./config.js";

export const inAoi = (lat, lng) => lat >= AOI.south && lat <= AOI.north && lng >= AOI.west && lng <= AOI.east;

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, "");

export function searchLocal(query, limit = 6) {
  const q = norm(query.trim());
  if (!q) return [];
  return PLACES.filter((p) => norm(p.name).includes(q) || norm(p.kind).includes(q))
    .slice(0, limit)
    .map((p) => ({ id: `local-${p.name}`, name: p.name, detail: `${p.kind}, Ahmedabad`, lat: p.lat, lng: p.lng, source: "local" }));
}

// Nominatim (OpenStreetMap geocoder) is used only to *find coordinates* for a
// typed place name. It never supplies map imagery or science data.
export async function searchNominatim(query, { bounded = false, signal } = {}) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "6", addressdetails: "0" });
  if (bounded) {
    params.set("viewbox", `${AOI.west},${AOI.north},${AOI.east},${AOI.south}`);
    params.set("bounded", "1");
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Search service returned ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => {
    const parts = String(r.display_name || "").split(",").map((s) => s.trim());
    return {
      id: `osm-${r.place_id}`,
      name: parts[0] || r.name || query,
      detail: parts.slice(1, 4).join(", "),
      lat: Number(r.lat),
      lng: Number(r.lon),
      source: "nominatim",
    };
  }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}
