/**
 * SPABLA V2 — Fase 9 · Hito 9.3.1-Q3 · Server-side bootstrap composer.
 *
 * Reads the caller's memberships and conversations under the
 * authenticated Supabase client (bearing the caller's JWT) so RLS
 * enforces isolation. NEVER uses service_role. Returns the deterministic
 * selection defined by contract Q2 §10.
 *
 * Ordering rules (Q2 §10):
 *   - `selectedTenantId`  = first ACTIVE membership by `created_at ASC`.
 *   - `selectedConversationId` = first conversation of `selectedTenantId`
 *     by `created_at ASC`.
 *   - `canOperate` = `selectedTenantId !== null && selectedConversationId !== null`.
 *
 * Both `tenant_memberships` and `conversations` carry `created_at`
 * columns per the phase-8 bootstrap migration (`20260730160000_phase8_bootstrap.sql`).
 * `tenant_memberships.is_active` is `NOT NULL DEFAULT TRUE`.
 *
 * @internal — must not be imported from client bundles.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SCHEMA = "spabla_v2";

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

export type BootstrapDeps = {
  /**
   * Authenticated Supabase client (bearing the caller's JWT). RLS
   * enforces membership visibility.
   */
  readonly authenticated: SupabaseClient;
  /**
   * Actor identifier extracted from the JWT (`sub`).
   */
  readonly actorId: string;
  /**
   * Actor email. Resolved from `auth.getUser()` at the handler boundary
   * so this composer stays a pure query orchestrator.
   */
  readonly actorEmail: string;
};

/**
 * Runs the two authoritative queries and applies the deterministic
 * selection rules. Throws on infrastructure failures (caller maps to
 * `503 unavailable` / `500 internal`).
 */
export async function buildBootstrapPayload(
  deps: BootstrapDeps,
): Promise<BootstrapPayload> {
  const memberships = await loadMemberships(deps.authenticated);
  const active = memberships.filter((m) => m.isActive);
  const selectedTenantId = active.length > 0 ? active[0].tenantId : null;

  const conversations = selectedTenantId !== null
    ? await loadConversations(deps.authenticated, selectedTenantId)
    : [];

  const selectedConversationId = conversations.length > 0
    ? conversations[0].conversationId
    : null;

  const canOperate = selectedTenantId !== null && selectedConversationId !== null;

  return {
    actor: { actorId: deps.actorId, email: deps.actorEmail },
    memberships,
    selectedTenantId,
    conversations,
    selectedConversationId,
    canOperate,
  };
}

async function loadMemberships(
  client: SupabaseClient,
): Promise<ReadonlyArray<BootstrapMembership>> {
  const { data, error } = await client
    .schema(SCHEMA)
    .from("tenant_memberships")
    .select("tenant_id, role, is_active, created_at, tenants ( id, name )")
    .order("created_at", { ascending: true });

  if (error) {
    throw new BootstrapQueryError("memberships_query_failed");
  }

  const rows = Array.isArray(data) ? data : [];
  const out: BootstrapMembership[] = [];
  for (const row of rows as ReadonlyArray<Record<string, unknown>>) {
    if (typeof row.tenant_id !== "string") continue;
    if (typeof row.role !== "string") continue;
    if (typeof row.is_active !== "boolean") continue;
    const tenants = row.tenants as unknown;
    let tenantName = "";
    if (tenants !== null && typeof tenants === "object" && !Array.isArray(tenants)) {
      const name = (tenants as Record<string, unknown>).name;
      if (typeof name === "string") tenantName = name;
    }
    out.push({
      tenantId: row.tenant_id,
      tenantName,
      role: row.role,
      isActive: row.is_active,
    });
  }
  return out;
}

async function loadConversations(
  client: SupabaseClient,
  tenantId: string,
): Promise<ReadonlyArray<BootstrapConversation>> {
  const { data, error } = await client
    .schema(SCHEMA)
    .from("conversations")
    .select("id, tenant_id, language, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new BootstrapQueryError("conversations_query_failed");
  }

  const rows = Array.isArray(data) ? data : [];
  const out: BootstrapConversation[] = [];
  for (const row of rows as ReadonlyArray<Record<string, unknown>>) {
    if (typeof row.id !== "string") continue;
    if (typeof row.tenant_id !== "string") continue;
    if (typeof row.language !== "string") continue;
    if (typeof row.created_at !== "string") continue;
    out.push({
      conversationId: row.id,
      tenantId: row.tenant_id,
      language: row.language,
      createdAt: row.created_at,
    });
  }
  return out;
}

export class BootstrapQueryError extends Error {
  readonly kind: string;
  constructor(kind: string) {
    super(kind);
    this.name = "BootstrapQueryError";
    this.kind = kind;
  }
}

/**
 * Helper to construct the authenticated Supabase client from a raw JWT.
 * Kept here so tests can build a client without importing composition
 * internals. In productive use the route handler calls
 * `buildRequestScopedPersistence(...)` (composition.ts) or an
 * equivalent that produces the `authenticated` client under the same
 * anon env vars.
 */
export function buildAuthenticatedClientFromToken(
  supabaseUrl: string,
  anonKey: string,
  jwt: string,
): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
