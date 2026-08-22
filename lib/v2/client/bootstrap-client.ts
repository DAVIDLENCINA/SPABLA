/**
 * SPABLA V2 · Hito 9.3.1-Q3 · Client-side wrapper of the authenticated
 * bootstrap endpoint (Q2 §10).
 *
 * `fetchBootstrap(supabase)` calls `GET /api/v2/bootstrap` using
 * `fetchWithAuthRetry` (bounded auth-retry on 401) and returns a tagged
 * `BootstrapOutcome`. Callers translate each outcome into the
 * corresponding UI state (Q2 §9 machine):
 *
 *   - `{ kind: "ok", payload }` — proceed to `ContextReady` (or to
 *     `BootstrappingContext` staying + partial UI while consumers pick
 *     up the payload).
 *   - `{ kind: "unauthorized" }` — the refresh failed too; caller must
 *     transition to `Recovering` → `Expired`.
 *   - `{ kind: "transient", status }` — 5xx or non-200 non-401 status;
 *     caller shows `TransientError` and backs off.
 *   - `{ kind: "malformed" }` — response body did not match the
 *     bootstrap payload shape; caller treats it as `TransientError`
 *     (never as expiration).
 *   - `{ kind: "network" }` — `fetch` threw before receiving any status.
 *
 * The client never persists the payload beyond the current React render
 * scope; the seed cache remains as an OPT-IN dev-only bookmark.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchWithAuthRetry } from "./fetch-with-auth-retry";

export type BootstrapActor = {
  readonly actorId: string;
  readonly email: string;
};

export type BootstrapMembership = {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly role: string;
  readonly isActive: boolean;
};

export type BootstrapConversation = {
  readonly conversationId: string;
  readonly tenantId: string;
  readonly language: string;
  readonly createdAt: string;
};

export type BootstrapPayload = {
  readonly actor: BootstrapActor;
  readonly memberships: ReadonlyArray<BootstrapMembership>;
  readonly selectedTenantId: string | null;
  readonly conversations: ReadonlyArray<BootstrapConversation>;
  readonly selectedConversationId: string | null;
  readonly canOperate: boolean;
};

export type BootstrapOutcome =
  | { readonly kind: "ok"; readonly payload: BootstrapPayload }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "transient"; readonly status: number }
  | { readonly kind: "malformed" }
  | { readonly kind: "network" };

const BOOTSTRAP_URL = "/api/v2/bootstrap";

export async function fetchBootstrap(
  supabase: SupabaseClient,
): Promise<BootstrapOutcome> {
  let response: Response;
  try {
    response = await fetchWithAuthRetry(supabase, BOOTSTRAP_URL, {
      method: "GET",
      cache: "no-store",
    });
  } catch {
    return { kind: "network" };
  }

  if (response.status === 401) {
    return { kind: "unauthorized" };
  }
  if (response.status !== 200) {
    return { kind: "transient", status: response.status };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "malformed" };
  }

  const payload = parseBootstrapPayload(body);
  if (payload === null) return { kind: "malformed" };
  return { kind: "ok", payload };
}

function parseBootstrapPayload(body: unknown): BootstrapPayload | null {
  if (body === null || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const actor = parseActor(b.actor);
  if (actor === null) return null;

  const memberships = parseMemberships(b.memberships);
  if (memberships === null) return null;

  const conversations = parseConversations(b.conversations);
  if (conversations === null) return null;

  const selectedTenantId = parseNullableString(b.selectedTenantId);
  const selectedConversationId = parseNullableString(b.selectedConversationId);
  const canOperate = typeof b.canOperate === "boolean" ? b.canOperate : null;
  if (canOperate === null) return null;

  return {
    actor,
    memberships,
    selectedTenantId,
    conversations,
    selectedConversationId,
    canOperate,
  };
}

function parseActor(value: unknown): BootstrapActor | null {
  if (value === null || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  if (typeof a.actorId !== "string" || typeof a.email !== "string") return null;
  return { actorId: a.actorId, email: a.email };
}

function parseMemberships(
  value: unknown,
): ReadonlyArray<BootstrapMembership> | null {
  if (!Array.isArray(value)) return null;
  const out: BootstrapMembership[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") return null;
    const m = raw as Record<string, unknown>;
    if (
      typeof m.tenantId !== "string"
      || typeof m.tenantName !== "string"
      || typeof m.role !== "string"
      || typeof m.isActive !== "boolean"
    ) return null;
    out.push({
      tenantId: m.tenantId,
      tenantName: m.tenantName,
      role: m.role,
      isActive: m.isActive,
    });
  }
  return out;
}

function parseConversations(
  value: unknown,
): ReadonlyArray<BootstrapConversation> | null {
  if (!Array.isArray(value)) return null;
  const out: BootstrapConversation[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (
      typeof c.conversationId !== "string"
      || typeof c.tenantId !== "string"
      || typeof c.language !== "string"
      || typeof c.createdAt !== "string"
    ) return null;
    out.push({
      conversationId: c.conversationId,
      tenantId: c.tenantId,
      language: c.language,
      createdAt: c.createdAt,
    });
  }
  return out;
}

function parseNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return null;
}
