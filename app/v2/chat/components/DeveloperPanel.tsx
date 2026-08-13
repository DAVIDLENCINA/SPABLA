/**
 * SPABLA V2 · Hito 9.2.2 · Panel colapsable de desarrollo.
 *
 * Contiene los controles y datos técnicos que existían en 9.2.1 dentro
 * de los paneles "Contexto" y "Sesión". Se mueven aquí para dejar de
 * ocupar el centro de la experiencia. NADA de la funcionalidad cambia:
 * los handlers vienen tal cual desde `page.tsx`.
 *
 * Reglas:
 *   · <details> nativo, cerrado por defecto.
 *   · Sólo aparece cuando `enabled === true`. El consumer decide la
 *     puerta (en `page.tsx` se cablea a `process.env.NODE_ENV === "development"`).
 *   · Muestra tenantId / conversationId / actorA / actorB / regeneración
 *     de demo / botones de login rápido. Estos datos son fixtures
 *     locales; nunca se pintarían en `next start` productivo porque el
 *     tree-shake por `NODE_ENV === "development"` los elimina del bundle.
 *   · No cambia las claves de localStorage ni el flujo del seed.
 *
 * Estilo: visualmente discreto, colores neutros, cero azul primario
 * SPABLA (para no competir con la conversación principal).
 */

import type { CSSProperties } from "react";

const DEEP = "#0B0F19";
const BORDER = "#E2E8F0";
const MUTED = "#475569";
const META = "#64748B";
const CORAL = "#FF6B7A";

const detailsStyle: CSSProperties = {
  marginTop: "1rem",
  background: "#F8FAFC",
  border: `1px dashed ${BORDER}`,
  borderRadius: 10,
  color: DEEP,
};

const summaryStyle: CSSProperties = {
  padding: "0.65rem 1rem",
  fontSize: "0.85rem",
  color: MUTED,
  cursor: "pointer",
  userSelect: "none",
};

const bodyStyle: CSSProperties = {
  padding: "0 1rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
};

const groupStyle: CSSProperties = {
  padding: "0.65rem 0.85rem",
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const groupTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const kvRowStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: META,
  wordBreak: "break-all",
  overflowWrap: "anywhere",
};

const monoStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.78rem",
  color: DEEP,
};

const btnStyle: CSSProperties = {
  padding: "0.4rem 0.7rem",
  fontSize: "0.85rem",
  color: DEEP,
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  cursor: "pointer",
  minHeight: 32,
};

const btnRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  flexWrap: "wrap",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  color: CORAL,
};

export type SeededActor = {
  readonly actorId: string;
  readonly email: string;
  readonly password: string;
  readonly language: string;
};

export type SeedInfo = {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorA: SeededActor;
  readonly actorB: SeededActor;
};

export function DeveloperPanel({
  enabled,
  seed,
  seedBusy,
  seedError,
  onRunSeed,
  onSignInAs,
  isAuthenticated,
}: Readonly<{
  enabled: boolean;
  seed: SeedInfo | null;
  seedBusy: boolean;
  seedError: string | null;
  onRunSeed: () => void;
  onSignInAs: (email: string, password: string) => void;
  isAuthenticated: boolean;
}>): React.JSX.Element | null {
  if (!enabled) return null;
  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle} aria-label="Herramientas de desarrollo">
        Herramientas de desarrollo
      </summary>
      <div style={bodyStyle}>
        <div style={groupStyle}>
          <p style={groupTitleStyle}>Contexto de demo</p>
          <div style={btnRowStyle}>
            <button type="button" onClick={onRunSeed} disabled={seedBusy} style={btnStyle}>
              {seedBusy
                ? "Cargando…"
                : seed
                  ? "Regenerar demo"
                  : "Cargar contexto de demo"}
            </button>
          </div>
          {seedError !== null && (
            <p style={errorStyle}>No pudimos preparar el contexto de demo.</p>
          )}
          {seed && (
            <>
              <div style={kvRowStyle}>tenant: <span style={monoStyle}>{seed.tenantId}</span></div>
              <div style={kvRowStyle}>conversación: <span style={monoStyle}>{seed.conversationId}</span></div>
            </>
          )}
        </div>
        {seed && !isAuthenticated && (
          <div style={groupStyle}>
            <p style={groupTitleStyle}>Login rápido para pruebas</p>
            <div style={btnRowStyle}>
              <button
                type="button"
                style={btnStyle}
                onClick={() => onSignInAs(seed.actorA.email, seed.actorA.password)}
              >
                Entrar como actorA ({seed.actorA.language.toUpperCase()})
              </button>
              <button
                type="button"
                style={btnStyle}
                onClick={() => onSignInAs(seed.actorB.email, seed.actorB.password)}
              >
                Entrar como actorB ({seed.actorB.language.toUpperCase()})
              </button>
            </div>
            <div style={kvRowStyle}>actorA: <span style={monoStyle}>{seed.actorA.email}</span> · idioma {seed.actorA.language}</div>
            <div style={kvRowStyle}>actorB: <span style={monoStyle}>{seed.actorB.email}</span> · idioma {seed.actorB.language}</div>
          </div>
        )}
      </div>
    </details>
  );
}
