/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Messages endpoint (list + send).
 * SPABLA V2 · Hito 9.2.5-D · Authorization semantics + correlation ID.
 *
 * GET  /api/v2/messages?tenantId=...&conversationId=...&to=en
 *   → Returns the last N persisted messages plus their translation into
 *     the requested target language. Persistence goes through
 *     `SupabasePersistence.listMessages` under the caller's JWT.
 *
 * POST /api/v2/messages
 *   Body: { tenantId, conversationId, text, language, clientMessageId }
 *   → Persists the original text via `SupabasePersistence.saveMessage`.
 *     Idempotency is provided by client-supplied `clientMessageId`.
 *     Never accepts client-supplied `senderId`; the sender is the
 *     JWT-verified `actor.actorId`.
 *
 * HTTP semantics (Hito 9.2.5-D canonical matrix):
 *
 *   400 bad_request  — structurally invalid request. Never leaks WHICH
 *                       field failed; the granular reason lives only in
 *                       the sanitized server log's `internalKind`.
 *   401 unauthorized — authentication failure ONLY (missing/malformed
 *                       Authorization, invalid/expired JWT, identity
 *                       coherence mismatch). This is the ONLY status
 *                       that legitimately triggers client auth-recovery.
 *   404 not_found    — resource does not exist OR is invisible to the
 *                       caller (RLS block, missing/inactive membership,
 *                       cross-tenant target). GET LIST keeps returning
 *                       200 [] for the same conditions; POST returns
 *                       404 so its response is indistinguishable
 *                       whether the target is missing or foreign.
 *   409 conflict     — genuine idempotency/integrity collision.
 *   503 unavailable  — transient dependency failure. Retryable.
 *   500 internal     — unclassified.
 *
 *   403 forbidden    — RESERVED. Not emitted today. Will be issued when
 *                       an explicit role-based deny lands on a resource
 *                       already visible to the caller. Kept in the
 *                       public alphabet so a future policy can adopt
 *                       it without a public-surface change.
 *
 * Every response — success and failure — carries a
 * `X-SPABLA-Correlation-Id: <UUID v4>` header. Error bodies echo the
 * same UUID as `correlationId`; success bodies do NOT include it (the
 * existing 200/201 shapes are byte-preserved).
 */

import type { NextRequest } from "next/server";

import {
  buildRequestScopedPersistence,
  Fase9RequestError,
} from "@/lib/v2/server/composition";
import {
  buildTranslationStore,
  getProcessSingleFlight,
  openAIProviderForTranslationStore,
  CURRENT_TRANSLATION_VERSION,
} from "@/lib/v2/server/translation-runtime";
import {
  CORRELATION_HEADER,
  logSanitizedError,
  newCorrelationId,
  opaqueError,
  successJson,
  type ErrorPhase,
  type PublicErrorCode,
} from "@/lib/v2/server/http-error";
import { asISOTimestamp, asUUID } from "@engine/types/ids";
import { isLangCode } from "@engine/types/language";
import { resolveTranslatedMessages } from "@engine/adapters/translation-store/resolve-translated-messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 1000;
const PAGE_SIZE = 100;

const ENDPOINT = "/api/v2/messages";

/**
 * Map a persistence-adapter error code to the public 7-item alphabet.
 * The intermediate `internalKind` is preserved for the sanitized log
 * but never appears in the public body.
 */
function mapPersistenceCodeToPublic(
  code: string,
): { status: number; publicCode: PublicErrorCode; phase: ErrorPhase; internalKind: string } {
  if (code === "identity_invalid") {
    return { status: 401, publicCode: "unauthorized", phase: "authentication", internalKind: "identity_invalid" };
  }
  if (code === "unauthorized") {
    // Retained for defence in depth. Post-Hito 9.2.5-D no adapter
    // path emits `unauthorized` (SQLSTATE 42501 now maps to
    // `not_found`); if a new emitter appears in future, its default
    // interpretation stays "authentication failure" and we log the
    // arrival for triage.
    return { status: 401, publicCode: "unauthorized", phase: "authentication", internalKind: "identity_invalid" };
  }
  if (code === "not_found") {
    return { status: 404, publicCode: "not_found", phase: "authorization", internalKind: "hidden_by_rls" };
  }
  if (code === "conflict") {
    return { status: 409, publicCode: "conflict", phase: "integrity", internalKind: "unique_violation" };
  }
  if (code === "constraint_violation" || code === "tenant_context_invalid") {
    return { status: 400, publicCode: "bad_request", phase: "structural", internalKind: "constraint_violation" };
  }
  if (code === "unavailable") {
    return { status: 503, publicCode: "unavailable", phase: "infrastructure", internalKind: "db_transient" };
  }
  return { status: 500, publicCode: "internal", phase: "internal", internalKind: "unknown" };
}

/**
 * Build the response for a composition-layer failure (auth or
 * structural). The correlation ID is minted once and echoed in both
 * body and header. Sanitized log emitted for authentication failures
 * ONLY; routine structural failures (bad_request from client input)
 * are NOT logged.
 */
function respondToCompositionError(
  err: unknown,
  correlationId: string,
  method: string,
): Response {
  if (err instanceof Fase9RequestError) {
    if (err.detail.kind === "unauthorized") {
      logSanitizedError(correlationId, {
        endpoint: ENDPOINT,
        method,
        status: 401,
        code: "unauthorized",
        phase: "authentication",
        internalKind: "jwt_verification_failed",
      });
      return opaqueError(401, "unauthorized", correlationId);
    }
    if (err.detail.kind === "invalid_tenant") {
      // Structural failure from client input → NOT logged.
      return opaqueError(400, "bad_request", correlationId);
    }
  }
  // Unexpected exception — log and surface as 500.
  logSanitizedError(correlationId, {
    endpoint: ENDPOINT,
    method,
    status: 500,
    code: "internal",
    phase: "internal",
    internalKind: "unknown",
  });
  return opaqueError(500, "internal", correlationId);
}

/**
 * Build the response for a persistence-layer failure. Selective
 * logging per hito 9.2.5-D §LOGGING: 401, 404 (write-block), 409, 503
 * and 500 emit a sanitized log line; 400 does NOT (routine client
 * validation).
 */
function respondToPersistenceError(
  err: unknown,
  correlationId: string,
  method: string,
): Response {
  const anyErr = err as { code?: string } | null | undefined;
  const rawCode = typeof anyErr?.code === "string" ? anyErr.code : "";
  const mapped = mapPersistenceCodeToPublic(rawCode);
  if (mapped.status !== 400) {
    logSanitizedError(correlationId, {
      endpoint: ENDPOINT,
      method,
      status: mapped.status,
      code: mapped.publicCode,
      phase: mapped.phase,
      internalKind: mapped.internalKind,
    });
  }
  return opaqueError(mapped.status, mapped.publicCode, correlationId);
}

export async function GET(req: NextRequest): Promise<Response> {
  const correlationId = newCorrelationId();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "";
  const conversationId = url.searchParams.get("conversationId") ?? "";
  const targetLang = (url.searchParams.get("to") ?? "").toLowerCase();

  if (!UUID_RE.test(conversationId)) {
    return opaqueError(400, "bad_request", correlationId);
  }
  if (!isLangCode(targetLang)) {
    return opaqueError(400, "bad_request", correlationId);
  }

  let scope;
  try {
    scope = await buildRequestScopedPersistence({
      authorizationHeader: req.headers.get("authorization"),
      tenantId,
    });
  } catch (err) {
    return respondToCompositionError(err, correlationId, "GET");
  }

  let result;
  try {
    const translationStore = buildTranslationStore({ authenticated: scope.authenticated });
    result = await resolveTranslatedMessages({
      persistence: scope.persistence,
      translationStore,
      translate: openAIProviderForTranslationStore,
      tenantContext: scope.tenantContext,
      conversationId,
      targetLanguage: targetLang,
      translationVersion: CURRENT_TRANSLATION_VERSION,
      pageLimit: PAGE_SIZE,
      singleFlight: getProcessSingleFlight(),
    });
  } catch (err) {
    return respondToPersistenceError(err, correlationId, "GET");
  }

  return successJson(200, { items: result.items, actorId: result.actorId }, correlationId);
}

export async function POST(req: NextRequest): Promise<Response> {
  const correlationId = newCorrelationId();
  let body: {
    tenantId?: unknown;
    conversationId?: unknown;
    text?: unknown;
    language?: unknown;
    clientMessageId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return opaqueError(400, "bad_request", correlationId);
  }

  const tenantIdRaw = typeof body.tenantId === "string" ? body.tenantId : "";
  const conversationIdRaw = typeof body.conversationId === "string" ? body.conversationId : "";
  const text = typeof body.text === "string" ? body.text : "";
  const languageRaw = typeof body.language === "string" ? body.language.toLowerCase() : "";
  const clientMessageIdRaw = typeof body.clientMessageId === "string" ? body.clientMessageId : "";

  if (!UUID_RE.test(conversationIdRaw)) return opaqueError(400, "bad_request", correlationId);
  if (!isLangCode(languageRaw)) return opaqueError(400, "bad_request", correlationId);
  if (text.trim().length === 0) return opaqueError(400, "bad_request", correlationId);
  if (text.length > MAX_TEXT_LENGTH) return opaqueError(400, "bad_request", correlationId);
  if (!UUID_RE.test(clientMessageIdRaw)) return opaqueError(400, "bad_request", correlationId);

  let scope;
  try {
    scope = await buildRequestScopedPersistence({
      authorizationHeader: req.headers.get("authorization"),
      tenantId: tenantIdRaw,
    });
  } catch (err) {
    return respondToCompositionError(err, correlationId, "POST");
  }

  const createdAt = asISOTimestamp(new Date().toISOString());

  try {
    await scope.persistence.saveMessage(scope.tenantContext, {
      tenantId: scope.tenantContext.tenantId,
      conversationId: asUUID(conversationIdRaw),
      messageId: asUUID(clientMessageIdRaw),
      senderId: scope.actor.actorId,
      text,
      language: languageRaw,
      createdAt,
    });
  } catch (err) {
    return respondToPersistenceError(err, correlationId, "POST");
  }

  return successJson(
    201,
    {
      messageId: clientMessageIdRaw,
      senderId: scope.actor.actorId,
      createdAt,
    },
    correlationId,
  );
}

// Re-export so route-adjacent tests can assert the header name without
// importing internals of the http-error helper.
export { CORRELATION_HEADER };
