/**
 * SPABLA V2 — Fase 9 · Hito 9.1.1 · Process-scoped translation runtime.
 *
 * Owns:
 *   - the process-wide single-flight map for translation calls (module
 *     singleton — coalesces concurrent requests within THIS Next.js
 *     process only; provides no cross-instance guarantee);
 *   - the OpenAI-backed provider function that adapts the legacy
 *     `translateText` shape to `TranslationProvider`;
 *   - the current `translationVersion` marker.
 *
 * Nothing here leaks to the client bundle: the file is `server-only`
 * and only route handlers import it.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

import { createSingleFlight, type SingleFlightMap } from "@engine/adapters/translation-store/single-flight";
import { SupabaseTranslationStore } from "@engine/adapters/translation-store/supabase/supabase-translation-store";
import type { TranslationStore } from "@engine/adapters/translation-store/port";
import type { TranslationProvider } from "@engine/adapters/translation-store/resolve-translated-messages";

import { translateText } from "./translate";

// Bumped when the pipeline (model, prompt, post-processing) changes so
// old rows in `spabla_v2.message_translations` become inactive without
// being dropped. A future hito may expose this via env.
export const CURRENT_TRANSLATION_VERSION = "v1" as const;

const singleFlightSingleton: SingleFlightMap = createSingleFlight();

export function getProcessSingleFlight(): SingleFlightMap {
  return singleFlightSingleton;
}

export const openAIProviderForTranslationStore: TranslationProvider = async ({ text, from, to }) => {
  const outcome = await translateText({ text, from, to });
  if (outcome.ok) {
    if (outcome.passthrough) {
      // Guard: passthrough should be handled upstream (same-language
      // skip). If it ever reaches the provider, avoid persisting a
      // trivial translation as if it were a real one.
      return { ok: true as const, translatedText: outcome.translation, provider: "openai-passthrough" };
    }
    return {
      ok: true as const,
      translatedText: outcome.translation,
      provider: "openai",
      model: "gpt-4o-mini",
    };
  }
  return { ok: false as const, reason: outcome.reason };
};

export function buildTranslationStore(input: {
  readonly authenticated: SupabaseClient;
}): TranslationStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("translation_runtime_env_missing");
  }
  const privileged = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseTranslationStore({
    authenticated: input.authenticated,
    privileged,
  });
}
