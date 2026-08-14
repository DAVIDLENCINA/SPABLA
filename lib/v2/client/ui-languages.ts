/**
 * SPABLA V2 · Hito 9.2.3 · UI language catalog (client-shared).
 *
 * Canonical source of the 13 UI-activated languages (LANG13-02 · Plan
 * V1.1 §8, §14). Extracted from `app/v2/chat/page.tsx` so that both
 * the chat page and the local-preference store consume the same list
 * without engine coupling and without duplication.
 *
 * Order is normative: Plan V1.1 §14 fixes it. Do not sort.
 * Labels are shown in each language's own script (Plan V1.1 §8).
 */

export type UiLanguageCode =
  | "es" | "ca" | "en" | "fr" | "de" | "it" | "pt"
  | "zh" | "ja" | "ko" | "ar" | "hi" | "ru";

export type UiLanguageOption = {
  readonly code: UiLanguageCode;
  readonly label: string;
};

export const UI_LANGUAGE_OPTIONS: ReadonlyArray<UiLanguageOption> = [
  { code: "es", label: "Español" },
  { code: "ca", label: "Català" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文（简体）" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
];

const UI_LANGUAGE_CODES: ReadonlySet<UiLanguageCode> = new Set(
  UI_LANGUAGE_OPTIONS.map((o) => o.code),
);

export function isUiLanguageCode(value: unknown): value is UiLanguageCode {
  return typeof value === "string" && UI_LANGUAGE_CODES.has(value as UiLanguageCode);
}
