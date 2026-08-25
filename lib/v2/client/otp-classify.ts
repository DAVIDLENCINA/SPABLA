/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · OTP client-side error classifier.
 *
 * Pure mapping from provider `error_code` + HTTP status to a small,
 * closed alphabet of client-facing states. The alphabet is chosen so
 * that codes which the provider does NOT distinguish safely
 * (wrong / expired / reused / invalidated-by-resend) collapse to a
 * single opaque public label — see audit `Q1 §16` and OTP contract §6.
 *
 * Zero direct exposure of provider messages, SQLSTATE, stack traces or
 * account existence hints. Zero decoration with user email or token
 * material. The classifier is deterministic and safe to log at the
 * `internalKind` level.
 */

export type OtpPublicState =
  | "invalid_email"
  | "request_unavailable"
  | "cooldown_active"
  | "code_invalid_or_expired"
  | "network_unavailable"
  | "verify_unavailable"
  | "onboarding_unavailable";

export type OtpClientError = {
  readonly public: OtpPublicState;
  /** Sanitised classification for observability. Never contains PII. */
  readonly internalKind: string;
};

/**
 * Provider error surface accepted by the classifier. We intentionally
 * mirror only the fields the Supabase SDK exposes today
 * (`error_code`, `code`, `status`, `name`). If the SDK adds more
 * fields in a future version they are ignored here — the classifier
 * degrades to `verify_unavailable` / `request_unavailable` rather than
 * leaking the new field to the UI.
 */
export type ProviderErrorInput = {
  readonly error_code?: string | null;
  readonly code?: number | string | null;
  readonly status?: number | null;
  readonly name?: string | null;
  readonly message?: string | null;
};

const NETWORK_HINTS = /network|fetch|failed to fetch|abort/i;

/**
 * Classify a `signInWithOtp` (request) provider error.
 */
export function classifyOtpRequestError(err: ProviderErrorInput | null | undefined): OtpClientError {
  if (!err) return { public: "request_unavailable", internalKind: "unknown" };
  const code = String(err.error_code ?? "").toLowerCase();
  if (code === "over_email_send_rate_limit" || err.status === 429) {
    return { public: "cooldown_active", internalKind: "cooldown_active" };
  }
  if (code === "validation_failed" || err.status === 400) {
    return { public: "invalid_email", internalKind: "validation_failed" };
  }
  if (isNetworkError(err)) {
    return { public: "network_unavailable", internalKind: "network" };
  }
  return { public: "request_unavailable", internalKind: code || "provider_error" };
}

/**
 * Classify a `verifyOtp` (verify) provider error. The provider
 * returns `otp_expired` for all of: wrong code, truly expired code,
 * cross-email code, code invalidated by resend, and second use of a
 * successful code. The classifier preserves that opaqueness — the UI
 * MUST not distinguish these cases (Q1 §8).
 */
export function classifyOtpVerifyError(err: ProviderErrorInput | null | undefined): OtpClientError {
  if (!err) return { public: "verify_unavailable", internalKind: "unknown" };
  const code = String(err.error_code ?? "").toLowerCase();
  if (
    code === "otp_expired" ||
    err.status === 403 ||
    code === "invalid_otp"
  ) {
    return { public: "code_invalid_or_expired", internalKind: "otp_expired" };
  }
  if (code === "validation_failed" || err.status === 400) {
    return { public: "code_invalid_or_expired", internalKind: "validation_failed" };
  }
  if (code === "over_email_send_rate_limit" || err.status === 429) {
    return { public: "cooldown_active", internalKind: "cooldown_active" };
  }
  if (isNetworkError(err)) {
    return { public: "network_unavailable", internalKind: "network" };
  }
  return { public: "verify_unavailable", internalKind: code || "provider_error" };
}

/**
 * Human copy for each public state. Localisation is intentionally
 * limited to Spanish here — the SessionArea password path already
 * uses Spanish, and the 13-language surface is server-owned (contract
 * §17-bis). If Q3 needs multi-locale UI copy for OTP screens it
 * should route through the existing catalog, not extend this file.
 */
export function messageFor(state: OtpPublicState): string {
  switch (state) {
    case "invalid_email":
      return "Introduce una dirección de email válida.";
    case "request_unavailable":
      return "No pudimos enviar el código. Vuelve a intentarlo en unos segundos.";
    case "cooldown_active":
      return "Espera unos segundos antes de solicitar otro código.";
    case "code_invalid_or_expired":
      return "El código no es válido. Solicita uno nuevo.";
    case "network_unavailable":
      return "Sin conexión. Vuelve a intentarlo cuando tengas red.";
    case "verify_unavailable":
      return "No pudimos verificar el código ahora mismo. Reintenta en unos segundos.";
    case "onboarding_unavailable":
      return "Tu acceso está siendo procesado. Vuelve a intentarlo en unos segundos.";
  }
}

/**
 * Lightweight email format validator. Reject empty, missing `@`,
 * missing dot in the domain, and whitespace-only inputs. This mirrors
 * the classifier's "invalid_email" state — never authoritative for
 * identity, only a preflight to avoid an obviously wasted round trip.
 * The server (GoTrue) remains the authoritative validator.
 */
export function isProbablyValidEmail(raw: string): boolean {
  const s = raw.trim();
  if (s.length === 0) return false;
  if (s.length > 254) return false;
  if (/\s/.test(s)) return false;
  const at = s.indexOf("@");
  if (at <= 0 || at !== s.lastIndexOf("@")) return false;
  const domain = s.slice(at + 1);
  if (domain.length === 0) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return true;
}

/**
 * Client-side normalisation. Presented in the contract as **UX
 * preprocessing** — never as an authority of identity. The
 * authoritative `sub` continues to come from the JWT emitted by
 * Supabase Auth after `verifyOtp` (contract §7, audit §9 T16).
 */
export function normaliseEmailForUx(raw: string): string {
  return raw.trim().toLowerCase();
}

function isNetworkError(err: ProviderErrorInput): boolean {
  if (typeof err.name === "string" && err.name.toLowerCase() === "aborterror") {
    return true;
  }
  if (typeof err.message === "string" && NETWORK_HINTS.test(err.message)) {
    return true;
  }
  return false;
}
