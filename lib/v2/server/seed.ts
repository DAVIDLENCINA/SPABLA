/**
 * SPABLA V2 — Fase 9 · Hito 9.1 · Development seed helpers.
 *
 * Server-only. Uses the Supabase `service_role` credential to bootstrap
 * two authenticated actors, one tenant, two active memberships, and one
 * shared conversation for the visible bilingual demo. Never returns
 * secret material to the caller; only opaque identifiers.
 *
 * The seed is idempotent by fixed emails: repeated calls return the same
 * actors and reuse the same tenant/conversation when the last seed still
 * exists. If the previous tenant is missing, a new tenant is created.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { LangCode } from "@engine/types/language";

// LANG13-02 · Plan V1.1 §3.6, §23, §25: el tipo del idioma sembrado
// admite cualquier `LangCode` del catálogo técnico (55 códigos
// ISO 639-1 congelados por ADR-005). Los datos sembrados (actorA en
// `es`, actorB en `en`) permanecen sin cambio: el ensanche es
// puramente aditivo sobre el tipo.
export type SeedActor = {
  readonly actorId: string;
  readonly email: string;
  readonly password: string;
  readonly language: LangCode;
};

export type SeedResult = {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorA: SeedActor;
  readonly actorB: SeedActor;
};

const ACTOR_A_EMAIL = "fase9.actor.a@spabla.local";
const ACTOR_B_EMAIL = "fase9.actor.b@spabla.local";
const ACTOR_A_PASSWORD = "fase9-actor-a-pass";
const ACTOR_B_PASSWORD = "fase9-actor-b-pass";
const TENANT_NAME = "SPABLA V2 Fase 9 Demo";

type ServiceEnv = {
  readonly url: string;
  readonly serviceKey: string;
};

function readServiceEnv(): ServiceEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("seed_env_missing");
  }
  return { url, serviceKey };
}

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  // Try create; if already exists we look it up.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.error && created.data.user) {
    return created.data.user.id;
  }
  // Fallback: list users and find by email.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      throw new Error("seed_list_users_failed");
    }
    const match = listed.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      // Ensure the known password is set so the demo login path works.
      const updated = await admin.auth.admin.updateUserById(match.id, { password });
      if (updated.error) {
        throw new Error("seed_update_password_failed");
      }
      return match.id;
    }
    if (listed.data.users.length < perPage) {
      throw new Error("seed_create_user_failed");
    }
    page += 1;
    if (page > 20) {
      throw new Error("seed_list_users_too_many_pages");
    }
  }
}

async function ensureTenantForActors(
  admin: SupabaseClient,
  actorAId: string,
  actorBId: string,
): Promise<string> {
  // Reuse an existing tenant whenever both actors are already active members.
  const { data: memberships } = await admin
    .schema("spabla_v2")
    .from("tenant_memberships")
    .select("tenant_id, actor_id, is_active")
    .in("actor_id", [actorAId, actorBId]);
  if (memberships && memberships.length > 0) {
    const byTenant = new Map<string, Set<string>>();
    for (const row of memberships) {
      if (!row.is_active) continue;
      const set = byTenant.get(row.tenant_id) ?? new Set<string>();
      set.add(row.actor_id);
      byTenant.set(row.tenant_id, set);
    }
    for (const [tenantId, actors] of byTenant.entries()) {
      if (actors.has(actorAId) && actors.has(actorBId)) {
        return tenantId;
      }
    }
  }
  const { data, error } = await admin
    .schema("spabla_v2")
    .rpc("admin_create_tenant", { p_name: TENANT_NAME });
  if (error || typeof data !== "string") {
    throw new Error("seed_create_tenant_failed");
  }
  await admin.schema("spabla_v2").rpc("admin_add_membership", {
    p_tenant_id: data,
    p_actor_id: actorAId,
    p_role: "member",
  });
  await admin.schema("spabla_v2").rpc("admin_add_membership", {
    p_tenant_id: data,
    p_actor_id: actorBId,
    p_role: "member",
  });
  return data;
}

async function ensureConversationForTenant(
  admin: SupabaseClient,
  tenantId: string,
  createdBy: string,
): Promise<string> {
  const { data: existing } = await admin
    .schema("spabla_v2")
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing && existing.length > 0) {
    return existing[0].id;
  }
  const { data, error } = await admin
    .schema("spabla_v2")
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      created_by: createdBy,
      language: "es",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("seed_create_conversation_failed");
  }
  return data.id as string;
}

export async function runFase9Seed(): Promise<SeedResult> {
  const { url, serviceKey } = readServiceEnv();
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actorAId = await ensureAuthUser(admin, ACTOR_A_EMAIL, ACTOR_A_PASSWORD);
  const actorBId = await ensureAuthUser(admin, ACTOR_B_EMAIL, ACTOR_B_PASSWORD);
  const tenantId = await ensureTenantForActors(admin, actorAId, actorBId);
  const conversationId = await ensureConversationForTenant(admin, tenantId, actorAId);
  return {
    tenantId,
    conversationId,
    actorA: { actorId: actorAId, email: ACTOR_A_EMAIL, password: ACTOR_A_PASSWORD, language: "es" },
    actorB: { actorId: actorBId, email: ACTOR_B_EMAIL, password: ACTOR_B_PASSWORD, language: "en" },
  };
}
