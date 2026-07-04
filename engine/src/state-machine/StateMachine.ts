/**
 * SPABLA Engine — generic finite state machine primitive.
 *
 * A StateMachine is defined by a transition table. `assertTransition` throws
 * a typed error when a caller attempts an unauthorized transition. Managers
 * (CallSession, LanguagePair resolution, per-turn pipeline in later fases)
 * use this primitive so every transition is validated at one choke point.
 */

/** A transition entry: from state → allowed next states. */
export type TransitionMap<S extends string> = ReadonlyMap<S, ReadonlySet<S>>;

/** Convenience: build a TransitionMap from a plain object literal. */
export function buildTransitions<S extends string>(
  table: Readonly<Record<S, ReadonlyArray<S>>>,
): TransitionMap<S> {
  const map = new Map<S, ReadonlySet<S>>();
  for (const [from, tos] of Object.entries(table) as Array<[S, ReadonlyArray<S>]>) {
    map.set(from, new Set<S>(tos));
  }
  return map;
}

export class InvalidTransitionError extends Error {
  public readonly primitive: string;
  public readonly from: string;
  public readonly to: string;

  constructor(primitive: string, from: string, to: string) {
    super(`${primitive}: invalid transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
    this.primitive = primitive;
    this.from = from;
    this.to = to;
  }
}

export class StateMachine<S extends string> {
  public readonly primitive: string;
  public readonly transitions: TransitionMap<S>;
  private readonly terminalStates: ReadonlySet<S>;

  /**
   * @param primitive Name used in error messages / telemetry.
   * @param transitions Allowed transitions.
   * @param terminalStates States after which no transition is allowed.
   */
  constructor(
    primitive: string,
    transitions: TransitionMap<S>,
    terminalStates: ReadonlySet<S> = new Set(),
  ) {
    this.primitive = primitive;
    this.transitions = transitions;
    this.terminalStates = terminalStates;
  }

  /** Is `to` reachable from `from` in a single step? */
  canTransition(from: S, to: S): boolean {
    if (this.terminalStates.has(from)) return false;
    return this.transitions.get(from)?.has(to) ?? false;
  }

  /** Throws InvalidTransitionError if not allowed. Returns `to` when allowed. */
  assertTransition(from: S, to: S): S {
    if (!this.canTransition(from, to)) {
      throw new InvalidTransitionError(this.primitive, from, to);
    }
    return to;
  }

  isTerminal(state: S): boolean {
    return this.terminalStates.has(state);
  }

  /** All states known to the machine. */
  allStates(): ReadonlySet<S> {
    const out = new Set<S>();
    for (const [from, tos] of this.transitions.entries()) {
      out.add(from);
      for (const to of tos) out.add(to);
    }
    for (const s of this.terminalStates) out.add(s);
    return out;
  }
}
