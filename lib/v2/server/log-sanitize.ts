/**
 * SPABLA V2 · Hito 9.2.5-C · Log sanitizer for the dev seed endpoint.
 *
 * Extracts a small, whitelisted set of fields from an arbitrary thrown
 * value so the server can emit a structured log line without ever
 * echoing:
 *   - Supabase / OAuth tokens or keys.
 *   - user emails, passwords or ids that appear in an exception message.
 *   - Authorization headers.
 *   - full request bodies or environment variables.
 *   - stack traces (which may embed sensitive strings).
 *
 * The whitelist is the exhaustive list of internal error codes that
 * `runFase9Seed` throws today. Any other message is bucketed as
 * `unknown_error`; its actual text never reaches the log line. If a
 * new internal code is introduced without extending the whitelist, it
 * degrades silently to `unknown_error` — never to an unsanitized
 * payload.
 *
 * Pure, synchronous, no external dependencies. Testable in isolation.
 */

import "server-only";

/**
 * Whitelist of stable seed error codes emitted by `lib/v2/server/seed.ts`.
 * Adding a new code here requires it to appear verbatim in seed.ts and
 * to carry no dynamic content (no interpolation, no user data).
 */
const KNOWN_SEED_CODES = new Set<string>([
  "seed_env_missing",
  "seed_create_user_failed",
  "seed_list_users_failed",
  "seed_update_password_failed",
  "seed_list_users_too_many_pages",
  "seed_create_tenant_failed",
  "seed_create_conversation_failed",
]);

const SEED_PHASE_BY_CODE: Readonly<Record<string, string>> = {
  seed_env_missing: "env",
  seed_create_user_failed: "user_setup",
  seed_update_password_failed: "user_setup",
  seed_list_users_failed: "user_lookup",
  seed_list_users_too_many_pages: "user_lookup",
  seed_create_tenant_failed: "tenant_setup",
  seed_create_conversation_failed: "conversation_setup",
};

export type SanitizedError = {
  /** Constructor name of the Error, or `NonError` when a non-Error was thrown. */
  readonly name: string;
  /** Whitelisted internal code, or `unknown_error` when the message is not on the whitelist. */
  readonly code: string;
  /** Coarse phase of the seed pipeline where the failure occurred. */
  readonly phase: string;
};

/**
 * Reduce an unknown thrown value to a safe triple `{name, code, phase}`.
 * Never returns the original error message or stack. Never echoes any
 * caller-provided string.
 */
export function sanitizeError(err: unknown): SanitizedError {
  if (err instanceof Error) {
    const name = typeof err.name === "string" && err.name.length > 0 ? err.name : "Error";
    const message = typeof err.message === "string" ? err.message : "";
    const code = KNOWN_SEED_CODES.has(message) ? message : "unknown_error";
    const phase = SEED_PHASE_BY_CODE[code] ?? "unknown";
    return { name, code, phase };
  }
  return { name: "NonError", code: "unknown_error", phase: "unknown" };
}
