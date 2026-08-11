/**
 * SPABLA Engine — TranslationStore typed errors (Fase 9 · Hito 9.1.1).
 *
 * Provider-agnostic error contract for the internal `TranslationStore`
 * port. Kept SEPARATE from `PersistencePort` errors on purpose: the two
 * subdomains evolve independently and neither may re-export the other.
 *
 * @internal Not part of the public engine surface.
 */

export type TranslationStoreErrorCode =
  | "identity_invalid"
  | "tenant_context_invalid"
  | "not_found"
  | "conflict"
  | "constraint_violation"
  | "unauthorized"
  | "unavailable";

export type TranslationStoreError = {
  readonly code: TranslationStoreErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};

function retryabilityFor(code: TranslationStoreErrorCode): boolean {
  return code === "unavailable";
}

export function translationStoreError(
  code: TranslationStoreErrorCode,
  message: string,
): TranslationStoreError {
  return Object.freeze({ code, message, retryable: retryabilityFor(code) });
}

export function translationStoreErrorWithRetry(
  code: TranslationStoreErrorCode,
  message: string,
  retryable: boolean,
): TranslationStoreError {
  return Object.freeze({ code, message, retryable });
}

export function isTranslationStoreError(v: unknown): v is TranslationStoreError {
  if (typeof v !== "object" || v === null) return false;
  const rec = v as { code?: unknown; message?: unknown; retryable?: unknown };
  if (typeof rec.code !== "string") return false;
  if (typeof rec.message !== "string") return false;
  if (typeof rec.retryable !== "boolean") return false;
  const known: ReadonlyArray<TranslationStoreErrorCode> = [
    "identity_invalid",
    "tenant_context_invalid",
    "not_found",
    "conflict",
    "constraint_violation",
    "unauthorized",
    "unavailable",
  ];
  return (known as ReadonlyArray<string>).includes(rec.code);
}
