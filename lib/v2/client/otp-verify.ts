/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · OTP verify helper.
 *
 * Wraps `supabase.auth.verifyOtp({type:'email', email, token})` and,
 * on success, invokes `POST /api/v2/onboarding` with the freshly
 * obtained access token. On onboarding failure the session is
 * PRESERVED (contract §8): the user has a valid session; only the
 * server-side provisioning failed transiently. UI shows a
 * recoverable error.
 *
 * Never fabricates or mutates a JWT. Never persists the OTP or the
 * access token beyond what the SDK caches natively. Zero
 * `console.log` of secrets.
 */

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { classifyOtpVerifyError, type OtpClientError } from "./otp-classify";
import { toProviderInput } from "./otp-request";

export type OtpVerifyOutcome =
  | { readonly kind: "ok"; readonly session: Session; readonly tenantId: string; readonly role: string; readonly label: string }
  | { readonly kind: "verify_error"; readonly error: OtpClientError }
  | { readonly kind: "onboarding_error"; readonly session: Session; readonly error: OtpClientError };

/**
 * Verify the six-digit OTP and drive onboarding once. Idempotent
 * by design — the endpoint `POST /api/v2/onboarding` is idempotent
 * (contract 9.3.2-A §14 rows 5-13).
 */
export async function verifyOtpAndOnboard(
  supabase: SupabaseClient,
  normalisedEmail: string,
  token: string,
): Promise<OtpVerifyOutcome> {
  const numericToken = onlyDigits(token);
  if (numericToken.length !== 6) {
    return {
      kind: "verify_error",
      error: classifyOtpVerifyError({ error_code: "validation_failed", status: 400 }),
    };
  }
  const verifyRes = await supabase.auth.verifyOtp({
    type: "email",
    email: normalisedEmail,
    token: numericToken,
  });
  if (verifyRes.error) {
    return {
      kind: "verify_error",
      error: classifyOtpVerifyError(toProviderInput(verifyRes.error)),
    };
  }
  const session = verifyRes.data.session;
  if (session === null) {
    // Provider did not return a session even though there was no
    // error — treat as opaque verify failure. Never fabricate a
    // session locally.
    return {
      kind: "verify_error",
      error: { public: "verify_unavailable", internalKind: "no_session_returned" },
    };
  }
  // Kick off onboarding with the freshly issued access token. If the
  // actor was already provisioned, the endpoint returns 200
  // idempotently (contract 9.3.2-A §14 row 6). Any transport error or
  // server error is classified as `onboarding_unavailable` — session
  // is preserved.
  const onboardingOutcome = await callOnboarding(session.access_token);
  if (!onboardingOutcome.ok) {
    return {
      kind: "onboarding_error",
      session,
      error: {
        public: "onboarding_unavailable",
        internalKind: onboardingOutcome.internalKind,
      },
    };
  }
  return {
    kind: "ok",
    session,
    tenantId: onboardingOutcome.tenantId,
    role: onboardingOutcome.role,
    label: onboardingOutcome.label,
  };
}

type OnboardingCallOk = {
  readonly ok: true;
  readonly tenantId: string;
  readonly role: string;
  readonly label: string;
};
type OnboardingCallErr = { readonly ok: false; readonly internalKind: string };

async function callOnboarding(
  accessToken: string,
): Promise<OnboardingCallOk | OnboardingCallErr> {
  try {
    const res = await fetch("/api/v2/onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: "",
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, internalKind: `onboarding_status_${res.status}` };
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, internalKind: "onboarding_body_malformed" };
    }
    if (parsed === null || typeof parsed !== "object") {
      return { ok: false, internalKind: "onboarding_body_malformed" };
    }
    const p = parsed as { tenantId?: unknown; role?: unknown; label?: unknown };
    if (typeof p.tenantId !== "string" || typeof p.role !== "string" || typeof p.label !== "string") {
      return { ok: false, internalKind: "onboarding_body_incomplete" };
    }
    return { ok: true, tenantId: p.tenantId, role: p.role, label: p.label };
  } catch {
    return { ok: false, internalKind: "onboarding_network" };
  }
}

/**
 * Strips every non-digit character. The UI relies on this to accept
 * pastes such as `"123 456"` or `"123-456"` and to reject alphabetic
 * garbage before the request even leaves the browser.
 */
export function onlyDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, 6);
}
