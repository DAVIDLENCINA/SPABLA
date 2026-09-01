/**
 * SPABLA V2 · UX-02 · Compositor de mensaje.
 *
 * Presentational. Mantiene contratos:
 *   - `draft` controlado desde `page.tsx`.
 *   - `onSend` es el `sendMessage` real de `page.tsx`.
 *   - Enter envía; Shift+Enter inserta salto de línea.
 *   - Estado `sending` + `sendError` sin cambios semánticos.
 *
 * UX-02 · Aplica la paleta y espaciado promovidos desde UX-01-R2 vía
 * `../styles.ts` (nunca importa `app/v2/design/**`). Sin cambios en
 * fetch, cliente Supabase, ni políticas de sesión.
 */

import type { CSSProperties, KeyboardEvent } from "react";

import { chatColor, chatFont, chatRadius, chatSpace } from "../styles";

const wrapperStyle: CSSProperties = {
  padding: `${chatSpace.md}px ${chatSpace.lg}px`,
  background: chatColor.surface,
  borderTop: `1px solid ${chatColor.border}`,
  display: "flex",
  flexDirection: "column",
  gap: chatSpace.xs,
  flexShrink: 0,
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: chatSpace.sm,
  flexWrap: "wrap",
  alignItems: "stretch",
};

const textareaStyle: CSSProperties = {
  flex: "1 1 260px",
  minWidth: 0,
  minHeight: 44,
  maxHeight: 160,
  padding: `${chatSpace.sm}px ${chatSpace.md}px`,
  fontSize: chatFont.size.base,
  fontFamily: "inherit",
  color: chatColor.textPrimary,
  background: chatColor.surface,
  border: `1px solid ${chatColor.border}`,
  borderRadius: chatRadius.pill,
  resize: "vertical",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  outline: "none",
};

const sendButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: `${chatSpace.sm}px ${chatSpace.xl}px`,
  fontSize: chatFont.size.base,
  fontWeight: chatFont.weight.semibold,
  color: disabled ? chatColor.textMuted : chatColor.spablaNavy,
  background: disabled ? chatColor.surfaceSubtle : chatColor.spablaCyan,
  border: `1px solid ${disabled ? chatColor.border : chatColor.spablaCyan}`,
  borderRadius: chatRadius.pill,
  cursor: disabled ? "not-allowed" : "pointer",
  minWidth: 108,
});

const captionStyle: CSSProperties = {
  fontSize: chatFont.size.xs,
  color: chatColor.textMuted,
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: chatFont.size.xs,
  color: chatColor.spablaCoral,
};

/** Mapa código → texto humano para errores de envío. */
function humanizeSendError(code: string): string {
  switch (code) {
    case "send_network":
      return "Sin conexión. Vuelve a intentarlo.";
    case "unauthorized":
      return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    case "forbidden":
      return "No tienes permiso para escribir aquí.";
    case "invalid_conversation":
    case "invalid_language":
    case "invalid_client_id":
    case "bad_request":
      return "No pudimos enviar el mensaje. Revisa el contenido.";
    case "empty_text":
      return "Escribe algo antes de enviar.";
    case "text_too_long":
      return "El mensaje es demasiado largo.";
    case "conflict":
      return "Ese mensaje ya se envió.";
    case "unavailable":
      return "El servicio está saturado. Reintenta en un momento.";
    default:
      return "No pudimos enviar el mensaje. Reintenta.";
  }
}

export function MessageComposer({
  draft,
  onDraftChange,
  onSend,
  disabled,
  sending,
  sendError,
  myLanguageLabel,
  canOperate,
}: Readonly<{
  draft: string;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  disabled: boolean;
  sending: boolean;
  sendError: string | null;
  myLanguageLabel: string;
  canOperate: boolean;
}>): React.JSX.Element {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  const sendDisabled = disabled || sending || draft.trim().length === 0;
  return (
    <section style={wrapperStyle} aria-label="Enviar mensaje" data-role="composer">
      <div style={rowStyle}>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={canOperate ? `Escribe en ${myLanguageLabel}…` : "Inicia sesión para escribir…"}
          disabled={disabled}
          style={textareaStyle}
          aria-label={`Nuevo mensaje en ${myLanguageLabel}`}
          rows={1}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          style={sendButtonStyle(sendDisabled)}
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      <span style={captionStyle}>
        Pulsa Enter para enviar · Mayúsculas + Enter para nueva línea
      </span>
      {sendError !== null && (
        <p style={errorStyle} role="alert">{humanizeSendError(sendError)}</p>
      )}
    </section>
  );
}
