import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EmbedView } from "./components/embed-view.jsx";
import EarthPulseApp from "./earth-pulse/EarthPulseApp.jsx";

// Earth Pulse — Ahmedabad is the public app. The GlobeStudio globe renderer
// powers the landing page; /embed keeps the original bare-canvas embed.
const isEmbed = typeof window !== "undefined" && window.location.pathname.startsWith("/embed");

// The original GlobeStudio stylesheet flattens every corner and restyles form
// controls globally, so it is only loaded for the legacy /embed route.
if (isEmbed) import("./styles.css");

createRoot(document.getElementById("root")).render(
  <StrictMode>{isEmbed ? <EmbedView /> : <EarthPulseApp />}</StrictMode>,
);
