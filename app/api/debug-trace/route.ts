import { NextRequest, NextResponse } from "next/server";

// SPABLA V1 · audit/v1-debug — trace dump endpoint.
// Accepts a POST body { header:true, sessionId, ..., traces:[...] } sent from
// spablaTrace.dumpSpablaTraceBuffer(). Logs each entry to console so it lands
// in Vercel Function Logs, greppable by [SPABLA_TRACE_DUMP] + sessionId.
// No auth. No DB. No dependency. No side effects beyond console.log.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DumpBody = {
  header?: boolean;
  reason?: string;
  sessionId?: string;
  timestamp?: string;
  roomId?: string | null;
  userId?: string | null;
  callId?: string | null;
  browser?: string;
  platform?: string;
  traceCount?: number;
  traces?: string[];
};

export async function POST(req: NextRequest) {
  let body: DumpBody;
  try {
    body = (await req.json()) as DumpBody;
  } catch {
    // eslint-disable-next-line no-console
    console.log("[SPABLA_TRACE_DUMP] parse_error");
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  const sessionId = body.sessionId ?? "unknown";
  const meta = {
    sessionId,
    reason: body.reason ?? "manual",
    timestamp: body.timestamp ?? new Date().toISOString(),
    roomId: body.roomId ?? null,
    userId: body.userId ?? null,
    callId: body.callId ?? null,
    browser: body.browser ?? "unknown",
    platform: body.platform ?? "unknown",
    traceCount: Array.isArray(body.traces) ? body.traces.length : 0,
    receivedAt: new Date().toISOString(),
  };

  // Header line — always emitted first so a single grep on sessionId returns
  // the metadata even if some traces get truncated by the log platform.
  // eslint-disable-next-line no-console
  console.log(`[SPABLA_TRACE_DUMP][HEADER] ${JSON.stringify(meta)}`);

  const traces = Array.isArray(body.traces) ? body.traces : [];
  for (let i = 0; i < traces.length; i++) {
    // Each trace is already a JSON string produced by the client tracer.
    // Prefix with sessionId + index to allow reassembly if logs interleave.
    // eslint-disable-next-line no-console
    console.log(`[SPABLA_TRACE_DUMP][${sessionId}][${i + 1}/${traces.length}] ${traces[i]}`);
  }

  return NextResponse.json({ ok: true, sessionId, received: traces.length });
}
