/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · Personal workspace label presenter.
 *
 * Catálogo cerrado server-owned de los 13 idiomas activados en el hito
 * 9.2 (Plan V1.1 §14). Este catálogo se usa exclusivamente para
 * PRESENTAR el nombre del personal workspace en la respuesta HTTP y en
 * el bootstrap posterior. NO participa en persistencia: `tenants.name`
 * siempre almacena la clave interna fija `workspace.personal.default`
 * codificada en la RPC (contract §9, §17-bis 8-10, I-14).
 *
 * Contract §17-bis 6 — whitelist exacta verificada contra
 * `lib/v2/client/ui-languages.ts` y `docs/phases/SPABLA_V2_FASE_9_THIRTEEN_LANGUAGES_PLAN.md`
 * V1.1 §14 (aprobado 2026-08-11):
 *
 *   es, ca, en, fr, de, it, pt, zh, ja, ko, ar, hi, ru
 *
 * Prohibiciones normativas:
 *   · eu, gl, nl, sv, zh-Hans no son códigos activados.
 *   · variantes regionales (es-ES, ja-JP, pt-BR, zh-CN, zh-Hans) no
 *     son canónicas; se normalizan al código canónico o al locale por
 *     defecto (contract §17-bis 5-7).
 *   · el cliente nunca proporciona la etiqueta.
 */

import "server-only";

import type {
  CanonicalLocale,
  PersonalWorkspaceLabelPresenter,
} from "./onboarding";

/**
 * Códigos canónicos del catálogo activado (contract §17-bis 6).
 * `ReadonlyArray` con orden normativo Plan V1.1 §14.
 */
export const CANONICAL_LOCALES: ReadonlyArray<CanonicalLocale> = [
  "es",
  "ca",
  "en",
  "fr",
  "de",
  "it",
  "pt",
  "zh",
  "ja",
  "ko",
  "ar",
  "hi",
  "ru",
];

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_LOCALES);

/**
 * Locale seguro por defecto cuando la pista externa es desconocida,
 * manipulada o no soportada (contract §17-bis 7). Documentado
 * explícitamente para auditoría: el propio Q1-RR-SCOPE §17-bis 7
 * propone `en`.
 */
export const DEFAULT_LOCALE: CanonicalLocale = "en";

/**
 * Catálogo cerrado de etiquetas de presentación por locale canónico.
 * Cada etiqueta es un texto neutro que representa el «espacio
 * personal» del actor en el idioma correspondiente. NUNCA se persiste
 * (contract §17-bis 15).
 */
const CATALOG: Record<CanonicalLocale, string> = {
  es: "Mi espacio",
  ca: "El meu espai",
  en: "My space",
  fr: "Mon espace",
  de: "Mein Bereich",
  it: "Il mio spazio",
  pt: "Meu espaço",
  zh: "我的空间",
  ja: "マイスペース",
  ko: "내 공간",
  ar: "مساحتي",
  hi: "मेरा स्थान",
  ru: "Моё пространство",
};

/**
 * Verifica que un valor arbitrario es un `CanonicalLocale`. Case
 * sensitive: rechaza mayúsculas, padding, sufijos regionales y
 * variantes de script (contract §17-bis, Plan V1.1 §10).
 */
export function isCanonicalLocale(value: unknown): value is CanonicalLocale {
  return typeof value === "string" && CANONICAL_SET.has(value);
}

/**
 * Normaliza una pista externa (típicamente `Accept-Language`) contra
 * el catálogo activado.
 *
 * - Si la pista contiene múltiples idiomas separados por comas y/o
 *   cualidades (`;q=0.9`), evalúa el primer token limpiado.
 * - Extrae el prefijo antes del primer `-` (por ejemplo `es-ES` → `es`,
 *   `ja-JP` → `ja`, `zh-CN` → `zh`).
 * - Si el prefijo es exactamente `zh-Hans` u otra variante con guión
 *   más de una vez, se ignora tras el primer segmento igual.
 * - Si el resultado es uno de los 13 canónicos, se devuelve tal cual.
 * - En cualquier otro caso se devuelve `DEFAULT_LOCALE`.
 *
 * NO alcanza jamás la RPC. Solo controla la selección del texto de
 * presentación (contract §10, §17-bis 5-7).
 */
export function normaliseLocaleHint(hint: string | null | undefined): CanonicalLocale {
  if (typeof hint !== "string" || hint.length === 0) {
    return DEFAULT_LOCALE;
  }
  // Extraer el primer language-range: cortar por coma, quitar `;q=...`
  // y whitespace.
  const firstRange = hint.split(",", 1)[0] ?? "";
  const semi = firstRange.indexOf(";");
  const cleaned = (semi >= 0 ? firstRange.slice(0, semi) : firstRange).trim();
  if (cleaned.length === 0) {
    return DEFAULT_LOCALE;
  }
  // Rechazar cualquier caracter fuera del alfabeto seguro para códigos
  // BCP-47 (letras ASCII, guiones y dígitos). Cualquier otro carácter
  // (comillas, `;`, `--`, backticks, etc.) descarta la pista.
  if (!/^[A-Za-z0-9-]+$/.test(cleaned)) {
    return DEFAULT_LOCALE;
  }
  // Extraer prefijo hasta el primer guión.
  const dash = cleaned.indexOf("-");
  const primary = (dash >= 0 ? cleaned.slice(0, dash) : cleaned).toLowerCase();
  if (isCanonicalLocale(primary)) {
    return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * Implementación por defecto del presenter. Consulta el catálogo
 * cerrado server-owned y devuelve el texto correspondiente al locale
 * canónico. NUNCA construye el texto dinámicamente; NUNCA acepta un
 * locale fuera de la whitelist.
 */
export function buildLabelPresenter(): PersonalWorkspaceLabelPresenter {
  return {
    labelFor(canonicalLocale: CanonicalLocale): string {
      // Guardia defensiva: si por error un caller pasa un valor fuera
      // del catálogo (imposible por tipos, pero no por runtime),
      // degrada al locale por defecto en lugar de romper.
      const key = isCanonicalLocale(canonicalLocale)
        ? canonicalLocale
        : DEFAULT_LOCALE;
      return CATALOG[key];
    },
  };
}
