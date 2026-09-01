/**
 * SPABLA V2 · UX-02 · Cabecera de la conversación.
 *
 * Presentational. Sigue recibiendo:
 *   - `authenticatedEmail`: email del actor autenticado, si lo hay.
 *   - `myLanguageLabel` / `targetLanguageLabel`: etiquetas humanas
 *     del par idiomático (nunca códigos ISO crudos ni UUID).
 *   - `onSignOut`: callback opcional para el botón de cerrar sesión
 *     (idéntico al handler que ya vive en `page.tsx`).
 *
 * UX-02 · Aplica la paleta y espaciado promovidos desde UX-01-R2 vía
 * `../styles.ts` (nunca importa `app/v2/design/**`). Cero cambios en
 * la lógica productiva: no maneja estado, sesión, fetch ni políticas.
 * Nunca muestra `tenantId`, `conversationId`, UUIDs de actores,
 * contraseñas ni el nombre `spabla_v2`.
 */

import type { CSSProperties } from "react";

import { chatColor, chatFont, chatRadius, chatSpace } from "../styles";

const containerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: chatSpace.md,
  padding: `${chatSpace.md}px ${chatSpace.lg}px`,
  background: chatColor.surface,
  borderBottom: `1px solid ${chatColor.border}`,
  minHeight: 56,
  flexShrink: 0,
};

const leftBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  flex: "1 1 220px",
  gap: 2,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: chatFont.size.lg,
  fontWeight: chatFont.weight.semibold,
  color: chatColor.textPrimary,
  lineHeight: 1.2,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: chatFont.size.xs,
  color: chatColor.textMuted,
  lineHeight: 1.3,
};

const emailStyle: CSSProperties = {
  fontSize: chatFont.size.xs,
  color: chatColor.textSecondary,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  minWidth: 0,
};

const rightBlockStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: chatSpace.sm,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: `4px ${chatSpace.md}px`,
  borderRadius: chatRadius.pill,
  background: chatColor.surfaceSubtle,
  border: `1px solid ${chatColor.border}`,
  color: chatColor.textPrimary,
  fontSize: chatFont.size.xs,
  fontWeight: chatFont.weight.medium,
  whiteSpace: "nowrap",
};

const chipArrowStyle: CSSProperties = {
  color: chatColor.spablaCyan,
  fontWeight: chatFont.weight.bold,
};

const signOutBtnStyle: CSSProperties = {
  background: chatColor.surface,
  color: chatColor.spablaCoral,
  border: `1px solid ${chatColor.spablaCoral}`,
  borderRadius: chatRadius.sm,
  padding: `${chatSpace.xs}px ${chatSpace.md}px`,
  fontSize: chatFont.size.xs,
  fontWeight: chatFont.weight.semibold,
  cursor: "pointer",
  lineHeight: 1.2,
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
    <section style={containerStyle} data-role="conversation-header" aria-label="Cabecera de la conversación">
      <div style={leftBlockStyle}>
        <h2 style={titleStyle}>Conversación traducida</h2>
        {isAuthenticated ? (
          <span style={emailStyle} aria-label="Cuenta autenticada">{authenticatedEmail}</span>
        ) : (
          <p style={subtitleStyle}>Inicia sesión para leer y enviar mensajes.</p>
        )}
      </div>
      <div style={rightBlockStyle}>
        <span
          style={chipStyle}
          aria-label={`Escribes en ${myLanguageLabel}, lees en ${targetLanguageLabel}`}
        >
          <span>{myLanguageLabel}</span>
          <span style={chipArrowStyle} aria-hidden="true">→</span>
          <span>{targetLanguageLabel}</span>
        </span>
        {isAuthenticated && onSignOut !== undefined && (
          <button type="button" onClick={onSignOut} style={signOutBtnStyle}>
            Cerrar sesión
          </button>
        )}
      </div>
    </section>
  );
}
