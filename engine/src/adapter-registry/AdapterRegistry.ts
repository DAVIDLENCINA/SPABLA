/**
 * SPABLA Engine — AdapterRegistry.
 *
 * Runtime slot table for the six external-integration kinds. Consumers
 * (SDK users, later fases) call `register` at boot to bind concrete
 * implementations; the Engine reads via `get` at command time.
 *
 * No adapter logic lives here — this is a pure typed map. Fase 1.5 does not
 * implement any concrete adapter; that is deferred to Fases 3-7.
 */

import type { AdapterKind, AdapterByKind } from "../types/adapters.js";
import { isAdapterKind } from "../types/adapters.js";

export class AdapterRegistryError extends Error {
  public readonly kind: string;
  public readonly reason: string;

  constructor(kind: string, reason: string) {
    super(`AdapterRegistry[${kind}]: ${reason}`);
    this.name = "AdapterRegistryError";
    this.kind = kind;
    this.reason = reason;
  }
}

export class AdapterRegistry {
  private readonly slots: Map<AdapterKind, AdapterByKind[AdapterKind]> = new Map();

  /**
   * Register an adapter for a kind. Rejects if the kind is unknown or a
   * different implementation is already registered.
   *
   * Re-registering the exact same instance is a no-op (idempotent).
   */
  register<K extends AdapterKind>(kind: K, impl: AdapterByKind[K]): void {
    if (!isAdapterKind(kind)) {
      throw new AdapterRegistryError(String(kind), "unknown-kind");
    }
    if (!impl || typeof impl !== "object") {
      throw new AdapterRegistryError(kind, "impl-must-be-object");
    }
    if (impl.kind !== kind) {
      throw new AdapterRegistryError(
        kind,
        `impl.kind mismatch: expected '${kind}', got '${(impl as { kind: string }).kind}'`,
      );
    }
    // Runtime contract check per kind. TypeScript already forbids these at
    // compile time, but the registry is the only choke point in JS-land.
    if (kind === "mt" && typeof (impl as { translate?: unknown }).translate !== "function") {
      throw new AdapterRegistryError(kind, "mt-adapter-missing-translate");
    }
    if (kind === "tts" && typeof (impl as { synthesize?: unknown }).synthesize !== "function") {
      throw new AdapterRegistryError(kind, "tts-adapter-missing-synthesize");
    }
    const existing = this.slots.get(kind);
    if (existing && existing !== impl) {
      throw new AdapterRegistryError(kind, "already-registered");
    }
    this.slots.set(kind, impl);
  }

  /** Retrieve the registered adapter for a kind, or undefined. */
  get<K extends AdapterKind>(kind: K): AdapterByKind[K] | undefined {
    if (!isAdapterKind(kind)) return undefined;
    return this.slots.get(kind) as AdapterByKind[K] | undefined;
  }

  /** Whether a kind currently has a registered implementation. */
  has(kind: AdapterKind): boolean {
    if (!isAdapterKind(kind)) return false;
    return this.slots.has(kind);
  }

  /**
   * Remove the registered adapter for a kind. Returns true if something was
   * removed, false if the slot was already empty. Idempotent-safe.
   */
  unregister(kind: AdapterKind): boolean {
    if (!isAdapterKind(kind)) return false;
    return this.slots.delete(kind);
  }

  /** Snapshot of currently-populated kinds. */
  registeredKinds(): ReadonlyArray<AdapterKind> {
    return Array.from(this.slots.keys());
  }
}
