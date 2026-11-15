import { DottedGlobe } from "./icons.jsx";

// Shared footer rendered at the bottom of every takeover page (/docs,
// /brand, /changelog, /404). Keeps the chrome consistent so visitors
// always have an exit path back to the canvas app + source.
export const TakeoverFooter = () => (
  <footer className="takeover-footer">
    <a className="takeover-footer-brand" href="/" aria-label="Earth1 home">
      <DottedGlobe size={20} />
    </a>
    <nav className="takeover-footer-links" aria-label="Site links">
      <a href="/docs">Docs</a>
      <a href="/changelog">Changelog</a>
      <a href="/brand">Press kit</a>
      <a href="/privacy">Privacy</a>
    </nav>
  </footer>
);
