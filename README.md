# Earth Pulse, Ahmedabad

NISAR evidence explorer for the Ahmedabad–Sabarmati corridor (NASA Space Apps 2026, Dancing with the SARs), built on the GlobeStudio globe renderer.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production build in dist/
npm test           # JavaScript math and integrity tests
```

Python pipeline and tests:

```bash
pip install -r pipelines/requirements.txt
python -m pytest tests/python
python pipelines/inventory_ahmedabad.py --dry-run   # needs a free NASA Earthdata Login
```

## What is where

- `src/earth-pulse/` — the app: landing globe, explorer, story, science and sources.
- `src/earth-pulse/math.js` and `pipelines/earthpulse_math.py` — the formulas from the master plan, sections 8–10.
- `src/earth-pulse/synthetic.js` — seeded illustrative data so every interaction works before real granules exist.
- `public/data/earth-pulse/manifest.json` — provenance manifest. Empty until the inventory script returns real NASA records.
- `src/components/globe-background.jsx` — the original GlobeStudio renderer, extended with a small control handle for the pin and the dive.

## Data honesty

All map layers are labelled illustrative. No Ahmedabad NISAR granule is authenticated in this build. The "NASA verified" switch in the header shows only manifest-backed data, so today it reports each lens as unavailable. The satellite basemap is Esri World Imagery, shown as context only. Choose "None" in the Layers panel to follow the PRD's no-external-tiles rule.
