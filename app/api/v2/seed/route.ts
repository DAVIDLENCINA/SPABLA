/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Dev-only seed endpoint.
 *
 * Double-gated: requires BOTH `NODE_ENV=development` AND
 * `SPABLA_V2_ENABLE_DEV_SEED=1`. When the gate is off (either condition
 * missing) the route returns 404 so nothing leaks about its existence.
 * When on, it bootstraps two auth users, one tenant, two memberships and
 * one shared conversation, and returns identifiers plus the demo login
 * credentials (documented, local-only fixtures). The NODE_ENV clamp is
 * the safety belt against a productive deploy accidentally shipping the
 * flag: in `next build`/`next start` NODE_ENV is `production`.
 */

import { NextResponse } from "next/server";

import { runFase9Seed } from "@/lib/v2/server/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function seedEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development"
    && process.env.SPABLA_V2_ENABLE_DEV_SEED === "1"
  );
}

export async function GET() {
  if (!seedEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await runFase9Seed();
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "seed_failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
