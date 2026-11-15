import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Landing } from "./components/Landing.jsx";
import { StoryMode } from "./components/StoryMode.jsx";
import { ScienceModal, SourcesModal } from "./components/Modals.jsx";
import { useManifest } from "./manifest.js";
import "./earth-pulse.css";

const Explorer = lazy(() => import("./components/Explorer.jsx").then((m) => ({ default: m.Explorer })));

const routeFromLocation = () => (window.location.pathname.replace(/\/+$/, "").startsWith("/explorer") ? "explorer" : "landing");

export default function EarthPulseApp() {
  const [route, setRoute] = useState(routeFromLocation);
  const [modal, setModal] = useState(null); // story | science | sources
  const [arrivedFromGlobe, setArrivedFromGlobe] = useState(false);
  const manifest = useManifest();

  useEffect(() => {
    const onPop = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("ep-body-explorer", route === "explorer");
  }, [route]);

  const navigate = useCallback((to, { fromGlobe = false } = {}) => {
    const path = to === "explorer" ? "/explorer" : "/";
    if (window.location.pathname !== path) window.history.pushState({}, "", path + (to === "explorer" ? window.location.search : ""));
    setArrivedFromGlobe(fromGlobe);
    setRoute(to);
    setModal(null);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  return (
    <>
      {route === "landing" ? (
        <Landing
          sourceStatus={manifest.status}
          onEnter={() => navigate("explorer", { fromGlobe: true })}
          onOpenStory={() => setModal("story")}
          onOpenSources={() => setModal("sources")}
        />
      ) : (
        <Suspense fallback={<div className="ep ep-loading-screen">Loading the explorer</div>}>
          <Explorer
            manifest={manifest}
            arrivedFromGlobe={arrivedFromGlobe}
            onGlobe={() => navigate("landing")}
            onOpenStory={() => setModal("story")}
            onOpenScience={() => setModal("science")}
            onOpenSources={() => setModal("sources")}
          />
        </Suspense>
      )}
      {modal === "story" ? <StoryMode onClose={closeModal} onExplore={() => navigate("explorer")} /> : null}
      {modal === "science" ? <ScienceModal onClose={closeModal} /> : null}
      {modal === "sources" ? <SourcesModal onClose={closeModal} manifest={manifest} /> : null}
    </>
  );
}
