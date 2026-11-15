import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import EarthPulseApp from "./earth-pulse/EarthPulseApp.jsx";

// The legacy GlobeStudio embed is only loaded on /embed, so its code never
// ships with the main app.
const EmbedView = lazy(() => import("./components/embed-view.jsx").then((m) => ({ default: m.EmbedView })));

// Earth Pulse — Ahmedabad is the public app. The GlobeStudio globe renderer
// powers the landing page; /embed keeps the original bare-canvas embed.
const isEmbed = typeof window !== "undefined" && window.location.pathname.startsWith("/embed");

// The original GlobeStudio stylesheet flattens every corner and restyles form
// controls globally, so it is only loaded for the legacy /embed route.
if (isEmbed) import("./styles.css");

createRoot(document.getElementById("root")).render(
  <StrictMode>{isEmbed ? (
      <Suspense fallback={null}>
        <EmbedView />
      </Suspense>
    ) : (
      <EarthPulseApp />
    )}</StrictMode>,
);
