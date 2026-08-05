/**
 * SPABLA Engine — UsageEmitter (Fase 8 · Hito 8.4).
 *
 * Thin, provider-agnostic helper that publishes usage metrics to the
 * `PersistencePort`. Declared explicitly as a **validation emitter** for the
 * E2E harness in Fase 8 (Plan Fase 8 V1.3 §11.3). Productive emitters will
 * appear in Fase 9 when the SDK composition root is defined.
 *
 * Construction:
 *  - Zero global singleton, zero mutable module state, zero direct
 *    `process.env` reads, zero `@supabase/supabase-js` import, zero JWT
 *    knowledge. The persistence port is injected explicitly.
 *  - The emitter never selects a tenant on behalf of the caller. Every
 *    operation receives a `TenantContext`; `tenantId` comes from
 *    `ctx.tenantId`, `actorId` from `ctx.identity.actorId`.
 *  - Structural pre-emission checks reject inputs that would otherwise
 *    reach the DB carrying PII-shaped keys or invalid quantity signage.
 *    Every rejection surfaces as `PersistenceError` with one of the
 *    closed codes from Hito 8.1.
 *
 * Trust boundary:
 *  - The emitter never sees `service_role` or any credential material.
 *  - Actual write authority lives inside the injected `PersistencePort`
 *    (typically `SupabasePersistence` with a privileged Supabase client);
 *    the emitter just delegates.
 *
 * @internal Not part of the public engine surface. MUST NOT be re-exported
 * from `engine/src/index.ts` nor from `engine/src/adapters/index.ts`.
 */

import type {
  PersistencePort,
  UsageEntry,
  UsageEntryKind,
  UsageMetricKind,
} from "../port";
import type { TenantContext } from "../tenant-context";
import { persistenceError } from "../errors";
import type { ISOTimestamp, UUID } from "../../../types/ids";

const UUID_STRICT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UsageEmitterCapabilities = {
  readonly persistence: PersistencePort;
};

export type UsageEmitInput = {
  readonly metricKind: UsageMetricKind;
  readonly quantity: number;
  readonly unit: string;
  readonly occurredAt: ISOTimestamp;
  readonly source: string;
  readonly idempotencyKey: UUID;
  readonly entryKind: UsageEntryKind;
  readonly correlationId: UUID | null;
};

export type UsageEmitFromMessageInput = {
  readonly text: string;
  readonly idempotencyKey: UUID;
  readonly occurredAt: ISOTimestamp;
  readonly source: string;
  readonly correlationId: UUID | null;
};

export class UsageEmitter {
  private readonly persistence: PersistencePort;

  constructor(capabilities: UsageEmitterCapabilities) {
    if (capabilities === null || typeof capabilities !== "object") {
      throw persistenceError(
        "unauthorized",
        "UsageEmitter: capabilities object required",
      );
    }
    if (!capabilities.persistence) {
      throw persistenceError(
        "unauthorized",
        "UsageEmitter: persistence port required",
      );
    }
    this.persistence = capabilities.persistence;
  }

  /**
   * Emit an arbitrary usage entry through the injected persistence port.
   * All structural validation happens before the port is called so that
   * malformed inputs never reach the SQL function.
   */
  async emit(ctx: TenantContext, input: UsageEmitInput): Promise<void> {
    this.assertInput(input);
    const entry: UsageEntry = {
      tenantId: ctx.tenantId,
      metricKind: input.metricKind,
      quantity: input.quantity,
      unit: input.unit,
      occurredAt: input.occurredAt,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      entryKind: input.entryKind,
      correlationId: input.correlationId,
    };
    await this.persistence.appendUsage(ctx, entry);
  }

  /**
   * Convenience helper for the Fase 8 E2E harness: right after
   * `saveMessage` the harness invokes this to record a `text_chars`
   * metric derived from the persisted text (Plan Fase 8 V1.3 §11.3
   * emitter validador pattern).
   */
  async emitFromMessage(
    ctx: TenantContext,
    args: UsageEmitFromMessageInput,
  ): Promise<void> {
    if (typeof args.text !== "string") {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: text must be a string",
      );
    }
    await this.emit(ctx, {
      metricKind: "text_chars",
      quantity: args.text.length,
      unit: "chars",
      occurredAt: args.occurredAt,
      source: args.source,
      idempotencyKey: args.idempotencyKey,
      entryKind: "normal",
      correlationId: args.correlationId,
    });
  }

  private assertInput(input: UsageEmitInput): void {
    if (typeof input.source !== "string" || input.source.trim().length === 0) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: source must be non-empty",
      );
    }
    if (typeof input.unit !== "string" || input.unit.trim().length === 0) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: unit must be non-empty",
      );
    }
    if (typeof input.idempotencyKey !== "string" || !UUID_STRICT_RE.test(input.idempotencyKey)) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: idempotencyKey must be a UUID",
      );
    }
    if (input.correlationId !== null && (typeof input.correlationId !== "string" || !UUID_STRICT_RE.test(input.correlationId))) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: correlationId must be a UUID when present",
      );
    }
    if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity)) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: quantity must be a finite number",
      );
    }
    if (input.entryKind === "normal" && input.quantity < 0) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: quantity must be >= 0 when entryKind = normal",
      );
    }
    if (typeof input.occurredAt !== "string" || input.occurredAt.length === 0) {
      throw persistenceError(
        "constraint_violation",
        "UsageEmitter: occurredAt must be a non-empty ISO timestamp",
      );
    }
  }
}
