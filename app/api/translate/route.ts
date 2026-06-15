import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Module-level singleton: JWKS cache and rate-limit map persist across warm invocations.
// ES256 asymmetric keys → getClaims() verifies locally after the first JWKS fetch.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const rateLimitMap = new Map<string, number[]>();
function isRateLimited(userId: string): boolean {
  const now      = Date.now();
  const windowMs = 60_000;
  const maxReqs  = 20;
  const prev     = (rateLimitMap.get(userId) ?? []).filter(t => now - t < windowMs);
  if (prev.length >= maxReqs) return true;
  rateLimitMap.set(userId, [...prev, now]);
  return false;
}

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", en: "English", fr: "French",  de: "German",
  it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Chinese",
  ar: "Arabic",  ru: "Russian",
};

const MAX_TEXT_LENGTH = 1000;

export async function POST(req: NextRequest) {
  console.log("[TRANSLATE] request received");
  // ── 1. Auth — getClaims() verifies ES256 signature locally (no network after JWKS cache) ──
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!token) {
    console.error("[TRANSLATE] no token in request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let claimsData: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"];
  try {
    const result = await supabase.auth.getClaims(token);
    if (result.error || !result.data?.claims?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    claimsData = result.data;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  // ── 2. Rate limit — 20 requests / min per authenticated user ──
  if (isRateLimited(userId)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // ── 3. Parse body ──
  let text: string, from: string, to: string;
  try {
    ({ text, from, to } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[TRANSLATE] from/to/text:", from, "→", to, "|", text);
  if (!text?.trim() || from === to) {
    return NextResponse.json({ translation: text ?? "" });
  }

  // ── 4. Length limit ──
  if (text.trim().length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ translation: text });
  }

  // ── 5. Translate ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[TRANSLATE] OPENAI_API_KEY no configurada");
    return NextResponse.json({ translation: text });
  }

  const t0         = Date.now();
  const sourceLang = LANG_NAMES[from] ?? from;
  const targetLang = LANG_NAMES[to]   ?? to;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the user's message from ${sourceLang} to ${targetLang}. Return only the translated text, nothing else.`,
          },
          { role: "user", content: text },
        ],
      }),
    });

    const duration = Date.now() - t0;

    if (!res.ok) {
      console.error("[TRANSLATE] OpenAI error:", res.status, await res.text());
      return NextResponse.json({ translation: text }, { headers: { "x-translate-ms": String(duration) } });
    }

    const data        = await res.json();
    const translation = data?.choices?.[0]?.message?.content?.trim() ?? text;
    console.log("[TRANSLATE] OpenAI response status:", res.status);
    console.log("[TRANSLATE] final translation:", translation);

    return NextResponse.json({ translation }, { headers: { "x-translate-ms": String(duration) } });

  } catch (err) {
    const duration = Date.now() - t0;
    console.error("[TRANSLATE] Error inesperado:", err);
    return NextResponse.json({ translation: text }, { headers: { "x-translate-ms": String(duration) } });
  }
}
