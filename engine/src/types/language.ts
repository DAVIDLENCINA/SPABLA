/**
 * SPABLA Engine — LanguagePair contract.
 *
 * A LanguagePair is a directional pair (from, to) with from !== to.
 * Constructor rejects invalid inputs — this is the primitive that kills the
 * V1 defect (target lang staying null / equal to source).
 *
 * Consumers only receive LanguagePair via events. They never construct one.
 */

/**
 * ISO 639-1 language code supported by SPABLA V2.
 *
 * First official catalog defined by ADR-005-LANGUAGE-CATALOG §5. The
 * catalog is evolutive by design (ADR-005 §3, §4) and can be extended
 * additively via subsequent ADRs. Regional variants may be introduced
 * as BCP 47 identifiers through a specific ADR per ADR-005 §1.1,
 * preserving the contract defined by ADR-004.
 */
export type LangCode =
  | "af" | "am" | "ar" | "bg" | "bn" | "ca" | "cs" | "da" | "de" | "el"
  | "en" | "es" | "et" | "eu" | "fa" | "fi" | "fr" | "ga" | "gl" | "gu"
  | "he" | "hi" | "hr" | "hu" | "id" | "is" | "it" | "ja" | "km" | "ko"
  | "lt" | "lv" | "mr" | "ms" | "mt" | "ne" | "nl" | "no" | "pl" | "pt"
  | "ro" | "ru" | "sk" | "sl" | "sv" | "sw" | "ta" | "te" | "th" | "tl"
  | "tr" | "uk" | "ur" | "vi" | "zh";

const SUPPORTED_LANG_CODES: ReadonlySet<LangCode> = new Set<LangCode>([
  "af", "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el",
  "en", "es", "et", "eu", "fa", "fi", "fr", "ga", "gl", "gu",
  "he", "hi", "hr", "hu", "id", "is", "it", "ja", "km", "ko",
  "lt", "lv", "mr", "ms", "mt", "ne", "nl", "no", "pl", "pt",
  "ro", "ru", "sk", "sl", "sv", "sw", "ta", "te", "th", "tl",
  "tr", "uk", "ur", "vi", "zh",
]);

/** Runtime check that a raw string is a supported LangCode. */
export function isLangCode(value: unknown): value is LangCode {
  return typeof value === "string" && SUPPORTED_LANG_CODES.has(value as LangCode);
}

/**
 * Directional language pair. Immutable. Constructor validates from !== to.
 * The `__brand` phantom prevents external code from constructing a raw
 * `{ from, to }` object literal that would sidestep validation.
 */
declare const langPairBrand: unique symbol;

export type LanguagePair = Readonly<{
  from: LangCode;
  to: LangCode;
  readonly [langPairBrand]: "LanguagePair";
}>;

export class LanguagePairInvalidError extends Error {
  public readonly from: string;
  public readonly to: string;

  constructor(from: string, to: string, reason: string) {
    super(`LanguagePair(${from} → ${to}): ${reason}`);
    this.name = "LanguagePairInvalidError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Only entry point to construct a LanguagePair. Rejects:
 *  - unsupported codes,
 *  - from === to.
 */
export function makeLanguagePair(from: LangCode, to: LangCode): LanguagePair {
  if (!isLangCode(from)) {
    throw new LanguagePairInvalidError(String(from), String(to), "unsupported 'from' code");
  }
  if (!isLangCode(to)) {
    throw new LanguagePairInvalidError(String(from), String(to), "unsupported 'to' code");
  }
  if (from === to) {
    throw new LanguagePairInvalidError(from, to, "from must differ from to");
  }
  return Object.freeze({ from, to } as unknown as LanguagePair);
}

/** Structural equality (two pairs point in the same direction). */
export function languagePairEquals(a: LanguagePair, b: LanguagePair): boolean {
  return a.from === b.from && a.to === b.to;
}

/** The reverse-direction pair used by the other participant. */
export function invertLanguagePair(pair: LanguagePair): LanguagePair {
  return makeLanguagePair(pair.to, pair.from);
}
