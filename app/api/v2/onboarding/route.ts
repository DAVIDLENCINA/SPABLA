/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · POST /api/v2/onboarding.
 *
 * Endpoint autoritativo del onboarding productivo del personal
 * workspace. Contrato gobernante:
 *   docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md
 *   (Q1-RR-SCOPE), §10 (HTTP), §14 (matriz de 58 casos), §17-bis
 *   (localización server-controlled), §17-ter (lifecycle).
 *
 * Contrato observable:
 *
 *   POST /api/v2/onboarding
 *     Headers: Authorization: Bearer <access_token>
 *              [Accept-Language: <hint>]   (opcional, pista no confiable)
 *     Body:    {}   (cualquier body inesperado se ignora sin efecto)
 *
 *   200 OK
 *     { tenantId: string, role: "owner", label: string }
 *     · label = catálogo cerrado server-owned normalizado a uno de los
 *       13 códigos activados (contract §17-bis 6). NUNCA persiste;
 *       `tenants.name` siempre almacena la clave interna fija
 *       `workspace.personal.default`.
 *     · `created` booleano queda en observabilidad server-side, no en
 *       la respuesta (contract §10).
 *
 *   401 unauthorized — Authorization ausente/malformado/JWT inválido.
 *   404 not_found    — Verbos distintos de POST (contract §14 rows 26-30).
 *   500 internal     — Orphan mapping detectado (§14 rows 10, 48) o
 *                      error interno no clasificable.
 *   503 unavailable  — Fallo transitorio de DB, `deletion_pending`
 *                      (§14 row 53), `legal_hold` (§14 row 56).
 *
 * Cada respuesta lleva `X-SPABLA-Correlation-Id: <UUID v4>`. Los
 * errores 4xx/5xx llevan body `{error, correlationId}`. Los 200 no
 * inyectan `correlationId` en el body (patrón hito 9.2.5-D).
 */

import type { NextRequest } from "next/server";

import {
  extractBearerToken,
  Fase9RequestError,
  verifyJwt,
  type VerifiedActor,
} from "@/lib/v2/server/composition";
import {
  logSanitizedError,
  newCorrelationId,
  opaqueError,
  successJson,
  type ErrorPhase,
  type PublicErrorCode,
} from "@/lib/v2/server/http-error";
import {
  OnboardingAuthActorDeletedError,
  OnboardingInternalError,
  OnboardingOrphanMappingError,
  OnboardingTransientError,
} from "@/lib/v2/server/onboarding";
import {
  buildPrivilegedSupabaseClient,
  SupabaseActorLifecycleReader,
  SupabasePersonalWorkspaceProvider,
} from "@/lib/v2/server/onboarding.supabase";
import {
  buildLabelPresenter,
  DEFAULT_LOCALE,
  normaliseLocaleHint,
} from "@/lib/v2/server/onboarding-labels";
import { runOnboarding } from "@/lib/v2/server/onboarding-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "/api/v2/onboarding";

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

export async function POST(req: NextRequest): Promise<Response> {
  const correlationId = newCorrelationId();

  // (1) Autenticación — extracción de Bearer + verificación de JWT.
  const authorizationHeader = req.headers.get("authorization");
  let token: string;
  try {
    token = extractBearerToken(authorizationHeader);
  } catch (err: unknown) {
    if (err instanceof Fase9RequestError && err.detail.kind === "unauthorized") {
      return failure(
        401,
        "unauthorized",
        "authentication",
        err.detail.reason.replace(/\s+/g, "_"),
        correlationId,
        "POST",
      );
    }
    return failure(401, "unauthorized", "authentication", "missing_authorization", correlationId, "POST");
  }

  let actor: VerifiedActor;
  try {
    actor = await verifyJwt(token);
  } catch (err: unknown) {
    if (err instanceof Fase9RequestError && err.detail.kind === "unauthorized") {
      return failure(
        401,
        "unauthorized",
        "authentication",
        err.detail.reason.replace(/\s+/g, "_"),
        correlationId,
        "POST",
      );
    }
    return failure(401, "unauthorized", "authentication", "jwt_verification_failed", correlationId, "POST");
  }
  const actorId = actor.actorId;

  // (2) Parseo tolerante del body. El contrato §10 exige que cualquier
  // body inesperado (objeto con campos, array, string, número, null,
  // vacío, JSON malformado) NO produzca `500` por parseo. Se ignora
  // sin efecto y sin error de campo. Los campos como `tenantId`,
  // `role`, `ownerId`, `actorId`, `name`, `label`, `locale` enviados
  // por el cliente NO tienen autoridad.
  let bodyFieldsIgnored = false;
  try {
    const raw = await req.text();
    if (raw.length > 0) {
      // Intentar parsear; cualquier error se degrada silenciosamente.
      try {
        const parsed = JSON.parse(raw) as unknown;
        // Si el body es un objeto con campos no vacíos, marcar
        // `body_fields_ignored` en observabilidad. El comportamiento
        // observable es idéntico al del body vacío.
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          Object.keys(parsed as Record<string, unknown>).length > 0
        ) {
          bodyFieldsIgnored = true;
        } else if (parsed !== null && parsed !== undefined) {
          // Array, string, número: también se ignoran.
          bodyFieldsIgnored = true;
        }
      } catch {
        // JSON malformado: se ignora sin efecto.
        bodyFieldsIgnored = true;
      }
    }
  } catch {
    // Fallo al leer body (por ejemplo stream abortado): se ignora
    // silenciosamente. NO propagar 500.
    bodyFieldsIgnored = true;
  }
  if (bodyFieldsIgnored) {
    logSanitizedError(correlationId, {
      endpoint: ENDPOINT,
      method: "POST",
      status: 200,
      code: "internal", // log-only, no HTTP status change
      phase: "structural",
      internalKind: "onboarding_body_fields_ignored",
    });
  }

  // (3) Normalización de la pista de idioma. `Accept-Language` es
  // exclusivamente para la presentación en la respuesta; NUNCA
  // alcanza la RPC (contract §17-bis 4-7).
  const acceptLanguage = req.headers.get("accept-language");
  const canonicalLocale = normaliseLocaleHint(acceptLanguage);
  if (acceptLanguage && canonicalLocale === DEFAULT_LOCALE) {
    // La pista existía pero no coincidía con el catálogo: log
    // sanitizado para observabilidad (contract §16
    // `onboarding.locale_hint_rejected_total`).
    logSanitizedError(correlationId, {
      endpoint: ENDPOINT,
      method: "POST",
      status: 200,
      code: "internal",
      phase: "structural",
      internalKind: "onboarding_locale_hint_rejected",
    });
  }

  // (4) Construcción de dependencias privilegiadas server-side.
  let deps: {
    lifecycle: SupabaseActorLifecycleReader;
    workspace: SupabasePersonalWorkspaceProvider;
    presenter: ReturnType<typeof buildLabelPresenter>;
  };
  try {
    const privileged = buildPrivilegedSupabaseClient();
    deps = {
      lifecycle: new SupabaseActorLifecycleReader({ privileged }),
      workspace: new SupabasePersonalWorkspaceProvider({ privileged }),
      presenter: buildLabelPresenter(),
    };
  } catch (err: unknown) {
    if (err instanceof OnboardingInternalError) {
      return failure(500, "internal", "internal", "onboarding_env_missing", correlationId, "POST");
    }
    return failure(500, "internal", "internal", "supabase_env_missing", correlationId, "POST");
  }

  // (5) Ejecución del servicio.
  let outcome: Awaited<ReturnType<typeof runOnboarding>>;
  try {
    outcome = await runOnboarding(deps, { actorId, canonicalLocale });
  } catch (err: unknown) {
    if (err instanceof OnboardingAuthActorDeletedError) {
      // Q2-R2 · el actor Auth fue eliminado tras la emisión del JWT
      // vigente. verifyJwt local aceptó firma+exp, pero la RPC
      // detectó que `auth.users` ya no contiene el sub. Respuesta:
      // 401 opaco, cero escritura, cero causa filtrada al cliente.
      return failure(401, "unauthorized", "authentication", "auth_actor_deleted", correlationId, "POST");
    }
    if (err instanceof OnboardingOrphanMappingError) {
      return failure(500, "internal", "integrity", "orphan_mapping_detected", correlationId, "POST");
    }
    if (err instanceof OnboardingTransientError) {
      return failure(503, "unavailable", "infrastructure", "onboarding_rpc_failed", correlationId, "POST");
    }
    if (err instanceof OnboardingInternalError) {
      return failure(500, "internal", "internal", "onboarding_rpc_failed", correlationId, "POST");
    }
    return failure(500, "internal", "internal", "unknown", correlationId, "POST");
  }

  // (6) Lifecycle blockers — respuesta opaca 503 sin filtrar la causa.
  if (outcome.kind === "lifecycle_blocked") {
    const internalKind = outcome.reason === "deletion_pending"
      ? "deletion_pending_blocked"
      : "legal_hold_blocked";
    return failure(503, "unavailable", "authorization", internalKind, correlationId, "POST");
  }

  // (7) Éxito. El body devuelve `tenantId`, `role` y `label`. NO
  // devuelve `created` (queda en observabilidad server-side).
  return successJson(
    200,
    {
      tenantId: outcome.tenantId,
      role: outcome.role,
      label: outcome.label,
    },
    correlationId,
  );
}

// Verbos no permitidos → 404 opaco (contract §10, §14 rows 26-30).
async function methodNotAllowed(method: string): Promise<Response> {
  const correlationId = newCorrelationId();
  return failure(404, "not_found", "structural", "method_not_allowed", correlationId, method);
}

export async function GET(): Promise<Response> {
  return methodNotAllowed("GET");
}
export async function PUT(): Promise<Response> {
  return methodNotAllowed("PUT");
}
export async function PATCH(): Promise<Response> {
  return methodNotAllowed("PATCH");
}
export async function DELETE(): Promise<Response> {
  return methodNotAllowed("DELETE");
}
export async function HEAD(): Promise<Response> {
  return methodNotAllowed("HEAD");
}
