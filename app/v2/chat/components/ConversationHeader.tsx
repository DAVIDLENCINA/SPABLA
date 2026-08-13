/**
 * SPABLA V2 · Hito 9.2.2 · Cabecera compacta de la conversación traducida.
 *
 * Presentational. Recibe:
 *   - `authenticatedEmail`: email del actor autenticado, si lo hay.
 *   - `myLanguageLabel` / `targetLanguageLabel`: etiquetas humanas del par
 *     idiomático (nunca códigos ISO crudos ni UUID).
 *   - `onSignOut`: callback opcional para el botón de cerrar sesión
 *     (idéntico al handler que ya vive en `page.tsx`).
 *
 * No contiene estado, sesión, fetch ni lógica de negocio. Nunca muestra
 * `tenantId`, `conversationId`, UUIDs de actores, contraseñas ni el
 * nombre `spabla_v2`.
 */

import type { CSSProperties } from "react";

const CORAL = "#FF6B7A";
const SPABLA_BLUE = "#1EC7FF";
const DEEP = "#0B0F19";
const MUTED = "#475569";
const BORDER = "#E2E8F0";

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  padding: "0.85rem 1rem",
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  marginTop: "1rem",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  color: DEEP,
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: MUTED,
  margin: 0,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  background: "#F1F5F9",
  border: `1px solid ${BORDER}`,
  color: DEEP,
  fontSize: "0.8rem",
  whiteSpace: "nowrap",
};

const chipArrowStyle: CSSProperties = {
  color: SPABLA_BLUE,
  fontWeight: 700,
};

const emailStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: MUTED,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
  flex: 1,
};

const signOutBtnStyle: CSSProperties = {
  background: "#FFFFFF",
  color: CORAL,
  border: `1px solid ${CORAL}`,
  borderRadius: 6,
  padding: "0.3rem 0.7rem",
  fontSize: "0.8rem",
  cursor: "pointer",
};

export function ConversationHeader({
  authenticatedEmail,
  myLanguageLabel,
  targetLanguageLabel,
  onSignOut,
}: Readonly<{
  authenticatedEmail: string | null;
  myLanguageLabel: string;
  targetLanguageLabel: string;
  onSignOut?: () => void;
}>): React.JSX.Element {
  const isAuthenticated = authenticatedEmail !== null;
  return (
    <section style={containerStyle} aria-label="Cabecera de la conversación">
      <div style={rowStyle}>
        <div>
          <h2 style={titleStyle}>Conversación traducida</h2>
          {!isAuthenticated && (
            <p style={subtitleStyle}>Inicia sesión para leer y enviar mensajes.</p>
          )}
        </div>
        <span style={chipStyle} aria-label={`Escribes en ${myLanguageLabel}, lees en ${targetLanguageLabel}`}>
          <span>{myLanguageLabel}</span>
          <span style={chipArrowStyle} aria-hidden="true">→</span>
          <span>{targetLanguageLabel}</span>
        </span>
      </div>
      {isAuthenticated && (
        <div style={rowStyle}>
          <span style={emailStyle} aria-label="Cuenta autenticada">{authenticatedEmail}</span>
          {onSignOut !== undefined && (
            <button type="button" onClick={onSignOut} style={signOutBtnStyle}>
              Cerrar sesión
            </button>
          )}
        </div>
      )}
    </section>
  );
}
