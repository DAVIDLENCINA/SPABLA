/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2 · Adaptador Supabase del onboarding.
 *
 * Adaptador server-side que implementa `PersonalWorkspaceProvider` +
 * `ActorLifecycleReader` contra el cliente Supabase `service_role`.
 * Encapsula la única invocación autorizada de la RPC
 * `spabla_v2.admin_ensure_personal_workspace(uuid)` y la lectura del
 * estado de ciclo de vida del actor.
 *
 * Contrato gobernante: docs/phases/SPABLA_V2_FASE_9_HITO_9_3_2_A_ONBOARDING_CONTRACT.md
 * (Q1-RR-SCOPE), §8.2 (adaptador), §9 (RPC), §17-ter (lifecycle).
 *
 * Cero exposición de `service_role` al cliente. El fichero es
 * `server-only` y el cliente privilegiado se instancia bajo demanda
 * desde variables de entorno (`SUPABASE_SERVICE_ROLE_KEY` +
 * `NEXT_PUBLIC_SUPABASE_URL`), replicando el patrón de
 * `translation-runtime.ts`.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  ActorId,
  ActorLifecycleReader,
  LifecycleState,
  PersonalWorkspaceProvider,
  PersonalWorkspaceResult,
} from "./onboarding";
import {
  OnboardingAuthActorDeletedError,
  OnboardingInternalError,
  OnboardingOrphanMappingError,
  OnboardingTransientError,
} from "./onboarding";

const SCHEMA = "spabla_v2";
const RPC_NAME = "admin_ensure_personal_workspace";

/**
 * Instancia un cliente Supabase privilegiado bajo demanda. Reutiliza
 * el patrón de `lib/v2/server/translation-runtime.ts`: env vars
 * requeridas y cliente aislado (sin persistencia de sesión, sin
 * auto-refresh). Cero exposición al cliente.
 */
export function buildPrivilegedSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new OnboardingInternalError(new Error("onboarding_env_missing"));
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Deps del adaptador. En productivo se instancian a través de
 * `buildPrivilegedSupabaseClient()`; en tests se puede inyectar un
 * cliente mock para aislar el comportamiento.
 */
export type OnboardingSupabaseDeps = {
  readonly privileged: SupabaseClient;
};

/**
 * Adaptador productivo: implementa el puerto
 * `PersonalWorkspaceProvider` contra la RPC transaccional.
 */
export class SupabasePersonalWorkspaceProvider implements PersonalWorkspaceProvider {
  private readonly privileged: SupabaseClient;

  constructor(deps: OnboardingSupabaseDeps) {
    this.privileged = deps.privileged;
  }

  async ensure(actorId: ActorId): Promise<PersonalWorkspaceResult> {
    // Firma final: un único parámetro `p_actor_id uuid`. Ningún caller
    // puede pasar texto adicional (contract I-14, S21).
    const { data, error } = await this.privileged
      .schema(SCHEMA)
      .rpc(RPC_NAME, { p_actor_id: actorId });

    if (error) {
      // Mapeo estricto de SQLSTATE al alfabeto de excepciones de
      // dominio. NUNCA se filtran mensajes, códigos ni identidades.
      const code = extractSqlState(error);
      if (code === "P0002") {
        // Q2-R2 · el actor ya no existe en `auth.users`. La RPC
        // rechazó la operación antes de cualquier escritura.
        // Handler → 401 unauthorized opaco.
        throw new OnboardingAuthActorDeletedError();
      }
      if (code === "23503") {
        // Orphan mapping detectado por §9 paso 4.a.
        throw new OnboardingOrphanMappingError();
      }
      if (isTransient(code)) {
        throw new OnboardingTransientError(new Error("db_transient"));
      }
      throw new OnboardingInternalError(new Error("rpc_failed"));
    }

    const row = extractFirstRow(data);
    if (row === null) {
      throw new OnboardingInternalError(new Error("rpc_empty_result"));
    }

    return {
      tenantId: row.tenant_id,
      role: "owner",
      created: row.created,
    };
  }
}

/**
 * Adaptador productivo: implementa el puerto `ActorLifecycleReader`.
 * Consulta la tabla `spabla_v2.actor_lifecycle_state` con banderas
 * mínimas `deletion_pending` y `legal_hold` (contract §17-ter I).
 * Si el actor no tiene fila, devuelve el estado neutro (ambas false):
 * el estado por defecto de un actor sin registro previo no bloquea.
 */
export class SupabaseActorLifecycleReader implements ActorLifecycleReader {
  private readonly privileged: SupabaseClient;

  constructor(deps: OnboardingSupabaseDeps) {
    this.privileged = deps.privileged;
  }

  async read(actorId: ActorId): Promise<LifecycleState> {
    const { data, error } = await this.privileged
      .schema(SCHEMA)
      .from("actor_lifecycle_state")
      .select("deletion_pending, legal_hold")
      .eq("actor_id", actorId)
      .maybeSingle();

    if (error) {
      throw new OnboardingTransientError(new Error("lifecycle_query_failed"));
    }

    if (data === null) {
      return { deletionPending: false, legalHold: false };
    }

    const row = data as { deletion_pending?: unknown; legal_hold?: unknown };
    const deletionPending = row.deletion_pending === true;
    const legalHold = row.legal_hold === true;
    return { deletionPending, legalHold };
  }
}

/**
 * Extrae `SQLSTATE` de un error de PostgREST/Supabase. El campo `code`
 * de `PostgrestError` refleja el `SQLSTATE` cuando la RPC lanza
 * `RAISE EXCEPTION USING ERRCODE = '...'`.
 */
function extractSqlState(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === "string" ? candidate : undefined;
}

/**
 * Whitelist mínima de códigos transitorios que el cliente puede
 * reintentar. Cualquier otro código no clasificado degrada a
 * `internal`.
 */
function isTransient(code: string | undefined): boolean {
  if (!code) return false;
  // 08* — connection exception
  // 40001 — serialization_failure
  // 40P01 — deadlock_detected
  // 53* — insufficient resources
  // 55P03 — lock_not_available (advisory lock contention)
  return (
    code.startsWith("08") ||
    code === "40001" ||
    code === "40P01" ||
    code.startsWith("53") ||
    code === "55P03"
  );
}

/**
 * `admin_ensure_personal_workspace` devuelve una fila `(tenant_id,
 * role, created)`. PostgREST puede envolver el resultado como array
 * de un elemento; esta helper lo normaliza.
 */
function extractFirstRow(
  data: unknown,
): { tenant_id: string; role: string; created: boolean } | null {
  const raw = Array.isArray(data) ? data[0] : data;
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const row = raw as { tenant_id?: unknown; role?: unknown; created?: unknown };
  if (typeof row.tenant_id !== "string") return null;
  if (typeof row.role !== "string") return null;
  if (typeof row.created !== "boolean") return null;
  return { tenant_id: row.tenant_id, role: row.role, created: row.created };
}
