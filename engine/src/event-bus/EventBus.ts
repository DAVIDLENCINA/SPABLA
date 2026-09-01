/**
 * SPABLA Engine — EventBus.
 *
 * Typed pub/sub between the Engine and its consumers. The Engine emits;
 * modules and (in later fases) UI subscribe. Nothing else emits.
 *
 * Design decisions:
 *  - Delivery is synchronous and in subscription order.
 *  - Subscribers throwing do NOT block other subscribers; the exception is
 *    routed to an optional errorHandler and the bus continues.
 *  - No wildcards or pattern matching in Fase 1; every subscription is bound
 *    to exactly one event name.
 *  - Unsubscribe is idempotent.
 */

import type { EmittedEvent, EngineEventName, EventOf } from "../types/events.js";

export type Unsubscribe = () => void;
export type EventHandler<N extends EngineEventName> = (event: EventOf<N>) => void;

/** Called with any error thrown from a subscriber. Default logs to console.error. */
export type BusErrorHandler = (error: unknown, eventName: EngineEventName) => void;

const defaultErrorHandler: BusErrorHandler = (error, eventName) => {
  // eslint-disable-next-line no-console
  console.error(`[EventBus] subscriber for '${eventName}' threw:`, error);
};

export class EventBus {
  private readonly handlers: Map<EngineEventName, Set<EventHandler<EngineEventName>>> = new Map();
  private readonly errorHandler: BusErrorHandler;

  constructor(errorHandler: BusErrorHandler = defaultErrorHandler) {
    this.errorHandler = errorHandler;
  }

  /** Subscribe to a specific event. Returns an idempotent unsubscribe. */
  on<N extends EngineEventName>(name: N, handler: EventHandler<N>): Unsubscribe {
    let bucket = this.handlers.get(name);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(name, bucket);
    }
    const wrapped = handler as unknown as EventHandler<EngineEventName>;
    bucket.add(wrapped);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const b = this.handlers.get(name);
      if (b) {
        b.delete(wrapped);
        if (b.size === 0) this.handlers.delete(name);
      }
    };
  }

  /**
   * Emit an event. Delivers synchronously to all subscribers of that name.
   * Subscribers that throw are routed to errorHandler; other subscribers
   * still receive the event.
   */
  emit(event: EmittedEvent): void {
    const bucket = this.handlers.get(event.name);
    if (!bucket || bucket.size === 0) return;
    // Snapshot to allow subscribers to unsubscribe during delivery without
    // affecting the current iteration.
    const snapshot = Array.from(bucket);
    for (const handler of snapshot) {
      try {
        handler(event as never);
      } catch (err) {
        try {
          this.errorHandler(err, event.name);
        } catch {
          // errorHandler must never break emission; swallow if it too throws.
        }
      }
    }
  }

  /** Number of active subscribers for a given event name. */
  subscriberCount(name: EngineEventName): number {
    return this.handlers.get(name)?.size ?? 0;
  }

  /** Remove all subscribers. Used by Engine teardown in tests. */
  clear(): void {
    this.handlers.clear();
  }
}
