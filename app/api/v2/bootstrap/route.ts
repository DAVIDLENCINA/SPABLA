/**
 * SPABLA V2 — Fase 9 · Hito 9.3.1-Q3 · GET /api/v2/bootstrap.
 *
 * Authenticated, server-authoritative bootstrap that replaces the
 * productive dependency on `runSeed` + `spabla_v2_fase9_seed` for the
 * chat page. Returns the deterministic selection defined by contract
 * Q2 §10. RLS enforces isolation; the caller's JWT is bound to a
 * per-request Supabase client with `persistSession=false,
 * autoRefreshToken=false`. Never uses `service_role`.
 *
 * Contract:
 *
 *   GET /api/v2/bootstrap
 *     Headers: Authorization: Bearer <access_token>
 *
 *   200 OK
 *     { actor: {actorId,email},
 *       memberships: [{tenantId,tenantName,role,isActive}...],
 *       selectedTenantId: string | null,
 *       conversations: [{conversationId,tenantId,language,createdAt}...],
 *       selectedConversationId: string | null,
 *       canOperate: boolean
 *     }
 *
 *   Every response carries `X-SPABLA-Correlation-Id: <UUID v4>` and,
 *   for 4xx/5xx, the sanitized `{error, correlationId}` envelope of
 *   `lib/v2/server/http-error.ts`.
 *
 * Alphabet of failures (opaque public surface):
 *
 *   401 unauthorized — missing/malformed Authorization, invalid or
 *                       expired JWT, identity coherence mismatch.
 *   405 method_not_allowed — non-GET verb. Delivered as opaque
 *                       `not_found` in the public body (mirrors the
 *                       `messages/route.ts` convention of not
 *                       advertising alternative verbs to unauthorised
 *                       peers).
 *   500 internal    — unclassified server failure.
 *   503 unavailable — transient dependency failure (Supabase auth /
 *                     PostgREST unreachable, RLS query error).
 */

import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import {
  extractBearerToken,
  Fase9RequestError,
  verifyJwt,
  type VerifiedActor,
} from "@/lib/v2/server/composition";
import {
  buildBootstrapPayload,
  BootstrapQueryError,
} from "@/lib/v2/server/bootstrap";
import {
  logSanitizedError,
  newCorrelationId,
  opaqueError,
  successJson,
  type ErrorPhase,
  type PublicErrorCode,
} from "@/lib/v2/server/http-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "/api/v2/bootstrap";

function failure(
  status: number,
  code: PublicErrorCode,
  phase: ErrorPhase,
  internalKind: string,
  correlationId: string,
  method: string,
): Response {
  logSanitizedError(correlationId, {
    endpoint: ENDPOINT,
    method,
    status,
    code,
    phase,
    internalKind,
  });
  return opaqueError(status, code, correlationId);
}

function readAnonEnv(): { readonly url: string; readonly anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export async function GET(req: NextRequest): Promise<Response> {
  const correlationId = newCorrelationId();
  const authorizationHeader = req.headers.get("authorization");
  const env = readAnonEnv();
  if (env === null) {
    return failure(500, "internal", "internal", "supabase_env_missing", correlationId, "GET");
  }

  let token: string;
  try {
    token = extractBearerToken(authorizationHeader);
  } catch (err: unknown) {
    if (err instanceof Fase9RequestError && err.detail.kind === "unauthorized") {
      return failure(401, "unauthorized", "authentication", err.detail.reason.replace(/\s+/g, "_"), correlationId, "GET");
    }
    return failure(401, "unauthorized", "authentication", "missing_authorization", correlationId, "GET");
  }

  let actor: VerifiedActor;
  try {
    actor = await verifyJwt(token);
  } catch (err: unknown) {
    if (err instanceof Fase9RequestError && err.detail.kind === "unauthorized") {
      return failure(401, "unauthorized", "authentication", err.detail.reason.replace(/\s+/g, "_"), correlationId, "GET");
    }
    return failure(401, "unauthorized", "authentication", "jwt_verification_failed", correlationId, "GET");
  }
  const actorId = actor.actorId;
  // Q3-R §FASE 4: single identity validation per request. Email comes
  // from the verified JWT claims — we do NOT call `auth.getUser()` a
  // second time. An auth-service 429/5xx would otherwise surface here
  // as a spurious 401 and destroy the caller's session in the browser.
  const actorEmail = actor.email ?? "";

  const authenticated = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  let payload: Awaited<ReturnType<typeof buildBootstrapPayload>>;
  try {
    payload = await buildBootstrapPayload({ authenticated, actorId, actorEmail });
  } catch (err: unknown) {
    if (err instanceof BootstrapQueryError) {
      return failure(503, "unavailable", "infrastructure", "db_transient", correlationId, "GET");
    }
    return failure(500, "internal", "internal", "unknown", correlationId, "GET");
  }

  return successJson(200, payload, correlationId);
}

// Explicit method rejection: any verb other than GET returns opaque
// `not_found` (405 semantics without leaking Allow: GET to unauthorised
// peers). Mirrors the pattern of hito 9.2.5-C on `/api/v2/seed`.
async function methodNotAllowed(method: string): Promise<Response> {
  const correlationId = newCorrelationId();
  return failure(404, "not_found", "structural", "method_not_allowed", correlationId, method);
}

export async function POST(): Promise<Response> { return methodNotAllowed("POST"); }
export async function PUT(): Promise<Response> { return methodNotAllowed("PUT"); }
export async function PATCH(): Promise<Response> { return methodNotAllowed("PATCH"); }
export async function DELETE(): Promise<Response> { return methodNotAllowed("DELETE"); }
export async function HEAD(): Promise<Response> { return methodNotAllowed("HEAD"); }
