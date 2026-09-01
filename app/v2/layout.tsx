import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

/**
 * SPABLA V2 — Nested layout for the `/v2/**` subtree.
 *
 * Provides a stable light surface so text and form controls stay
 * legible on Safari and browsers running in dark mode. The color
 * scheme, background and form-control palette are scoped to
 * descendants of `.spabla-v2-scope`.
 */

export const metadata: Metadata = {
  title: "SPABLA V2 — Chat traducido",
};

const wrapperStyle: CSSProperties = {
  colorScheme: "light",
  background: "#f8fafc",
  color: "#0f172a",
  minHeight: "100vh",
  width: "100%",
};

// Scoped rules that force form controls to a readable light palette
// regardless of the user-agent color scheme. Restricted to descendants of
// `.spabla-v2-scope`.
const scopedCss = `
.spabla-v2-scope input,
.spabla-v2-scope select,
.spabla-v2-scope textarea {
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}
.spabla-v2-scope input::placeholder,
.spabla-v2-scope textarea::placeholder {
  color: #64748b;
  opacity: 1;
}
.spabla-v2-scope button {
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #94a3b8;
  border-radius: 4px;
  cursor: pointer;
}
.spabla-v2-scope button:hover:not(:disabled) {
  background: #e2e8f0;
}
.spabla-v2-scope button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.spabla-v2-scope input:focus,
.spabla-v2-scope select:focus,
.spabla-v2-scope textarea:focus,
.spabla-v2-scope button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.spabla-v2-scope code {
  background: #e2e8f0;
  color: #0f172a;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}
`;

export default function V2Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="spabla-v2-scope" style={wrapperStyle}>
      <style>{scopedCss}</style>
      {children}
    </div>
  );
}
