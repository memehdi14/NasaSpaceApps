"""Earth Pulse, Ahmedabad: NASA CMR inventory for the locked AOI.

Searches the four NISAR Level 2 collections over the Ahmedabad-Sabarmati
bounding box and writes ONLY records returned by NASA into
public/data/earth-pulse/manifest.json under "inventory". Nothing is invented:
if NASA returns zero granules, the lists stay empty and the status says so.

Usage:
    pip install -r pipelines/requirements.txt
    python pipelines/inventory_ahmedabad.py            # interactive Earthdata login
    python pipelines/inventory_ahmedabad.py --dry-run  # print, do not write

Layer entries ("gcov_baseline", ...) are NOT promoted here. Promote a layer
only after HDF5 inspection and QC (status QC_ACCEPTED), by hand or with the
preprocessing scripts, and always copy the granule ID and URL from inventory.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

AOI_W_S_E_N = (72.42, 22.88, 72.72, 23.19)
BEGIN, END = "2026-06-17", "2026-11-14"
COLLECTIONS = {
    "gcov": ["NISAR_L2_GCOV_PROVISIONAL_V1", "NISAR_L2_GCOV_V1"],
    "gunw": ["NISAR_L2_GUNW_PROVISIONAL_V1", "NISAR_L2_GUNW_V1"],
}
MANIFEST = Path(__file__).resolve().parents[1] / "public" / "data" / "earth-pulse" / "manifest.json"


def granule_record(g, collection: str) -> dict:
    """Extract fields that NASA actually returned. Missing fields stay None."""
    umm = g.get("umm", {}) if isinstance(g, dict) else getattr(g, "get", lambda *_: {})("umm", {})
    temporal = (umm.get("TemporalExtent") or {}).get("RangeDateTime") or {}
    try:
        links = [u for u in g.data_links(access="external") if u.startswith("https://")]
    except Exception:  # noqa: BLE001 - library versions differ
        links = []
    return {
        "collection": collection,
        "granule_id": umm.get("GranuleUR"),
        "begin_utc": temporal.get("BeginningDateTime"),
        "end_utc": temporal.get("EndingDateTime"),
        "nasa_https_urls": links,
        "maturity": "VALIDATED" if not collection.endswith("PROVISIONAL_V1") else "PROVISIONAL",
        "aoi_overlap_verified": False,  # set True only after footprint and pixel checks
        "status": "CMR_DISCOVERED",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        import earthaccess  # type: ignore
    except ImportError:
        print("earthaccess is not installed. Run: pip install -r pipelines/requirements.txt", file=sys.stderr)
        return 2

    earthaccess.login(strategy="interactive")
    found: dict[str, list[dict]] = {"gcov": [], "gunw": []}
    for product, names in COLLECTIONS.items():
        for name in names:
            try:
                results = earthaccess.search_data(short_name=name, bounding_box=AOI_W_S_E_N, temporal=(BEGIN, END))
            except Exception as exc:  # noqa: BLE001
                print(f"{name}: search failed: {exc}", file=sys.stderr)
                continue
            print(f"{name}: {len(results)} granule(s)")
            found[product].extend(granule_record(g, name) for g in results)

    total = len(found["gcov"]) + len(found["gunw"])
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["generated_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest["inventory"] = {
        "status": "CMR_DISCOVERED" if total else "NO_DATA",
        "note": "Records copied verbatim from NASA CMR via earthaccess. Not yet QC accepted.",
        "searched": {"bbox_wsen": list(AOI_W_S_E_N), "begin": BEGIN, "end": END, "collections": COLLECTIONS},
        "gcov": found["gcov"],
        "gunw": found["gunw"],
    }
    if args.dry_run:
        print(json.dumps(manifest["inventory"], indent=2))
        return 0
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {total} record(s) to {MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
