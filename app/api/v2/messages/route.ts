/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Messages endpoint (list + send).
 *
 * GET  /api/v2/messages?tenantId=...&conversationId=...&to=en
 *   → Returns the last N persisted messages plus their translation into
 *     the requested target language. Persistence goes through
 *     `SupabasePersistence.listMessages` under the caller's JWT.
 *
 * POST /api/v2/messages
 *   Body: { tenantId, conversationId, text, language }
 *   → Persists the original text via `SupabasePersistence.saveMessage`.
 *     Idempotency is provided by client-supplied `clientMessageId`.
 *     Never accepts client-supplied `senderId`; the sender is the
 *     JWT-verified `actor.actorId`.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  buildRequestScopedPersistence,
  Fase9RequestError,
} from "@/lib/v2/server/composition";
import { translateText } from "@/lib/v2/server/translate";
import { asISOTimestamp, asUUID } from "@engine/types/ids";
import { isLangCode } from "@engine/types/language";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 1000;
const PAGE_SIZE = 100;

function opaqueError(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

function mapCompositionError(err: unknown): NextResponse {
  if (err instanceof Fase9RequestError) {
    if (err.detail.kind === "unauthorized") return opaqueError(401, "unauthorized");
    if (err.detail.kind === "invalid_tenant") return opaqueError(400, "invalid_tenant");
  }
  return opaqueError(500, "internal");
}

function mapPersistenceError(err: unknown): NextResponse {
  const anyErr = err as { code?: string } | null | undefined;
  const code = typeof anyErr?.code === "string" ? anyErr.code : "";
  if (code === "identity_invalid" || code === "unauthorized") {
    return opaqueError(401, "unauthorized");
  }
  if (code === "membership_denied") {
    return opaqueError(403, "forbidden");
  }
  if (code === "not_found") {
    return opaqueError(404, "not_found");
  }
  if (code === "conflict") {
    return opaqueError(409, "conflict");
  }
  if (code === "constraint_violation" || code === "tenant_context_invalid") {
    return opaqueError(400, "bad_request");
  }
  if (code === "unavailable") {
    return opaqueError(503, "unavailable");
  }
  return opaqueError(500, "internal");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? "";
  const conversationId = url.searchParams.get("conversationId") ?? "";
  const targetLang = (url.searchParams.get("to") ?? "").toLowerCase();

  if (!UUID_RE.test(conversationId)) return opaqueError(400, "invalid_conversation");
  if (!isLangCode(targetLang)) return opaqueError(400, "invalid_target_language");

  let scope;
  try {
    scope = await buildRequestScopedPersistence({
      authorizationHeader: req.headers.get("authorization"),
      tenantId,
    });
  } catch (err) {
    return mapCompositionError(err);
  }

  let page;
  try {
    page = await scope.persistence.listMessages(scope.tenantContext, {
      conversationId: asUUID(conversationId),
      limit: PAGE_SIZE,
      cursor: null,
    });
  } catch (err) {
    return mapPersistenceError(err);
  }

  const translated = await Promise.all(
    page.items.map(async (msg) => {
      const outcome = await translateText({
        text: msg.text,
        from: msg.language,
        to: targetLang,
      });
      return {
        messageId: msg.messageId,
        senderId: msg.senderId,
        originalText: msg.text,
        originalLanguage: msg.language,
        targetLanguage: targetLang,
        translation: outcome.ok ? outcome.translation : null,
        translationError: outcome.ok ? null : outcome.reason,
        translationPassthrough: outcome.ok ? outcome.passthrough : false,
        createdAt: msg.createdAt,
      };
    }),
  );

  return NextResponse.json(
    { items: translated, actorId: scope.actor.actorId },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
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
    return opaqueError(400, "invalid_json");
  }

  const tenantIdRaw = typeof body.tenantId === "string" ? body.tenantId : "";
  const conversationIdRaw = typeof body.conversationId === "string" ? body.conversationId : "";
  const text = typeof body.text === "string" ? body.text : "";
  const languageRaw = typeof body.language === "string" ? body.language.toLowerCase() : "";
  const clientMessageIdRaw = typeof body.clientMessageId === "string" ? body.clientMessageId : "";

  if (!UUID_RE.test(conversationIdRaw)) return opaqueError(400, "invalid_conversation");
  if (!isLangCode(languageRaw)) return opaqueError(400, "invalid_language");
  if (text.trim().length === 0) return opaqueError(400, "empty_text");
  if (text.length > MAX_TEXT_LENGTH) return opaqueError(400, "text_too_long");
  if (!UUID_RE.test(clientMessageIdRaw)) return opaqueError(400, "invalid_client_id");

  let scope;
  try {
    scope = await buildRequestScopedPersistence({
      authorizationHeader: req.headers.get("authorization"),
      tenantId: tenantIdRaw,
    });
  } catch (err) {
    return mapCompositionError(err);
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
    return mapPersistenceError(err);
  }

  return NextResponse.json(
    {
      messageId: clientMessageIdRaw,
      senderId: scope.actor.actorId,
      createdAt,
    },
    { status: 201 },
  );
}
