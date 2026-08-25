/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · Onboarding puertos y tipos.
 *
 * Puertos de dominio para la implementación del onboarding productivo
 * atómico. Cero mención de Supabase/Postgres/RLS/service_role: las
 * interfaces aquí definidas describen el contrato observable del
 * onboarding. El adaptador Supabase vive en `onboarding.supabase.ts` y
 * el presenter de etiquetas en `onboarding-labels.ts`.
 *
 * Contrato gobernante: docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md
 * (Q1-RR-SCOPE), §7 (operación de dominio), §8 (puerto y adaptador).
 */

import "server-only";

export type ActorId = string;

/**
 * Resultado del onboarding productivo.
 *
 * `tenantId` — identificador del personal workspace del actor.
 * `role`     — siempre `'owner'` para el personal workspace (contract §9).
 * `created`  — `true` si la operación creó el workspace ahora; `false` si
 *              la operación fue idempotente sobre un mapping existente.
 *              Observable en telemetría server-side; NO se filtra al
 *              cliente (contract §10, §16 metric `duplicates_prevented_total`).
 */
export type PersonalWorkspaceResult = {
  readonly tenantId: string;
  readonly role: "owner";
  readonly created: boolean;
};

/**
 * Puerto principal del dominio del onboarding. Recibe únicamente el
 * `actorId` derivado de la sesión Auth verificada. NO recibe locale,
 * pista de idioma, etiqueta ni texto libre (contract §7, I-14).
 */
export type PersonalWorkspaceProvider = {
  ensure(actorId: ActorId): Promise<PersonalWorkspaceResult>;
};

/**
 * Puerto de estado de ciclo de vida del actor. Q2 mínimo (contract
 * §17-ter I) requiere reconocer las banderas `deletion_pending` y
 * `legal_hold`; los workflows que las CREAN se difieren a Q4-bis.
 */
export type LifecycleState = {
  readonly deletionPending: boolean;
  readonly legalHold: boolean;
};

export type ActorLifecycleReader = {
  read(actorId: ActorId): Promise<LifecycleState>;
};

/**
 * Códigos canónicos del catálogo de idiomas activados por el hito 9.2
 * (Plan V1.1 §14). Cualquier código fuera de esta lista se trata como
 * pista no confiable y no alcanza la RPC (contract §17-bis 5-7).
 */
export type CanonicalLocale =
  | "es"
  | "ca"
  | "en"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "zh"
  | "ja"
  | "ko"
  | "ar"
  | "hi"
  | "ru";

/**
 * Puerto del presenter de etiquetas del personal workspace. Resuelve
 * un `CanonicalLocale` normalizado a una etiqueta de presentación
 * proveniente del catálogo cerrado server-owned. NO participa en
 * persistencia: el texto persistido lo fija la RPC.
 */
export type PersonalWorkspaceLabelPresenter = {
  labelFor(canonicalLocale: CanonicalLocale): string;
};

/**
 * Excepción de dominio: mapping huérfano detectado por la RPC
 * (contract §5 B/D, matrix rows 10 + 48). El adaptador lanza esta
 * excepción cuando recibe `SQLSTATE '23503'` desde
 * `admin_ensure_personal_workspace`; el handler HTTP la mapea a
 * `500 internal` opaco (contract §10, §17-ter H).
 */
export class OnboardingOrphanMappingError extends Error {
  constructor() {
    super("onboarding: orphan mapping detected");
    this.name = "OnboardingOrphanMappingError";
  }
}

/**
 * Excepción de dominio: fallo transitorio de la persistencia. El
 * handler HTTP la mapea a `503 unavailable` opaco.
 */
export class OnboardingTransientError extends Error {
  readonly cause?: unknown;
  constructor(cause?: unknown) {
    super("onboarding: transient dependency failure");
    this.name = "OnboardingTransientError";
    this.cause = cause;
  }
}

/**
 * Excepción de dominio: fallo estructural no clasificable. El handler
 * HTTP la mapea a `500 internal` opaco.
 */
export class OnboardingInternalError extends Error {
  readonly cause?: unknown;
  constructor(cause?: unknown) {
    super("onboarding: internal error");
    this.name = "OnboardingInternalError";
    this.cause = cause;
  }
}
