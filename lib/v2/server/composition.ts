/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Request-scoped server composition.
 *
 * Trusted server-only boundary. Verifies the caller's Supabase JWT
 * (getClaims / ES256 / JWKS-cached), promotes the verified `(actorId,
 * issuedAt)` tuple into the branded `VerifiedIdentity`, builds a
 * `TenantContext`, and returns a `SupabasePersistence` that runs under
 * the caller's `authenticated` RLS role. Never accepts client-supplied
 * identity fields. Never returns service_role material to the caller.
 *
 * @internal MUST NOT be imported from client bundles (marker: this file
 * is only referenced from `app/api/v2/**` route handlers, which run on
 * the server).
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SupabasePersistence } from "@engine/adapters/persistence/supabase/supabase-persistence";
import { buildTenantContext, type TenantContext } from "@engine/adapters/persistence/tenant-context";
import { buildVerifiedIdentityFromTrustedBoundary } from "@engine/adapters/persistence/identity";
import type { TenantId, ActorId } from "@engine/adapters/persistence/port";
import { asUUID, asISOTimestamp } from "@engine/types/ids";

const UUID_STRICT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Fase9UnauthorizedError = { readonly kind: "unauthorized"; readonly reason: string };
export type Fase9InvalidTenantError = { readonly kind: "invalid_tenant"; readonly reason: string };
export type Fase9CompositionError = Fase9UnauthorizedError | Fase9InvalidTenantError;

export class Fase9RequestError extends Error {
  readonly detail: Fase9CompositionError;
  constructor(detail: Fase9CompositionError) {
    super(detail.kind);
    this.name = "Fase9RequestError";
    this.detail = detail;
  }
}

function readAnonEnv(): { readonly url: string; readonly anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Configuration error. Log-free opaque failure to the caller.
    throw new Fase9RequestError({
      kind: "unauthorized",
      reason: "supabase env not configured",
    });
  }
  return { url, anonKey };
}

export function extractBearerToken(authorizationHeader: string | null | undefined): string {
  if (typeof authorizationHeader !== "string" || authorizationHeader.length === 0) {
    throw new Fase9RequestError({ kind: "unauthorized", reason: "missing authorization header" });
  }
  const prefix = "Bearer ";
  if (!authorizationHeader.startsWith(prefix)) {
    throw new Fase9RequestError({ kind: "unauthorized", reason: "invalid authorization scheme" });
  }
  const raw = authorizationHeader.slice(prefix.length).trim();
  if (raw.length === 0) {
    throw new Fase9RequestError({ kind: "unauthorized", reason: "empty bearer token" });
  }
  return raw;
}

export type VerifiedActor = {
  readonly actorId: ActorId;
  readonly issuedAt: string;
};

/**
 * Verifies a Supabase Auth JWT locally using JWKS. On any failure the
 * error surfaces opaquely — the raw provider message is discarded so it
 * cannot leak keys, headers or session material.
 */
export async function verifyJwt(token: string): Promise<VerifiedActor> {
  const { url, anonKey } = readAnonEnv();
  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let result: Awaited<ReturnType<typeof verifier.auth.getClaims>>;
  try {
    result = await verifier.auth.getClaims(token);
  } catch {
    throw new Fase9RequestError({ kind: "unauthorized", reason: "jwt verification failed" });
  }
  if (result.error || !result.data?.claims?.sub) {
    throw new Fase9RequestError({ kind: "unauthorized", reason: "jwt rejected" });
  }
  const sub = result.data.claims.sub;
  if (typeof sub !== "string" || !UUID_STRICT_RE.test(sub)) {
    throw new Fase9RequestError({ kind: "unauthorized", reason: "jwt subject invalid" });
  }
  const iatSeconds = typeof result.data.claims.iat === "number" ? result.data.claims.iat : 0;
  const issuedAt = new Date(iatSeconds > 0 ? iatSeconds * 1000 : Date.now()).toISOString();
  return { actorId: asUUID(sub), issuedAt };
}

function buildAuthenticatedClient(jwt: string): SupabaseClient {
  const { url, anonKey } = readAnonEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export type RequestScopedPersistence = {
  readonly persistence: SupabasePersistence;
  readonly tenantContext: TenantContext;
  readonly actor: VerifiedActor;
  /**
   * The authenticated Supabase client bound to the caller's JWT.
   * Exposed for other request-scoped adapters that also run under RLS
   * (e.g. `SupabaseTranslationStore`). Do NOT return this to the
   * browser or use it for privileged operations.
   */
  readonly authenticated: SupabaseClient;
};

/**
 * Builds a per-request `SupabasePersistence` bound to the caller's JWT.
 * The returned `TenantContext` matches the requested `tenantId`;
 * membership authority remains RLS (Fase 8 §5.2).
 */
export async function buildRequestScopedPersistence(input: {
  readonly authorizationHeader: string | null | undefined;
  readonly tenantId: string;
}): Promise<RequestScopedPersistence> {
  const token = extractBearerToken(input.authorizationHeader);
  if (typeof input.tenantId !== "string" || !UUID_STRICT_RE.test(input.tenantId)) {
    throw new Fase9RequestError({ kind: "invalid_tenant", reason: "tenant id malformed" });
  }
  const actor = await verifyJwt(token);
  const identity = buildVerifiedIdentityFromTrustedBoundary(
    actor.actorId,
    asISOTimestamp(actor.issuedAt),
    "supabase_auth_jwt",
  );
  const tenantContext = buildTenantContext(identity, asUUID(input.tenantId) as TenantId);
  const authenticated = buildAuthenticatedClient(token);
  const persistence = new SupabasePersistence({ authenticated });
  return { persistence, tenantContext, actor, authenticated };
}
