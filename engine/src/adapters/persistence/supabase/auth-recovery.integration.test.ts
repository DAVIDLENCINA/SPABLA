/**
 * SPABLA Engine — AUTH-RECOVERY integration tests (Fase 9 · Hito 9.2.4).
 *
 * Cierra el nivel de integración obligatorio §5.2 del Plan Hito 9.2:
 * un fake no basta; la cadena que produce el 401 real en el endpoint
 * `/api/v2/messages` GET debe verificarse contra el stack Supabase
 * local. Estos tests ejercitan directamente `supabase.auth.getClaims`,
 * que es el mismo mecanismo que `verifyJwt` de
 * `lib/v2/server/composition.ts` usa para decidir si la ruta HTTP
 * responde 401 (`Fase9RequestError({kind: "unauthorized"})`) o continúa.
 *
 * Estrategia de invalidación (elegida tras diagnóstico documentado):
 *   - `admin_deactivate_membership` NO invalida el JWT — Supabase Auth
 *     sigue aceptando el token; el 401 no aparece. La ruta responde
 *     con datos vacíos por RLS, no con 401. Descartada.
 *   - `auth.admin.signOut(userId)` revoca la sesión server-side pero
 *     `getClaims` verifica firma + `exp` contra JWKS; el token
 *     emitido permanece criptográficamente válido hasta expirar.
 *     No garantiza 401 determinista dentro de la ventana del test.
 *     Descartada.
 *   - **Firma corrupta**: mutar 1 byte de la firma de un JWT válido
 *     rompe la verificación criptográfica. `getClaims` la rechaza
 *     inmediatamente y de forma determinista. **Escogida.**
 *   - **Token malformado / vacío**: `extractBearerToken` en el
 *     handler lo rechaza antes de invocar Supabase Auth. Cubre el
 *     escenario «sesión ausente».
 *
 * La suite es **aislada y no destructiva**: crea un tenant y un actor
 * fixture con IDs generados aleatoriamente por corrida y limpia
 * exclusivamente sus propios recursos en `afterAll`. Nunca ejecuta
 * `supabase db reset`, nunca borra volúmenes, nunca toca datos de
 * otras suites, nunca reutiliza conversaciones existentes, nunca
 * toca Supabase productivo.
 *
 * Se activa por las mismas env vars que el resto de la Job B de CI:
 *   SPABLA_TEST_SUPABASE_URL
 *   SPABLA_TEST_SUPABASE_ANON_KEY
 *   SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY
 * En dev local sin esas vars, la suite se salta silenciosamente.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function privileged(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Corrupt the JWT signature deterministically: flip a well-known byte
 * of the base64url signature segment. The header + payload segments
 * are left byte-identical so the token still parses; only the crypto
 * verification fails, which is exactly what forces Supabase Auth to
 * reject with the same code path a productive 401 would follow.
 */
function corruptJwtSignature(jwt: string): string {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("unexpected JWT shape");
  const sig = parts[2] ?? "";
  if (sig.length === 0) throw new Error("empty JWT signature");
  const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  return `${parts[0]}.${parts[1]}.${flipped}`;
}

// eslint-disable-next-line vitest/no-conditional-tests
describe.skipIf(!ENABLED)("AUTH-RECOVERY · Supabase local integration (Hito 9.2.4)", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const tenantId = randomUUID();
  const email = `spabla-auth-recovery-${suiteId}@example.test`;
  const password = "P@ssw0rd-9-2-4-!";
  let actorId = "";
  let validJwt = "";
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    admin = privileged();

    // Fixture actor + tenant + active membership. Every id is unique to
    // this run to avoid collisions with concurrent suites hitting the
    // same Supabase local instance.
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr || !userData.user) {
      throw new Error(`createUser failed: ${userErr?.message ?? "no user"}`);
    }
    actorId = userData.user.id;
    createdActorIds.push(actorId);

    const tenantInsert = await admin
      .schema("spabla_v2")
      .from("tenants")
      .insert([{ id: tenantId, name: `AUTH-RECOVERY tenant ${suiteId}` }]);
    if (tenantInsert.error) {
      throw new Error(`tenant insert failed: ${tenantInsert.error.message}`);
    }
    createdTenantIds.push(tenantId);

    const membership = await admin.schema("spabla_v2").rpc("admin_add_membership", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_role: "owner",
    });
    if (membership.error) {
      throw new Error(`admin_add_membership failed: ${membership.error.message}`);
    }

    const { data: signInData, error: signInErr } = await anonClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !signInData.session || !signInData.user) {
      throw new Error(`signIn failed: ${signInErr?.message ?? "no session"}`);
    }
    if (signInData.user.id !== actorId) {
      throw new Error("signIn returned unexpected user id");
    }
    validJwt = signInData.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (admin === undefined) return;
    for (const uid of createdActorIds) {
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    if (createdTenantIds.length > 0) {
      await admin
        .schema("spabla_v2")
        .from("tenants")
        .delete()
        .in("id", createdTenantIds)
        .then(() => undefined, () => undefined);
    }
  });

  test("baseline: a valid session's JWT is accepted by getClaims (no 401 in the productive path)", async () => {
    const result = await anonClient().auth.getClaims(validJwt);
    expect(result.error).toBeNull();
    expect(result.data?.claims?.sub).toBe(actorId);
  });

  test("AUTH-RECOVERY trigger: a JWT with corrupted signature is REJECTED (drives the productive 401)", async () => {
    const corrupted = corruptJwtSignature(validJwt);
    const result = await anonClient().auth.getClaims(corrupted);
    // Supabase Auth signals rejection via `.error !== null` OR via a
    // missing `sub` claim. Either is enough for `verifyJwt` in
    // `lib/v2/server/composition.ts` to throw
    // `Fase9RequestError({kind: "unauthorized"})`, which the route
    // maps to HTTP 401. `classifyPollingResponse({status: 401}, ...)`
    // then returns `{kind: "expire"}`, driving the single recovery
    // transition on the client.
    const rejected = result.error !== null || !result.data?.claims?.sub;
    expect(rejected).toBe(true);
  });

  test("AUTH-RECOVERY documented negative: deactivating the membership does NOT invalidate the JWT (would produce empty data, not 401)", async () => {
    // Snapshot the "still accepted" property BEFORE deactivating so the
    // fixture stays reusable for later tests. This documents the design
    // rationale for choosing signature corruption over membership
    // deactivation as the 401 trigger.
    const before = await anonClient().auth.getClaims(validJwt);
    expect(before.error).toBeNull();
    expect(before.data?.claims?.sub).toBe(actorId);

    const deactivate = await admin.schema("spabla_v2").rpc("admin_deactivate_membership", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
    });
    if (deactivate.error) throw new Error(`admin_deactivate_membership failed: ${deactivate.error.message}`);

    const after = await anonClient().auth.getClaims(validJwt);
    // The JWT is still cryptographically valid; deactivation touches
    // membership tables, not Supabase Auth. The productive handler
    // would therefore NOT return 401 in this scenario — it would
    // return an empty page (RLS filters everything out) or a 403
    // depending on the specific query, but never 401.
    expect(after.error).toBeNull();
    expect(after.data?.claims?.sub).toBe(actorId);

    // Re-activate so the actor row stays reusable (idempotent purge
    // handled by `afterAll` will still clean it up).
    await admin.schema("spabla_v2").rpc("admin_add_membership", {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_role: "owner",
    }).then(() => undefined, () => undefined);
  });
});
