"use client";

/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · Formulario de acceso OTP por email.
 *
 * Presentacional + estado local. Complementa el `SessionArea` con
 * contraseña sin reemplazarlo. Ambos formularios coexisten (contract
 * §7 y §11 orden Q2). El toggle entre "código" y "contraseña" vive
 * en `page.tsx`; este componente sólo dibuja y coordina el flujo
 * OTP → onboarding.
 *
 * Estado interno mínimo. El OTP nunca cruza `localStorage`,
 * `sessionStorage`, cookies, URL ni analytics. Vive en `useState`
 * el tiempo mínimo — se limpia tras verificación exitosa, cambio de
 * email, reenvío, desmontaje o error terminal.
 *
 * Concurrencia cliente: cada request pendiente lleva un `requestId`
 * monotónico; una respuesta que llega para un id obsoleto (porque el
 * usuario cambió email o volvió al paso 1) se descarta.
 *
 * Autoridad: Supabase Auth para el desafío OTP; el actor efectivo
 * viene del JWT retornado por `verifyOtp`. `POST /api/v2/onboarding`
 * es idempotente y no requiere payload adicional.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { messageFor, type OtpClientError, type OtpPublicState } from "@/lib/v2/client/otp-classify";
import { requestOtpEmail, type OtpRequestOutcome } from "@/lib/v2/client/otp-request";
import { onlyDigits, verifyOtpAndOnboard, type OtpVerifyOutcome } from "@/lib/v2/client/otp-verify";

const DEEP = "#0B0F19";
const BORDER = "#E2E8F0";
const CORAL = "#FF6B7A";
const AMBER_BG = "#FEF3C7";
const AMBER_BD = "#F59E0B";
const AMBER_FG = "#78350F";
const SPABLA_BLUE = "#1EC7FF";
const MUTED = "#475569";

/**
 * Cooldown UX-only. La barrera real vive server-side en Supabase Auth
 * (`max_frequency`, `sign_in_sign_ups`, `token_verifications`). Este
 * contador NO es una defensa de seguridad; simplemente evita que el
 * usuario spam el botón mientras espera al correo (contract §3, §7).
 */
const RESEND_COOLDOWN_SECONDS = 60;

// ─── Estilos ────────────────────────────────────────────────────────
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
const titleStyle: CSSProperties = { margin: 0, fontSize: "0.95rem", fontWeight: 600, color: DEEP };
const hintStyle: CSSProperties = { margin: 0, fontSize: "0.85rem", color: MUTED };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" };
const labelStyle: CSSProperties = { fontSize: "0.8rem", color: MUTED };
const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  fontSize: "0.95rem",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: DEEP,
  width: "100%",
  boxSizing: "border-box",
};
const codeInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "1.35rem",
  letterSpacing: "0.4em",
  textAlign: "center",
};
const rowStyle: CSSProperties = { display: "flex", gap: "0.5rem", flexWrap: "wrap" };
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
const secondaryStyle: CSSProperties = {
  padding: "0.5rem 0.9rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  color: DEEP,
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  cursor: "pointer",
};
const errorStyle: CSSProperties = { margin: 0, fontSize: "0.85rem", color: CORAL };
const infoBannerStyle: CSSProperties = {
  margin: 0,
  padding: "0.5rem 0.7rem",
  fontSize: "0.85rem",
  color: AMBER_FG,
  background: AMBER_BG,
  border: `1px solid ${AMBER_BD}`,
  borderRadius: 6,
};

// ─── Utilidades UI ─────────────────────────────────────────────────
/**
 * Enmascara el email para mostrarlo tras solicitar el código sin
 * confirmar la existencia visualmente: `a****@dom.tld`.
 */
export function maskEmailForDisplay(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.charAt(0);
  const stars = local.length > 1 ? "*".repeat(Math.min(4, local.length - 1)) : "";
  return `${head}${stars}${domain}`;
}

// ─── Props ──────────────────────────────────────────────────────────
export type OtpFormProps = Readonly<{
  supabase: SupabaseClient;
  /** Callback invocado tras onboarding OK; delega a la página. */
  onAuthenticated: () => void;
  /** Callback para volver al login por contraseña. */
  onSwitchToPassword: () => void;
  /** Test hook: sustituye el helper de solicitud (unit tests). */
  __requestOverride?: (client: SupabaseClient, email: string) => Promise<OtpRequestOutcome>;
  /** Test hook: sustituye el helper de verificación (unit tests). */
  __verifyOverride?: (
    client: SupabaseClient,
    email: string,
    token: string,
  ) => Promise<OtpVerifyOutcome>;
  /** Test hook: acelera el cooldown (unit tests). */
  __cooldownSecondsOverride?: number;
}>;

type Step = "email" | "code";

export function OtpForm({
  supabase,
  onAuthenticated,
  onSwitchToPassword,
  __requestOverride,
  __verifyOverride,
  __cooldownSecondsOverride,
}: OtpFormProps): React.JSX.Element {
  const [step, setStep] = useState<Step>("email");
  const [rawEmail, setRawEmail] = useState("");
  const [normalisedEmail, setNormalisedEmail] = useState("");
  const [code, setCode] = useState("");
  const [busyRequest, setBusyRequest] = useState(false);
  const [busyVerify, setBusyVerify] = useState(false);
  const [error, setError] = useState<OtpClientError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldownEndAt, setCooldownEndAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(0);

  // Concurrencia: cada operación en vuelo lleva su propio id. Al
  // llegar la respuesta comparamos contra `latestOp*Ref`; si no
  // coincide, la descartamos silenciosamente (contract §14 orden Q2).
  const latestRequestOpRef = useRef(0);
  const latestVerifyOpRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    // Reset on mount so React 19 StrictMode's double-invoked cleanup
    // (which fires between the two dev-mode mounts) does not leave the
    // ref stuck at `false` and silently drop every stale-op guard on
    // the second real render.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cooldownSeconds = __cooldownSecondsOverride ?? RESEND_COOLDOWN_SECONDS;
  const cooldownRemainingSeconds = cooldownEndAt !== null
    ? Math.max(0, Math.ceil((cooldownEndAt - nowMs) / 1000))
    : 0;
  const inCooldown = cooldownRemainingSeconds > 0;

  // Tick del contador. `Date.now()` reflejado en `nowMs` para que la
  // derivación de `cooldownRemainingSeconds` en render sea reactiva
  // sin depender de un setState hostil.
  useEffect(() => {
    if (cooldownEndAt === null) return;
    setNowMs(Date.now());
    const iv = setInterval(() => {
      if (!mountedRef.current) return;
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(iv);
  }, [cooldownEndAt]);

  const doRequest = useCallback(
    async (emailToUse: string): Promise<void> => {
      const opId = ++latestRequestOpRef.current;
      setBusyRequest(true);
      setError(null);
      setInfo(null);
      const runner = __requestOverride ?? requestOtpEmail;
      const outcome = await runner(supabase, emailToUse);
      if (!mountedRef.current) return;
      if (opId !== latestRequestOpRef.current) return; // respuesta obsoleta
      setBusyRequest(false);
      if (outcome.kind === "error") {
        setError(outcome.error);
        return;
      }
      setNormalisedEmail(outcome.normalisedEmail);
      setCooldownEndAt(Date.now() + cooldownSeconds * 1000);
      setNowMs(Date.now());
      setStep("code");
      setCode("");
      setInfo("Si la dirección es válida, hemos enviado un código para continuar.");
    },
    [supabase, __requestOverride, cooldownSeconds],
  );

  const doVerify = useCallback(async (): Promise<void> => {
    const digits = onlyDigits(code);
    if (digits.length !== 6) {
      setError({ public: "code_invalid_or_expired", internalKind: "short_code" });
      return;
    }
    const opId = ++latestVerifyOpRef.current;
    setBusyVerify(true);
    setError(null);
    setInfo(null);
    const runner = __verifyOverride ?? verifyOtpAndOnboard;
    const outcome = await runner(supabase, normalisedEmail, digits);
    if (!mountedRef.current) return;
    if (opId !== latestVerifyOpRef.current) return;
    setBusyVerify(false);
    if (outcome.kind === "verify_error") {
      setCode("");
      setError(outcome.error);
      return;
    }
    if (outcome.kind === "onboarding_error") {
      // La sesión es válida; el error es transitorio del onboarding.
      // No destruimos la sesión (contract §8). Permitimos reintentar.
      setError(outcome.error);
      return;
    }
    // Éxito completo: limpiamos secretos en memoria y devolvemos
    // control a la página para que ejecute el bootstrap.
    setCode("");
    setNormalisedEmail("");
    setRawEmail("");
    setStep("email");
    setError(null);
    setInfo(null);
    setCooldownEndAt(null);
    onAuthenticated();
  }, [code, supabase, __verifyOverride, normalisedEmail, onAuthenticated]);

  const doResend = useCallback(async (): Promise<void> => {
    if (inCooldown) return;
    // Limpiamos el código anterior en memoria; el server invalidará
    // el token anterior en su próximo replace.
    setCode("");
    setError(null);
    setInfo(null);
    await doRequest(normalisedEmail);
  }, [inCooldown, doRequest, normalisedEmail]);

  const backToEmail = useCallback(() => {
    // Invalidamos las operaciones pendientes y limpiamos memoria.
    latestRequestOpRef.current += 1;
    latestVerifyOpRef.current += 1;
    setStep("email");
    setCode("");
    setNormalisedEmail("");
    setError(null);
    setInfo(null);
    setCooldownEndAt(null);
    setBusyRequest(false);
    setBusyVerify(false);
  }, []);

  const emailIsBlocked = busyRequest || busyVerify;

  const errorMessage = useMemo(() => (error ? messageFor(error.public) : null), [error]);

  if (step === "email") {
    return (
      <section style={containerStyle} aria-label="Iniciar sesión con código">
        <div>
          <h3 style={titleStyle}>Acceder con código</h3>
          <p style={hintStyle}>
            Introduce tu email y te enviaremos un código de seis dígitos.
          </p>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="spabla-otp-email" style={labelStyle}>
            Email
          </label>
          <input
            id="spabla-otp-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={rawEmail}
            onChange={(e) => setRawEmail(e.target.value)}
            disabled={emailIsBlocked}
            style={inputStyle}
            placeholder="tu@email.com"
            aria-invalid={error?.public === "invalid_email" ? true : undefined}
            aria-describedby={errorMessage ? "spabla-otp-email-error" : undefined}
          />
        </div>
        <div style={rowStyle}>
          <button
            type="button"
            onClick={() => {
              void doRequest(rawEmail);
            }}
            disabled={emailIsBlocked || rawEmail.trim().length === 0}
            aria-busy={busyRequest || undefined}
            style={submitStyle(emailIsBlocked || rawEmail.trim().length === 0)}
          >
            {busyRequest ? "Enviando…" : "Recibir código"}
          </button>
          <button
            type="button"
            onClick={onSwitchToPassword}
            disabled={emailIsBlocked}
            style={secondaryStyle}
            aria-label="Acceder con contraseña"
          >
            Acceder con contraseña
          </button>
        </div>
        {errorMessage !== null && (
          <p id="spabla-otp-email-error" style={errorStyle} role="alert" aria-live="polite">
            {errorMessage}
          </p>
        )}
      </section>
    );
  }

  return (
    <section style={containerStyle} aria-label="Verificar código de acceso">
      <div>
        <h3 style={titleStyle}>Introduce el código</h3>
        <p style={hintStyle}>
          Hemos enviado un código a <strong>{maskEmailForDisplay(normalisedEmail)}</strong>. El
          código caduca en unos minutos.
        </p>
      </div>
      {info !== null && (
        <p style={infoBannerStyle} role="status" aria-live="polite">
          {info}
        </p>
      )}
      <div style={fieldStyle}>
        <label htmlFor="spabla-otp-code" style={labelStyle}>
          Código de 6 dígitos
        </label>
        <input
          id="spabla-otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(onlyDigits(e.target.value))}
          disabled={busyVerify}
          style={codeInputStyle}
          aria-invalid={error?.public === "code_invalid_or_expired" ? true : undefined}
          aria-describedby={errorMessage ? "spabla-otp-code-error" : undefined}
        />
      </div>
      <div style={rowStyle}>
        <button
          type="button"
          onClick={() => {
            void doVerify();
          }}
          disabled={busyVerify || code.length !== 6}
          aria-busy={busyVerify || undefined}
          style={submitStyle(busyVerify || code.length !== 6)}
        >
          {busyVerify ? "Verificando…" : "Verificar código"}
        </button>
        <button
          type="button"
          onClick={() => {
            void doResend();
          }}
          disabled={busyRequest || busyVerify || inCooldown}
          style={secondaryStyle}
          aria-label={inCooldown ? `Reenviar código en ${cooldownRemainingSeconds} segundos` : "Reenviar código"}
        >
          {inCooldown ? `Reenviar en ${cooldownRemainingSeconds}s` : "Reenviar código"}
        </button>
        <button
          type="button"
          onClick={backToEmail}
          disabled={busyVerify}
          style={secondaryStyle}
          aria-label="Cambiar email"
        >
          Cambiar email
        </button>
      </div>
      {errorMessage !== null && (
        <p id="spabla-otp-code-error" style={errorStyle} role="alert" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
