/**
 * SPABLA V2 · Hito 9.2.2 · Formulario de sesión (email + contraseña).
 *
 * Presentational. Se muestra únicamente cuando NO hay sesión activa;
 * cuando el usuario está autenticado, la información de sesión aparece
 * en la cabecera de conversación y este bloque queda oculto.
 *
 * Recibe los mismos handlers y estado que ya viven en `page.tsx`; no
 * modifica el flujo de `signInWithPassword` ni el manejo de errores.
 * Los errores se muestran humanizados; nunca se pintan códigos crudos
 * ni credenciales.
 */

import type { CSSProperties } from "react";

const DEEP = "#0B0F19";
const BORDER = "#E2E8F0";
const CORAL = "#FF6B7A";
const AMBER_BG = "#FEF3C7";
const AMBER_BD = "#F59E0B";
const AMBER_FG = "#78350F";
const SPABLA_BLUE = "#1EC7FF";
const MUTED = "#475569";

const containerStyle: CSSProperties = {
  marginTop: "0.75rem",
  padding: "1rem",
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  fontWeight: 600,
  color: DEEP,
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  color: MUTED,
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const labelStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: MUTED,
};

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  fontSize: "0.95rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: DEEP,
  width: "100%",
  boxSizing: "border-box",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const submitStyle = (disabled: boolean): CSSProperties => ({
  padding: "0.55rem 1.1rem",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: disabled ? MUTED : DEEP,
  background: disabled ? "#F1F5F9" : SPABLA_BLUE,
  border: `1px solid ${disabled ? BORDER : SPABLA_BLUE}`,
  borderRadius: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  minWidth: 140,
});

const expiredBannerStyle: CSSProperties = {
  margin: 0,
  padding: "0.5rem 0.7rem",
  fontSize: "0.85rem",
  color: AMBER_FG,
  background: AMBER_BG,
  border: `1px solid ${AMBER_BD}`,
  borderRadius: 6,
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  color: CORAL,
};

/**
 * Humaniza el error de sign-in. Muchos errores del cliente Supabase
 * llegan como `error.message` en inglés; los tratamos como texto
 * humano si no coinciden con códigos conocidos.
 */
function humanizeSignInError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") && lower.includes("credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (lower.includes("network")) {
    return "Sin conexión. Vuelve a intentarlo.";
  }
  if (lower.includes("rate")) {
    return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
  }
  if (raw === "Email y contraseña requeridos") return raw;
  return "No pudimos iniciar sesión. Revisa el email y la contraseña.";
}

export function SessionArea({
  sessionExpired,
  sessionExpiredMessage,
  signInEmail,
  signInPassword,
  onSignInEmailChange,
  onSignInPasswordChange,
  signInError,
  signInBusy,
  onSignIn,
}: Readonly<{
  sessionExpired: boolean;
  sessionExpiredMessage: string;
  signInEmail: string;
  signInPassword: string;
  onSignInEmailChange: (next: string) => void;
  onSignInPasswordChange: (next: string) => void;
  signInError: string | null;
  signInBusy: boolean;
  onSignIn: () => void;
}>): React.JSX.Element {
  const disabled = signInBusy || signInEmail.trim().length === 0 || signInPassword.length === 0;
  return (
    <section style={containerStyle} aria-label="Iniciar sesión">
      <div>
        <h3 style={titleStyle}>Iniciar sesión</h3>
        <p style={hintStyle}>Introduce tus credenciales para participar en la conversación.</p>
      </div>
      {sessionExpired && (
        <p role="alert" style={expiredBannerStyle}>{sessionExpiredMessage}</p>
      )}
      <div style={fieldStyle}>
        <label htmlFor="spabla-session-email" style={labelStyle}>Email</label>
        <input
          id="spabla-session-email"
          type="email"
          autoComplete="email"
          value={signInEmail}
          onChange={(e) => onSignInEmailChange(e.target.value)}
          disabled={signInBusy}
          style={inputStyle}
          placeholder="tu@email.com"
        />
      </div>
      <div style={fieldStyle}>
        <label htmlFor="spabla-session-password" style={labelStyle}>Contraseña</label>
        <input
          id="spabla-session-password"
          type="password"
          autoComplete="current-password"
          value={signInPassword}
          onChange={(e) => onSignInPasswordChange(e.target.value)}
          disabled={signInBusy}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <button
          type="button"
          onClick={onSignIn}
          disabled={disabled}
          style={submitStyle(disabled)}
        >
          {signInBusy ? "Entrando…" : "Iniciar sesión"}
        </button>
      </div>
      {signInError !== null && (
        <p style={errorStyle} role="alert">{humanizeSignInError(signInError)}</p>
      )}
    </section>
  );
}
