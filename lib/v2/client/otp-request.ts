/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2 · OTP request helper.
 *
 * Thin, testable wrapper around `supabase.auth.signInWithOtp`. The
 * helper enforces the two invariants that the audit closed as
 * mandatory for Q2:
 *
 *   · `shouldCreateUser: true` — uniformises the status/body for new
 *     vs existing users, preventing the enumeration surface Q1 §9
 *     found in the raw provider API.
 *   · `email.trim().toLowerCase()` — client-side UX normalisation.
 *     NEVER an identity authority; the authoritative `sub` still
 *     comes from the JWT emitted by Supabase Auth after `verifyOtp`.
 *
 * The helper returns a discriminated outcome so the caller does not
 * need to know the SDK error surface. Zero `console.log`, zero
 * exposure of provider messages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyOtpRequestError,
  isProbablyValidEmail,
  normaliseEmailForUx,
  type OtpClientError,
  type ProviderErrorInput,
} from "./otp-classify";

export type OtpRequestOutcome =
  | { readonly kind: "ok"; readonly normalisedEmail: string }
  | { readonly kind: "error"; readonly error: OtpClientError };

/**
 * Fire the request. Never throws for expected errors; only rejects
 * if the caller passed an unusable client.
 */
export async function requestOtpEmail(
  supabase: SupabaseClient,
  rawEmail: string,
): Promise<OtpRequestOutcome> {
  const email = normaliseEmailForUx(rawEmail);
  if (!isProbablyValidEmail(email)) {
    return {
      kind: "error",
      error: classifyOtpRequestError({ error_code: "validation_failed" }),
    };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    return {
      kind: "error",
      error: classifyOtpRequestError(toProviderInput(error)),
    };
  }
  return { kind: "ok", normalisedEmail: email };
}

/**
 * Extracts the fields the classifier consumes from a Supabase
 * `AuthError`/`Error` instance. Isolated to keep `otp-classify.ts`
 * pure and independent from the SDK types.
 */
export function toProviderInput(err: unknown): ProviderErrorInput {
  if (err === null || err === undefined || typeof err !== "object") {
    return {};
  }
  const asRecord = err as Record<string, unknown>;
  return {
    error_code:
      typeof asRecord.error_code === "string"
        ? (asRecord.error_code as string)
        : typeof asRecord.code === "string"
          ? (asRecord.code as string)
          : null,
    code:
      typeof asRecord.code === "number"
        ? (asRecord.code as number)
        : typeof asRecord.code === "string"
          ? (asRecord.code as string)
          : null,
    status: typeof asRecord.status === "number" ? (asRecord.status as number) : null,
    name: typeof asRecord.name === "string" ? (asRecord.name as string) : null,
    message: typeof asRecord.message === "string" ? (asRecord.message as string) : null,
  };
}
