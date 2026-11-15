import { useCallback, useEffect, useRef, useState } from "react";
import { ILLUSTRATIONS } from "./Illustrations.jsx";

export const STORY_STEPS = [
  {
    headline: "This is our city.",
    body: "Ahmedabad lies along the Sabarmati River in Gujarat. From street level it looks still. Three different physical processes are quietly changing it: where water sits, what the river margins look like, and whether the ground itself moves.",
    visual: "AhmedabadAOIMap",
  },
  {
    headline: "Clouds hide the view. Radar does not need sunlight.",
    body: "NISAR is a NASA–ISRO satellite that sends microwave pulses to Earth and records the echo. It works day or night and sees through monsoon cloud, which is exactly when Ahmedabad’s water story is most interesting.",
    visual: "RadarSchematic",
  },
  {
    headline: "Water can look dark. Flooded vegetation can look bright.",
    body: "Calm open water reflects the pulse away from the satellite, so it appears dark. Water under trees can bounce the pulse back off trunks, so it can appear bright. Both are signals to test, not certainties.",
    visual: "ScatteringDiagram",
  },
  {
    headline: "A changed waterline is not automatically lost land.",
    body: "Two radar snapshots can show that the apparent water edge moved. That could be water level, river management, wind or vegetation, not necessarily erosion. Earth Pulse shows the observation and keeps the cause open.",
    visual: "ObservationVsCause",
  },
  {
    headline: "Radar phase can reveal the ground moving beneath a city.",
    body: "When the same ground is imaged twice, a tiny phase difference reveals relative motion toward or away from the satellite, down to millimetres. Earlier Sentinel-1 research reported subsidence in parts of Ahmedabad. NISAR can test what is happening now.",
    visual: "PhaseDerivation",
    cta: true,
  },
];

export function StoryMode({ onClose, onExplore }) {
  const [step, setStep] = useState(0);
  const touch = useRef(null);
  const rootRef = useRef(null);
  const last = STORY_STEPS.length - 1;
  const go = useCallback((n) => setStep(Math.max(0, Math.min(last, n))), [last]);

  useEffect(() => {
    rootRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step, onClose]);

  const s = STORY_STEPS[step];
  const Visual = ILLUSTRATIONS[s.visual];

  return (
    <div
      className="ep ep-story"
      role="dialog"
      aria-modal="true"
      aria-label="Earth Pulse story"
      tabIndex={-1}
      ref={rootRef}
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(step + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <header className="ep-story-head">
        <span>
          Story {step + 1} of {STORY_STEPS.length}
        </span>
        <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={onClose}>
          Close story
        </button>
      </header>
      <div className="ep-story-body" key={step}>
        <div className="ep-story-text" aria-live="polite">
          <h2>{s.headline}</h2>
          <p>{s.body}</p>
          {s.cta ? (
            <>
              <p className="ep-story-end">What can we conclude, and what do we still need to measure? The explorer shows both.</p>
              <button type="button" className="ep-btn ep-btn--primary" onClick={onExplore}>
                Explore the evidence
              </button>
            </>
          ) : null}
        </div>
        <figure className="ep-story-visual" style={{ margin: 0 }}>
          <Visual />
          <figcaption className="ep-illustrative" data-testid="illustrative-badge">
            Illustrative, not measured data
          </figcaption>
        </figure>
      </div>
      <footer className="ep-story-foot">
        <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={() => go(step - 1)} disabled={step === 0}>
          Previous
        </button>
        <div className="ep-dots" role="tablist" aria-label="Story steps">
          {STORY_STEPS.map((st, i) => (
            <button
              key={st.headline}
              type="button"
              aria-label={`Step ${i + 1}: ${st.headline}`}
              aria-current={i === step ? "step" : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
        {step < last ? (
          <button type="button" className="ep-btn ep-btn--primary ep-btn--small" onClick={() => go(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="ep-btn ep-btn--ghost ep-btn--small" onClick={onClose}>
            Finish
          </button>
        )}
      </footer>
    </div>
  );
}
