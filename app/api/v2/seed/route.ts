/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Dev-only seed endpoint.
 *
 * Gated by the environment variable `SPABLA_V2_ENABLE_DEV_SEED=1`. When
 * the gate is off, the route returns 404 so nothing leaks about its
 * existence. When on, it bootstraps two auth users, one tenant, two
 * memberships and one shared conversation, and returns identifiers plus
 * the demo login credentials (documented, local-only fixtures).
 */

import { NextResponse } from "next/server";

import { runFase9Seed } from "@/lib/v2/server/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function seedEnabled(): boolean {
  return process.env.SPABLA_V2_ENABLE_DEV_SEED === "1";
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
