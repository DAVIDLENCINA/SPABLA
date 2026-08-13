/**
 * SPABLA V2 · Hito 9.2.2 · Compositor de mensaje.
 *
 * Presentational. Recibe:
 *   - `draft` (controlado desde `page.tsx`);
 *   - `onDraftChange`;
 *   - `onSend` (mismo handler `sendMessage` de `page.tsx`);
 *   - `disabled`, `sending`, `sendError`;
 *   - `myLanguageLabel` para el placeholder humanizado.
 *
 * Comportamiento:
 *   - Textarea que crece de 1 a 4 líneas visibles (auto-grow por CSS).
 *   - Enter envía; Shift+Enter añade nueva línea (mismo contrato que hoy).
 *   - Botón "Enviar" con estado sending idéntico.
 *   - No cambia el submit handler.
 *   - En móvil el botón queda debajo o al lado según ancho.
 */

import type { CSSProperties, KeyboardEvent } from "react";

const DEEP = "#0B0F19";
const BORDER = "#E2E8F0";
const CORAL = "#FF6B7A";
const MUTED = "#475569";
const SPABLA_BLUE = "#1EC7FF";

const wrapperStyle: CSSProperties = {
  marginTop: "0.75rem",
  padding: "0.75rem 1rem",
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
  alignItems: "stretch",
};

const textareaStyle: CSSProperties = {
  flex: "1 1 260px",
  minWidth: 0,
  minHeight: 44,
  maxHeight: 160,
  padding: "0.55rem 0.7rem",
  fontSize: "0.95rem",
  fontFamily: "inherit",
  color: DEEP,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  resize: "vertical",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const sendButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "0.55rem 1.1rem",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: disabled ? MUTED : DEEP,
  background: disabled ? "#F1F5F9" : SPABLA_BLUE,
  border: `1px solid ${disabled ? BORDER : SPABLA_BLUE}`,
  borderRadius: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  minWidth: 100,
});

const captionStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: MUTED,
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  color: CORAL,
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
    <section style={wrapperStyle} aria-label="Enviar mensaje">
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
