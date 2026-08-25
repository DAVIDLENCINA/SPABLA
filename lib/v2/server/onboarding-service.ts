/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · Servicio de onboarding productivo.
 *
 * Orquesta el flujo canónico del endpoint `POST /api/v2/onboarding`:
 *
 *   1. Verificar estado de ciclo de vida del actor
 *      (`deletion_pending`, `legal_hold`) — contract §17-ter I, §14
 *      rows 53 y 56. Si cualquiera está activa, el servicio NO invoca
 *      la RPC y devuelve un `LifecycleBlocked` que el handler mapea a
 *      `503 unavailable` opaco (contract §17-ter H).
 *
 *   2. Invocar `PersonalWorkspaceProvider.ensure(actorId)` — que a su
 *      vez llama a la RPC transaccional server-side. Cero texto libre
 *      pasado a la RPC (contract I-14).
 *
 *   3. Resolver la etiqueta de presentación mediante
 *      `PersonalWorkspaceLabelPresenter.labelFor(canonicalLocale)`.
 *      NUNCA se persiste; sólo se devuelve en la respuesta HTTP.
 *
 * Contract §7 (operación de dominio), §8.3 (frontera HTTP), §10
 * (respuesta pública), §14 (casos 5-9, 10, 48, 53, 56).
 */

import "server-only";

import type {
  ActorLifecycleReader,
  CanonicalLocale,
  PersonalWorkspaceLabelPresenter,
  PersonalWorkspaceProvider,
} from "./onboarding";

/**
 * Resultado observable del servicio. El handler lo traduce a JSON.
 */
export type OnboardingServiceOutcome =
  | {
      readonly kind: "success";
      readonly tenantId: string;
      readonly role: "owner";
      readonly created: boolean;
      readonly label: string;
      readonly canonicalLocale: CanonicalLocale;
    }
  | {
      readonly kind: "lifecycle_blocked";
      readonly reason: "deletion_pending" | "legal_hold";
    };

export type OnboardingServiceDeps = {
  readonly lifecycle: ActorLifecycleReader;
  readonly workspace: PersonalWorkspaceProvider;
  readonly presenter: PersonalWorkspaceLabelPresenter;
};

export type OnboardingServiceInput = {
  readonly actorId: string;
  readonly canonicalLocale: CanonicalLocale;
};

/**
 * Ejecuta el flujo canónico. Devuelve un outcome tipado; NO lanza
 * excepciones para errores esperados (lifecycle). Sí propaga las
 * excepciones de dominio del provider (`OnboardingOrphanMappingError`,
 * `OnboardingTransientError`, `OnboardingInternalError`) que el
 * handler mapea al alfabeto HTTP (contract §10).
 */
export async function runOnboarding(
  deps: OnboardingServiceDeps,
  input: OnboardingServiceInput,
): Promise<OnboardingServiceOutcome> {
  // (1) Lifecycle check — contract §14 rows 53 (deletion_pending) y 56
  // (legal_hold). Si cualquiera está activa, cortocircuito sin invocar
  // la RPC. Contrato §17-ter H mapea ambos a `503 unavailable` opaco.
  const lifecycle = await deps.lifecycle.read(input.actorId);
  if (lifecycle.deletionPending) {
    return { kind: "lifecycle_blocked", reason: "deletion_pending" };
  }
  if (lifecycle.legalHold) {
    return { kind: "lifecycle_blocked", reason: "legal_hold" };
  }

  // (2) RPC transaccional — un único parámetro uuid, ningún texto.
  const result = await deps.workspace.ensure(input.actorId);

  // (3) Etiqueta de presentación — el catálogo cerrado server-owned
  // resuelve el locale canónico ya normalizado por el handler.
  const label = deps.presenter.labelFor(input.canonicalLocale);

  return {
    kind: "success",
    tenantId: result.tenantId,
    role: "owner",
    created: result.created,
    label,
    canonicalLocale: input.canonicalLocale,
  };
}
