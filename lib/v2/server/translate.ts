/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Server-only translation boundary.
 *
 * Thin wrapper around the productive translation provider (OpenAI). The
 * API key is never leaked into the returned value nor into thrown errors.
 * Rate-limit and retry policy are the caller's responsibility for now
 * (Fase 9 §3 defers Realtime/outbox). Fakes are permitted in tests only,
 * via `overrideProviderForTests`.
 */

import "server-only";

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish",
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  zh: "Chinese",
  ar: "Arabic",
  ru: "Russian",
};

const MAX_TEXT_LENGTH = 1000;

export type TranslationInput = {
  readonly text: string;
  readonly from: string;
  readonly to: string;
};

export type TranslationOutcome =
  | { readonly ok: true; readonly translation: string; readonly passthrough: boolean }
  | { readonly ok: false; readonly reason: "empty" | "too_long" | "provider_unavailable" | "provider_error" };

export type TranslationProvider = (input: TranslationInput) => Promise<string>;

let providerOverride: TranslationProvider | null = null;

/**
 * Only for tests. Passing `null` restores the productive provider.
 */
export function overrideProviderForTests(provider: TranslationProvider | null): void {
  providerOverride = provider;
}

async function openAIProvider(input: TranslationInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new Error("openai_key_missing");
  }
  const sourceLang = LANGUAGE_NAMES[input.from] ?? input.from;
  const targetLang = LANGUAGE_NAMES[input.to] ?? input.to;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
        { role: "user", content: input.text },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error("provider_status_" + res.status);
  }
  const data = (await res.json()) as {
    choices?: ReadonlyArray<{ message?: { content?: string } }>;
  };
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("provider_empty_response");
  }
  return raw.trim();
}

/**
 * Translate a single text. Returns a structured outcome; never throws
 * with provider-specific messages.
 */
export async function translateText(input: TranslationInput): Promise<TranslationOutcome> {
  if (typeof input.text !== "string" || input.text.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (input.from === input.to) {
    return { ok: true, translation: input.text, passthrough: true };
  }
  if (input.text.trim().length > MAX_TEXT_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  const provider = providerOverride ?? openAIProvider;
  try {
    const translation = await provider(input);
    return { ok: true, translation, passthrough: false };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "";
    const transport =
      rawMessage.includes("fetch failed")
      || rawMessage.includes("ENOTFOUND")
      || rawMessage.includes("ECONNRESET")
      || rawMessage.includes("ETIMEDOUT")
      || rawMessage.includes("timeout")
      || rawMessage.includes("openai_key_missing");
    return {
      ok: false,
      reason: transport ? "provider_unavailable" : "provider_error",
    };
  }
}
