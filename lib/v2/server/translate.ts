/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Server-only translation boundary.
 *
 * Thin wrapper around the productive translation provider (OpenAI). The
 * API key is never leaked into the returned value nor into thrown errors.
 * Rate-limit and retry policy are the caller's responsibility for now
 * (Fase 9 §3 defers Realtime/outbox). Fakes are permitted in tests only,
 * via `overrideProviderForTests`.
 *
 * LANG13-04 (Plan V1.1 §16, §17): the language-name map covers the 13
 * activated codes with the canonical names required by the provider,
 * and the system prompt is hardened for multilingual quality
 * (preservation of URLs/mentions/emojis/numbers/proper-names/line-breaks,
 * anti-transliteration, output-only). The corresponding bump of
 * `CURRENT_TRANSLATION_VERSION` to `"v2"` lives in the same commit
 * inside `lib/v2/server/translation-runtime.ts` (Plan V1.1 §18, §31 R8).
 */

import "server-only";

// LANG13-04 · Plan V1.1 §16. Names sent to the provider MUST be these
// canonical English strings, with the specific refinements for `ar`
// ("Modern Standard Arabic") and `zh` ("Simplified Chinese") that
// prevent regional-dialect drift or traditional/simplified ambiguity.
// LangCode values outside this map keep the fallback of §16.2 (raw
// ISO 639-1 code as the name).
const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Modern Standard Arabic",
  ca: "Catalan",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Simplified Chinese",
};

// LANG13-04 · Plan V1.1 §17. Hardened multilingual prompt. Bump of
// `CURRENT_TRANSLATION_VERSION` to `"v2"` accompanies this constant
// in the same atomic commit (§18, §31 R8). Do not diverge the two —
// changing this prompt without a fresh `translationVersion` would
// corrupt the coherence of `spabla_v2.message_translations`.
const SYSTEM_PROMPT_TEMPLATE: string =
  "You are a professional translator. Translate the user's message from {sourceLanguage} to {targetLanguage}.\n\n"
  + "Preserve URLs, @mentions, emojis, numbers, proper names, line breaks and paragraph structure. "
  + "Do not transliterate: use the natural writing system of the target language.\n\n"
  + "Return only the translated text, with no preamble, explanation or quotation marks.";

export function buildSystemPrompt(sourceLanguage: string, targetLanguage: string): string {
  return SYSTEM_PROMPT_TEMPLATE
    .replace("{sourceLanguage}", sourceLanguage)
    .replace("{targetLanguage}", targetLanguage);
}

export function getLanguageNameForProvider(code: string): string {
  // Plan V1.1 §16.2: unknown codes fall through to the raw ISO 639-1
  // string. Plan V1.1 §16.5: never emit the ISO code without going
  // through this map — enforced by the fact that this function IS the
  // map lookup and both `sourceLang` / `targetLang` inside
  // `openAIProvider` route through it.
  return LANGUAGE_NAMES[code] ?? code;
}

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
  const sourceLang = getLanguageNameForProvider(input.from);
  const targetLang = getLanguageNameForProvider(input.to);
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
          content: buildSystemPrompt(sourceLang, targetLang),
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
