// SPABLA V1 legacy · TTS endpoint used by the V1 chat/call pipeline
// only. Supported temporarily; retirement is out of scope for this
// hito. Prohibited: introducing any new dependency from V2
// (`app/v2/`, `lib/v2/`, `engine/`) toward this file.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const rateLimitMap = new Map<string, number[]>();
function isRateLimited(userId: string): boolean {
  const now      = Date.now();
  const windowMs = 60_000;
  const maxReqs  = 60; // voice calls can generate many subtitles per minute
  const prev     = (rateLimitMap.get(userId) ?? []).filter(t => now - t < windowMs);
  if (prev.length >= maxReqs) return true;
  rateLimitMap.set(userId, [...prev, now]);
  return false;
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId: string;
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = data.claims.sub as string;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRateLimited(userId)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // ── Body ─────────────────────────────────────────────────────────────────────
  let text: string, lang: string;
  try {
    ({ text, lang } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!text?.trim()) return NextResponse.json({ error: "Empty text" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[TTS] OPENAI_API_KEY not set");
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  // ── OpenAI TTS ───────────────────────────────────────────────────────────────
  console.log(`[TTS] request lang=${lang} text="${text.substring(0, 40)}"`);
  const t0 = Date.now();

  const oaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "nova",
      input: text.trim(),
      response_format: "mp3",
    }),
  });

  if (!oaiRes.ok) {
    const err = await oaiRes.text();
    console.error("[TTS] OpenAI error:", oaiRes.status, err);
    return NextResponse.json({ error: "TTS failed" }, { status: 502 });
  }

  console.log(`[TTS] OpenAI responded in ${Date.now() - t0}ms`);

  // Stream the mp3 directly to the client
  return new NextResponse(oaiRes.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
