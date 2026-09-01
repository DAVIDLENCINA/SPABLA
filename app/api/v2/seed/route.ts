/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Dev-only seed endpoint.
 * SPABLA V2 · Hito 9.2.5-C · Safe HTTP method semantics + diagnostics.
 *
 * V2 · development-only endpoint. Not a public API.
 *
 * Double-gated: requires BOTH `NODE_ENV=development` AND
 * `SPABLA_V2_ENABLE_DEV_SEED=1`. When the gate is off (either condition
 * missing) both GET and POST return 404 so nothing leaks about the
 * endpoint's existence. The `NODE_ENV` clamp is the safety belt against
 * a productive deploy accidentally shipping the flag: in
 * `next build`/`next start` NODE_ENV is `production`.
 *
 * HTTP semantics (Hito 9.2.5-C decision):
 *   - GET, HEAD    → 405 Method Not Allowed (with `Allow: POST`) when
 *                    the gate is active. Never invokes the seed.
 *   - POST         → bootstraps two auth users, one tenant, two active
 *                    memberships and one shared conversation, and
 *                    returns identifiers plus documented, local-only
 *                    fixture credentials.
 *   - Everything   → 404 when the gate is off.
 *
 * Failure diagnostics:
 *   - Public body remains exactly `{"error":"seed_failed"}` on POST
 *     failure (contract preserved).
 *   - A per-invocation correlation id (RFC 4122 UUID) is generated
 *     server-side, echoed to the response as the `X-SPABLA-Correlation-Id`
 *     header (also on success), and logged alongside the sanitized
 *     failure code. See `lib/v2/server/log-sanitize.ts` for the
 *     whitelist governing what can appear in the log line.
 */

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { runFase9Seed } from "@/lib/v2/server/seed";
import { sanitizeError } from "@/lib/v2/server/log-sanitize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORRELATION_HEADER = "X-SPABLA-Correlation-Id";

function seedEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development"
    && process.env.SPABLA_V2_ENABLE_DEV_SEED === "1"
  );
}

function notFound(): Response {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

function methodNotAllowed(): Response {
  return new NextResponse(null, {
    status: 405,
    headers: {
      Allow: "POST",
      "Content-Length": "0",
    },
  });
}

/**
 * Read-only probe. NEVER invokes `runFase9Seed`. Returns 404 when the
 * gate is off and 405 (with `Allow: POST`) when the gate is active.
 */
export async function GET(): Promise<Response> {
  if (!seedEnabled()) {
    return notFound();
  }
  return methodNotAllowed();
}

/**
 * Explicit HEAD export. Prevents Next from auto-deriving HEAD from a
 * mutating handler in future refactors and guarantees the response is
 * body-less. Behaviour mirrors GET verbatim.
 */
export async function HEAD(): Promise<Response> {
  if (!seedEnabled()) {
    // 404 body is intentionally empty on HEAD; the status code carries
    // the full signal and no leak occurs about the endpoint.
    return new NextResponse(null, { status: 404 });
  }
  return methodNotAllowed();
}

/**
 * Mutating handler. Only invoked here. Success responses carry the
 * correlation header so a developer can correlate a client-visible
 * `X-SPABLA-Correlation-Id` with the sanitized server log line even on
 * happy paths.
 */
export async function POST(): Promise<Response> {
  if (!seedEnabled()) {
    return notFound();
  }
  const correlationId = randomUUID();
  try {
    const result = await runFase9Seed();
    return NextResponse.json(result, {
      status: 200,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  } catch (err: unknown) {
    const sanitized = sanitizeError(err);
    // Single structured log line. Every field is safe by construction:
    // `event` and `endpoint` are constants; `correlationId` is server
    // generated; `name`/`code`/`phase` come from a whitelist. Nothing
    // else from `err` is logged.
    console.error(
      JSON.stringify({
        event: "seed_failed",
        endpoint: "/api/v2/seed",
        correlationId,
        name: sanitized.name,
        code: sanitized.code,
        phase: sanitized.phase,
      }),
    );
    return NextResponse.json(
      { error: "seed_failed" },
      {
        status: 500,
        headers: { [CORRELATION_HEADER]: correlationId },
      },
    );
  }
}
