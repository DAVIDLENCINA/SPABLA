"use client";

/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R2 · Puerta de acceso no autenticado.
 *
 * Componente productivo que encapsula la decisión de presentación
 * mostrada por `app/v2/chat/page.tsx` cuando no hay sesión:
 *
 *   · Durante el microwindow de restauración (`sessionRestored=false`)
 *     se muestra un banner neutro "Restaurando tu sesión…".
 *   · Cuando la restauración concluye sin sesión (`sessionRestored=true`)
 *     se decide qué método de autenticación mostrar según
 *     `authMethod`.
 *   · OTP es el método principal (contract Q2-R §1). SessionArea
 *     con email + contraseña queda como alternativa secundaria.
 *
 * Se extrajo desde `page.tsx` en Q2-R2 exclusivamente para permitir
 * que las pruebas conductuales de la decisión rendericen el mismo
 * árbol JSX que produce la página productiva — sin duplicar lógica.
 * La orquestación (session, bootstrap, polling, refresh) sigue
 * viviendo en `page.tsx`; este componente sólo dibuja.
 */

import type { CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { OtpForm } from "./OtpForm";
import { SessionArea } from "./SessionArea";

const restoringStyle: CSSProperties = {
  marginTop: "0.75rem",
  padding: "1.25rem 1rem",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  color: "#475569",
  fontSize: "0.9rem",
  textAlign: "center",
};

const switchToOtpStyle: CSSProperties = {
  marginTop: "0.5rem",
  padding: "0.4rem 0.9rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: "#0B0F19",
  background: "transparent",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  cursor: "pointer",
  alignSelf: "flex-start",
};

export type UnauthGateProps = Readonly<{
  /** `null` cuando aún no arrancó la restauración; en render real
   * viene siempre no-null desde `useSupabaseBrowserClient`. */
  supabase: SupabaseClient | null;
  /** `true` una vez concluida la restauración de sesión. */
  sessionRestored: boolean;
  /** Método actual de autenticación seleccionado. */
  authMethod: "password" | "otp";
  /** Cambia el método (delegado al setter de `page.tsx`). */
  setAuthMethod: (m: "password" | "otp") => void;
  /** Callback tras verificar el OTP + onboarding OK. */
  onAuthenticated: () => void;
  /** Props del SessionArea (login por contraseña) — se pasan tal cual. */
  sessionExpired: boolean;
  sessionExpiredMessage: string;
  signInEmail: string;
  signInPassword: string;
  onSignInEmailChange: (next: string) => void;
  onSignInPasswordChange: (next: string) => void;
  signInError: string | null;
  signInBusy: boolean;
  onSignIn: () => void;
}>;

export function UnauthGate(props: UnauthGateProps): React.JSX.Element | null {
  const {
    supabase,
    sessionRestored,
    authMethod,
    setAuthMethod,
    onAuthenticated,
    sessionExpired,
    sessionExpiredMessage,
    signInEmail,
    signInPassword,
    onSignInEmailChange,
    onSignInPasswordChange,
    signInError,
    signInBusy,
    onSignIn,
  } = props;

  // Q2-R2 · durante el microwindow de restauración mostramos un
  // aviso neutro. Coincide 1:1 con el markup de `page.tsx` previo a
  // la extracción, para que ningún test E2E o presentacional
  // observe una diferencia visual.
  if (!sessionRestored) {
    return (
      <section aria-label="Restaurando sesión" style={restoringStyle}>
        Restaurando tu sesión…
      </section>
    );
  }

  if (authMethod === "otp" && supabase) {
    return (
      <OtpForm
        supabase={supabase}
        onAuthenticated={onAuthenticated}
        onSwitchToPassword={() => setAuthMethod("password")}
      />
    );
  }

  if (authMethod === "password") {
    return (
      <>
        <SessionArea
          sessionExpired={sessionExpired}
          sessionExpiredMessage={sessionExpiredMessage}
          signInEmail={signInEmail}
          signInPassword={signInPassword}
          onSignInEmailChange={onSignInEmailChange}
          onSignInPasswordChange={onSignInPasswordChange}
          signInError={signInError}
          signInBusy={signInBusy}
          onSignIn={onSignIn}
        />
        <button
          type="button"
          onClick={() => setAuthMethod("otp")}
          style={switchToOtpStyle}
          aria-label="Acceder con código enviado por email (método principal)"
        >
          Acceder con código
        </button>
      </>
    );
  }

  return null;
}
