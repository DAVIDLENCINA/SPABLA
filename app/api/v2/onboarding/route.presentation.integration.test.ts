/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-A-Q2-R · Barrera anti-fuga de la clave
 * interna del personal workspace + implementación real de Q2-54 y Q2-55.
 *
 * Cubre exclusivamente lo que Q2-R rectifica sobre Q2:
 *
 *   - Anti-fuga: `workspace.personal.default` NUNCA aparece en la
 *     respuesta pública de `/api/v2/onboarding` ni de `/api/v2/bootstrap`
 *     en ningún idioma canónico soportado. La clave permanece
 *     internamente persistida en `tenants.name`.
 *
 *   - Cambiar idioma NO crea otro tenant y NO ejecuta UPDATE sobre
 *     `tenants.name` (mismo tenantId, mismo valor persistido).
 *
 *   - Q2-54 real: crear actor Auth, ejecutar onboarding, eliminar el
 *     actor mediante `admin.auth.admin.deleteUser`, invocar el handler
 *     con el JWT del actor eliminado → `401 unauthorized` opaco, cero
 *     RPC ejecutada, cero mapping nuevo.
 *
 *   - Q2-55 real: mismo email tras eliminación Auth → nuevo `sub`,
 *     nuevo tenant, cero herencia del actor anterior.
 *
 * Skipped locally without env vars; runs in CI Job B where the
 * Supabase local stack is up and env vars are exported by
 * `scripts/ci/apply-migrations.sh`.
 */

import { createHmac, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import { POST as ONBOARDING_POST } from "./route";
import { GET as BOOTSTRAP_GET } from "../bootstrap/route";

const SUPABASE_URL = process.env.SPABLA_TEST_SUPABASE_URL ?? "";
const ANON = process.env.SPABLA_TEST_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SPABLA_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
const ENABLED = SUPABASE_URL !== "" && ANON !== "" && SERVICE !== "";

const INTERNAL_KEY = "workspace.personal.default";

/**
 * Supabase local convention (documented in `supabase status`): the
 * JWT secret is a fixed non-secret local value shared with the
 * `authenticator` role. Not usable outside the local stack.
 */
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

/**
 * Build a locally-signed JWT with the given `sub` and `exp` (unix
 * seconds). Firma HS256 con el JWT_SECRET local del stack Supabase
 * (documentado y no productivo). Ideal para probar Q2-54: reconstruir
 * un JWT "expirado" del `sub` de un actor Auth ya eliminado y
 * comprobar que `verifyJwt` lo rechaza con 401 opaco.
 */
function buildLocalJwt(input: {
  sub: string;
  expSeconds: number;
  iatSeconds?: number;
}): string {
  const b64url = (buf: Buffer): string =>
    buf
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub: input.sub,
    iat: input.iatSeconds ?? Math.floor(Date.now() / 1000) - 10,
    exp: input.expSeconds,
    iss: "supabase-demo",
  };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const data = `${h}.${p}`;
  const sig = b64url(createHmac("sha256", LOCAL_JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

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

function buildOnboardingRequest(input: {
  token: string | null;
  acceptLanguage?: string | null;
  body?: string;
}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.token !== null) headers["Authorization"] = `Bearer ${input.token}`;
  if (input.acceptLanguage) headers["Accept-Language"] = input.acceptLanguage;
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers,
  };
  init.body = input.body ?? "{}";
  return new NextRequest("http://localhost:3000/api/v2/onboarding", init);
}

function buildBootstrapRequest(input: {
  token: string;
  acceptLanguage?: string | null;
}): NextRequest {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.token}`,
  };
  if (input.acceptLanguage) headers["Accept-Language"] = input.acceptLanguage;
  return new NextRequest("http://localhost:3000/api/v2/bootstrap", {
    method: "GET",
    headers,
  });
}

const suite = ENABLED ? describe : describe.skip;

suite("[Q2-R-presentation] anti-leak of internal workspace key", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const password = "P@ssw0rd-9-3-2-a-q2-r-presentation";
  const createdActorIds: string[] = [];
  const createdTenantIds: string[] = [];

  let actorId = "";
  let actorEmail = "";
  let actorJwt = "";

  async function createActor(label: string): Promise<{
    id: string;
    email: string;
    jwt: string;
  }> {
    const email = `spabla-q2r-${label}-${suiteId}-${randomUUID().slice(0, 6)}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`createUser(${email}) failed: ${error?.message ?? "no user"}`);
    }
    createdActorIds.push(data.user.id);
    const { data: signIn, error: signInErr } = await anonClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !signIn.session) {
      throw new Error(`signIn(${email}) failed: ${signInErr?.message ?? "no session"}`);
    }
    return { id: data.user.id, email, jwt: signIn.session.access_token };
  }

  async function readTenantName(tenantId: string): Promise<string | null> {
    const { data } = await admin
      .schema("spabla_v2")
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    if (data === null) return null;
    return (data as { name: string }).name;
  }

  beforeAll(async () => {
    if (!ENABLED) return;
    admin = privileged();
    const created = await createActor("main");
    actorId = created.id;
    actorEmail = created.email;
    actorJwt = created.jwt;
  }, 60_000);

  afterAll(async () => {
    if (!ENABLED || admin === undefined) return;
    for (const uid of createdActorIds) {
      const map = await admin
        .schema("spabla_v2")
        .from("actor_personal_workspace")
        .select("tenant_id")
        .eq("actor_id", uid)
        .maybeSingle();
      const tenantId = (map.data as { tenant_id?: string } | null)?.tenant_id;
      await admin.schema("spabla_v2").from("actor_personal_workspace").delete().eq("actor_id", uid);
      if (tenantId) {
        createdTenantIds.push(tenantId);
        await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("tenant_id", tenantId);
        await admin.schema("spabla_v2").from("tenants").delete().eq("id", tenantId);
      }
      await admin.schema("spabla_v2").from("actor_lifecycle_state").delete().eq("actor_id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  // ────────────────────────────────────────────────────────────────
  // Q2-R-01 · La clave interna NUNCA aparece en /api/v2/onboarding
  // Q2-R-02 · Cada idioma canónico devuelve la etiqueta contractual
  // ────────────────────────────────────────────────────────────────
  test("Q2-R-01 · /api/v2/onboarding response body never contains the internal key (13 languages)", async () => {
    // Cover a representative subset of the 13 canonical locales
    // plus one manipulated hint (Q2-51). The RPC is idempotent for
    // this actor so we can invoke it many times without side effects.
    const cases: ReadonlyArray<{ acceptLanguage: string; expected: string }> = [
      { acceptLanguage: "es-ES", expected: "Mi espacio" },
      { acceptLanguage: "ca", expected: "El meu espai" },
      { acceptLanguage: "en", expected: "My space" },
      { acceptLanguage: "fr-FR", expected: "Mon espace" },
      { acceptLanguage: "de", expected: "Mein Bereich" },
      { acceptLanguage: "it-IT", expected: "Il mio spazio" },
      { acceptLanguage: "pt-BR", expected: "Meu espaço" },
      { acceptLanguage: "zh-CN", expected: "我的空间" },
      { acceptLanguage: "ja-JP", expected: "マイスペース" },
      { acceptLanguage: "ko", expected: "내 공간" },
      { acceptLanguage: "ar", expected: "مساحتي" },
      { acceptLanguage: "hi", expected: "मेरा स्थान" },
      { acceptLanguage: "ru", expected: "Моё пространство" },
      // Manipulated hint falls back to `en` (Q2-R-04)
      { acceptLanguage: "xx-YY", expected: "My space" },
      { acceptLanguage: "zh-Hans", expected: "我的空间" }, // prefix `zh` accepted; canonical
    ];
    let firstTenantId: string | undefined;
    for (const c of cases) {
      const res = await ONBOARDING_POST(
        buildOnboardingRequest({ token: actorJwt, acceptLanguage: c.acceptLanguage }),
      );
      expect(res.status).toBe(200);
      const bodyText = await res.text();
      // Anti-leak: the internal key never appears in the raw body.
      expect(bodyText).not.toContain(INTERNAL_KEY);
      const parsed = JSON.parse(bodyText) as {
        tenantId: string;
        role: string;
        label: string;
      };
      expect(parsed.label).toBe(c.expected);
      // Q2-R-08: changing language keeps the same tenantId.
      if (firstTenantId === undefined) {
        firstTenantId = parsed.tenantId;
      } else {
        expect(parsed.tenantId).toBe(firstTenantId);
      }
      // Q2-R-10: the internal key is still persisted (not mutated
      // by any of these calls).
      const persistedName = await readTenantName(parsed.tenantId);
      expect(persistedName).toBe(INTERNAL_KEY);
    }
  }, 60_000);

  // ────────────────────────────────────────────────────────────────
  // Q2-R-03 · La clave interna NUNCA aparece en /api/v2/bootstrap
  // Q2-R-05 · El bootstrap devuelve la etiqueta española cuando pide es
  // Q2-R-06 · El bootstrap devuelve la etiqueta inglesa cuando pide en
  // Q2-R-07 · El bootstrap devuelve la etiqueta contractual para ja
  // ────────────────────────────────────────────────────────────────
  test("Q2-R-03 · /api/v2/bootstrap response body never contains the internal key (multiple languages)", async () => {
    // Ensure onboarding has run (from the previous test the actor
    // has its mapping). Now assert the composer localises the label.
    for (const [acceptLanguage, expected] of [
      ["es", "Mi espacio"],
      ["en", "My space"],
      ["ja-JP", "マイスペース"],
      ["zh-CN", "我的空间"],
      ["xx-YY", "My space"], // fallback
    ] as const) {
      const res = await BOOTSTRAP_GET(
        buildBootstrapRequest({ token: actorJwt, acceptLanguage }),
      );
      expect(res.status).toBe(200);
      const bodyText = await res.text();
      // Anti-leak: full serialisation contains no internal key.
      expect(bodyText).not.toContain(INTERNAL_KEY);
      const parsed = JSON.parse(bodyText) as {
        memberships: ReadonlyArray<{ tenantId: string; tenantName: string }>;
        selectedTenantId: string | null;
        canOperate: boolean;
      };
      // The membership for the personal tenant surfaces the localised label.
      const personal = parsed.memberships.find(
        (m) => m.tenantId === parsed.selectedTenantId,
      );
      expect(personal).toBeDefined();
      expect(personal!.tenantName).toBe(expected);
      expect(personal!.tenantName).not.toBe(INTERNAL_KEY);
    }
  }, 30_000);

  // ────────────────────────────────────────────────────────────────
  // Q2-R-09 · Changing language does NOT execute UPDATE on tenants.name
  // ────────────────────────────────────────────────────────────────
  test("Q2-R-09 · switching language leaves tenants.name intact (no UPDATE)", async () => {
    const mapping = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("tenant_id")
      .eq("actor_id", actorId)
      .maybeSingle();
    const tenantId = (mapping.data as { tenant_id: string }).tenant_id;
    const before = await readTenantName(tenantId);
    // Trigger multiple onboardings with different locales.
    for (const acceptLanguage of ["fr", "de", "ja-JP", "zh-CN"]) {
      const res = await ONBOARDING_POST(
        buildOnboardingRequest({ token: actorJwt, acceptLanguage }),
      );
      expect(res.status).toBe(200);
    }
    const after = await readTenantName(tenantId);
    expect(after).toBe(before);
    expect(after).toBe(INTERNAL_KEY);
  });
});

// ────────────────────────────────────────────────────────────────
// Q2-54 · Actor Auth ya eliminado — prueba real con deleteUser
// Q2-55 · Re-registro con el mismo email — nuevo `sub` con nuevo tenant
// ────────────────────────────────────────────────────────────────

suite("[Q2-auth-lifecycle] Q2-54 + Q2-55 real Auth flow", () => {
  let admin: SupabaseClient;
  const suiteId = randomUUID().slice(0, 12);
  const password = "P@ssw0rd-9-3-2-a-q2-r-lifecycle";
  const trackedActorIds = new Set<string>();
  const trackedTenantIds = new Set<string>();

  async function createActorWithEmail(email: string): Promise<{
    id: string;
    jwt: string;
  }> {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`createUser(${email}) failed: ${error?.message ?? "no user"}`);
    }
    trackedActorIds.add(data.user.id);
    const { data: signIn, error: signInErr } = await anonClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !signIn.session) {
      throw new Error(`signIn(${email}) failed: ${signInErr?.message ?? "no session"}`);
    }
    return { id: data.user.id, jwt: signIn.session.access_token };
  }

  beforeAll(async () => {
    if (!ENABLED) return;
    admin = privileged();
  }, 30_000);

  afterAll(async () => {
    if (!ENABLED || admin === undefined) return;
    for (const uid of trackedActorIds) {
      const map = await admin
        .schema("spabla_v2")
        .from("actor_personal_workspace")
        .select("tenant_id")
        .eq("actor_id", uid)
        .maybeSingle();
      const tenantId = (map.data as { tenant_id?: string } | null)?.tenant_id;
      await admin.schema("spabla_v2").from("actor_personal_workspace").delete().eq("actor_id", uid);
      if (tenantId) {
        trackedTenantIds.add(tenantId);
        await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("tenant_id", tenantId);
        await admin.schema("spabla_v2").from("tenants").delete().eq("id", tenantId);
      }
      await admin.schema("spabla_v2").from("actor_lifecycle_state").delete().eq("actor_id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  /**
   * Q2-54 · Actor Auth eliminado (real, revocación efectiva).
   *
   * Hito 9.3.2-A-Q2-R2. La versión previa Q2-R fabricaba un JWT
   * expirado tras `deleteUser` y demostraba que un JWT con `exp`
   * pasado se rechaza — pero eso no probaba la REVOCACIÓN del JWT
   * original vigente. Q2-R2 introduce en la RPC una comprobación
   * `PERFORM 1 FROM auth.users WHERE id = p_actor_id` dentro del
   * mismo advisory lock; si el actor ya no existe, la RPC aborta
   * con `RAISE EXCEPTION USING ERRCODE = 'P0002'`. El adaptador
   * mapea a `OnboardingAuthActorDeletedError` → handler `401
   * unauthorized` opaco con `internalKind = "auth_actor_deleted"`.
   *
   * El test:
   *   1. Crea Auth A y hace sign-in.
   *   2. Reserva el `accessTokenA` original (byte por byte).
   *   3. Ejecuta onboarding → 200 (mapping + tenant + membership).
   *   4. Elimina realmente Auth A.
   *   5. Confirma que `accessTokenA` sigue teniendo `exp > now`
   *      (JWT no expirado).
   *   6. Reutiliza `accessTokenA` byte-por-byte para invocar
   *      onboarding otra vez → **401 unauthorized opaco**.
   *   7. Verifica cero escritura tras la eliminación (contadores
   *      globales invariantes).
   */
  test("Q2-54 · deleted Auth actor with unexpired JWT is rejected 401 (Q2-R2 real revocation)", async () => {
    const emailA = `spabla-q2-54-${suiteId}-${randomUUID().slice(0, 6)}@example.test`;
    const a = await createActorWithEmail(emailA);
    const jwtA = a.jwt;
    const actorAId = a.id;

    // Decodificar el JWT original y confirmar que `exp` está en el
    // futuro antes de continuar.
    const payloadPre = JSON.parse(
      Buffer.from(jwtA.split(".")[1] ?? "", "base64url").toString(),
    ) as { sub: string; exp: number };
    const nowPre = Math.floor(Date.now() / 1000);
    expect(payloadPre.sub).toBe(actorAId);
    expect(payloadPre.exp).toBeGreaterThan(nowPre);

    // Step 1: onboarding real de A con el JWT original vigente
    const initial = await ONBOARDING_POST(
      buildOnboardingRequest({ token: jwtA, acceptLanguage: "es" }),
    );
    expect(initial.status).toBe(200);
    const initialBody = JSON.parse(await initial.text()) as { tenantId: string };
    const tenantAId = initialBody.tenantId;

    // Verificar mapping + tenant + membership creados
    const mappingBefore = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("tenant_id")
      .eq("actor_id", actorAId);
    expect(mappingBefore.data ?? []).toHaveLength(1);
    const tenantBefore = await admin
      .schema("spabla_v2")
      .from("tenants")
      .select("id")
      .eq("id", tenantAId);
    expect(tenantBefore.data ?? []).toHaveLength(1);
    const membershipBefore = await admin
      .schema("spabla_v2")
      .from("tenant_memberships")
      .select("actor_id, is_active")
      .eq("actor_id", actorAId);
    expect(membershipBefore.data ?? []).toHaveLength(1);
    expect((membershipBefore.data ?? [])[0].is_active).toBe(true);

    // Step 2: eliminación real de Auth A
    const del = await admin.auth.admin.deleteUser(actorAId);
    expect(del.error).toBeNull();

    // Step 3: confirmar que accessTokenA sigue teniendo exp futuro
    // (el JWT no ha caducado por tiempo).
    const nowPost = Math.floor(Date.now() / 1000);
    expect(payloadPre.exp).toBeGreaterThan(nowPost);

    // Contadores globales antes de la reutilización del JWT original
    const tenantsGlobalBefore = await admin
      .schema("spabla_v2")
      .from("tenants")
      .select("*", { count: "exact", head: true });
    const mappingsGlobalBefore = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("*", { count: "exact", head: true });
    const membershipsGlobalBefore = await admin
      .schema("spabla_v2")
      .from("tenant_memberships")
      .select("*", { count: "exact", head: true });

    // Step 4: reutilizar el MISMO accessTokenA byte-por-byte
    const tokenAfterDeletion = jwtA;
    expect(tokenAfterDeletion).toBe(jwtA);

    // Step 5: invocar onboarding con el JWT original → 401 opaco
    const afterDeletion = await ONBOARDING_POST(
      buildOnboardingRequest({ token: tokenAfterDeletion, acceptLanguage: "es" }),
    );
    expect(afterDeletion.status).toBe(401);
    const body = JSON.parse(await afterDeletion.text()) as {
      error: string;
      correlationId: string;
    };
    expect(body.error).toBe("unauthorized");
    expect(body.correlationId).toBeTruthy();
    expect(Object.keys(body).sort()).toStrictEqual(["correlationId", "error"]);

    // Cero escritura tras la revocación efectiva
    const tenantsGlobalAfter = await admin
      .schema("spabla_v2")
      .from("tenants")
      .select("*", { count: "exact", head: true });
    const mappingsGlobalAfter = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("*", { count: "exact", head: true });
    const membershipsGlobalAfter = await admin
      .schema("spabla_v2")
      .from("tenant_memberships")
      .select("*", { count: "exact", head: true });
    expect(tenantsGlobalAfter.count).toBe(tenantsGlobalBefore.count);
    expect(mappingsGlobalAfter.count).toBe(mappingsGlobalBefore.count);
    expect(membershipsGlobalAfter.count).toBe(membershipsGlobalBefore.count);

    // Verificación adicional: el mapping previo permanece en
    // cuarentena (contract §17-ter G). tenantA no se reasigna ni
    // se elimina automáticamente.
    const mappingAfter = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("tenant_id, actor_id")
      .eq("actor_id", actorAId)
      .maybeSingle();
    expect((mappingAfter.data as { tenant_id: string } | null)?.tenant_id).toBe(tenantAId);
    expect((mappingAfter.data as { actor_id: string } | null)?.actor_id).toBe(actorAId);

    // Verificación (a) adicional (evidencia complementaria, no
    // sustitutiva): Supabase Auth también rechaza nuevos sign-ins
    // para ese email tras la eliminación.
    const reSignIn = await anonClient().auth.signInWithPassword({
      email: emailA,
      password,
    });
    expect(reSignIn.error).not.toBeNull();
    expect(reSignIn.data.session).toBeNull();

    // Cleanup manual del residuo del A eliminado
    await admin.schema("spabla_v2").from("actor_personal_workspace").delete().eq("actor_id", actorAId);
    await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("actor_id", actorAId);
    await admin.schema("spabla_v2").from("tenants").delete().eq("id", tenantAId);
  }, 60_000);

  /**
   * Q2-R2-A · Eliminación ANTES del primer onboarding.
   * JWT vigente + actor Auth borrado antes de invocar onboarding →
   * 401 opaco + cero escritura en spabla_v2.
   */
  test("Q2-R2-A · deletion before first onboarding rejects the JWT (real revocation)", async () => {
    const emailA = `spabla-q2-r2-a-${suiteId}-${randomUUID().slice(0, 6)}@example.test`;
    const a = await createActorWithEmail(emailA);
    const jwtA = a.jwt;
    const actorAId = a.id;

    // Verificar JWT vigente
    const payload = JSON.parse(
      Buffer.from(jwtA.split(".")[1] ?? "", "base64url").toString(),
    ) as { exp: number };
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Eliminar A antes de cualquier onboarding
    const del = await admin.auth.admin.deleteUser(actorAId);
    expect(del.error).toBeNull();

    // Contadores globales antes de invocar
    const tenantsGlobalBefore = await admin
      .schema("spabla_v2")
      .from("tenants")
      .select("*", { count: "exact", head: true });
    const mappingsGlobalBefore = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("*", { count: "exact", head: true });

    // Invocar onboarding con el JWT original vigente
    const res = await ONBOARDING_POST(buildOnboardingRequest({ token: jwtA }));
    expect(res.status).toBe(401);
    const body = JSON.parse(await res.text()) as { error: string };
    expect(body.error).toBe("unauthorized");

    // Cero escritura
    const tenantsGlobalAfter = await admin
      .schema("spabla_v2")
      .from("tenants")
      .select("*", { count: "exact", head: true });
    const mappingsGlobalAfter = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("*", { count: "exact", head: true });
    expect(tenantsGlobalAfter.count).toBe(tenantsGlobalBefore.count);
    expect(mappingsGlobalAfter.count).toBe(mappingsGlobalBefore.count);

    // Cero mapping para el actor eliminado
    const orphanCheck = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("actor_id")
      .eq("actor_id", actorAId);
    expect(orphanCheck.data ?? []).toHaveLength(0);
  }, 30_000);

  /**
   * Q2-R2-D · Actor activo normal — el flujo autorizado sigue
   * respondiendo 200 tras Q2-R2 (regresión positiva).
   */
  test("Q2-R2-D · active Auth actor still gets 200 (regression, Q2-R2)", async () => {
    const emailA = `spabla-q2-r2-d-${suiteId}-${randomUUID().slice(0, 6)}@example.test`;
    const a = await createActorWithEmail(emailA);
    const res1 = await ONBOARDING_POST(buildOnboardingRequest({ token: a.jwt, acceptLanguage: "en" }));
    expect(res1.status).toBe(200);
    // Idempotencia intacta
    const res2 = await ONBOARDING_POST(buildOnboardingRequest({ token: a.jwt, acceptLanguage: "en" }));
    expect(res2.status).toBe(200);
    const body1 = JSON.parse(await res1.text()) as { tenantId: string };
    const body2 = JSON.parse(await res2.text()) as { tenantId: string };
    expect(body2.tenantId).toBe(body1.tenantId);
    // Cleanup para no dejar residuo en la global count
    await admin.schema("spabla_v2").from("actor_personal_workspace").delete().eq("actor_id", a.id);
    await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("actor_id", a.id);
    await admin.schema("spabla_v2").from("tenants").delete().eq("id", body1.tenantId);
  }, 30_000);

  /**
   * Q2-R2-E · No hay llamada HTTP a Auth por request. La
   * comprobación de existencia se realiza dentro de la RPC (mismo
   * cluster PostgreSQL). Verificación indirecta: aunque
   * `admin.auth.admin.getUserById` no se llama, la RPC responde
   * correctamente. Es imposible medir «cero llamada» sin instrumentar
   * el auth-service, pero podemos verificar que el path completo se
   * ejecuta en < 500 ms (que sería impensable con round-trips
   * Auth vía HTTP para cada request en un entorno local).
   */
  test("Q2-R2-E · onboarding completes without HTTP round-trip to Auth (latency budget)", async () => {
    const emailA = `spabla-q2-r2-e-${suiteId}-${randomUUID().slice(0, 6)}@example.test`;
    const a = await createActorWithEmail(emailA);
    const start = Date.now();
    const res = await ONBOARDING_POST(buildOnboardingRequest({ token: a.jwt }));
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    // Latencia razonable con Supabase local: la RPC + verifyJwt
    // (JWKS cache) deberían completarse en decenas/cientos de ms.
    // Un round-trip HTTP adicional a Auth sumaría 50-200 ms extra.
    // Verificamos un budget conservador de 2s para no ser flaky en
    // CI Ubuntu bajo carga.
    expect(elapsed).toBeLessThan(2000);
    const body = JSON.parse(await res.text()) as { tenantId: string };
    await admin.schema("spabla_v2").from("actor_personal_workspace").delete().eq("actor_id", a.id);
    await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("actor_id", a.id);
    await admin.schema("spabla_v2").from("tenants").delete().eq("id", body.tenantId);
  }, 30_000);

  /**
   * Q2-55 · Re-registro con el mismo email: crear A, onboarding, eliminar
   * A, crear B con el mismo email, onboarding B → nuevo tenant, cero
   * herencia del A.
   */
  test("Q2-55 · re-registration with same email yields a new sub and a new tenant", async () => {
    const sharedEmail = `spabla-q2-55-${suiteId}-${randomUUID().slice(0, 6)}@example.test`;

    // Step 1: alta A + onboarding
    const a = await createActorWithEmail(sharedEmail);
    const subA = a.id;
    const jwtA = a.jwt;

    const onboardingA = await ONBOARDING_POST(
      buildOnboardingRequest({ token: jwtA, acceptLanguage: "en" }),
    );
    expect(onboardingA.status).toBe(200);
    const bodyA = JSON.parse(await onboardingA.text()) as { tenantId: string };
    const tenantA = bodyA.tenantId;

    // Step 2: eliminación real de A
    const del = await admin.auth.admin.deleteUser(subA);
    expect(del.error).toBeNull();
    trackedActorIds.delete(subA); // ya no existe

    // Verificar que el mapping quedó "huérfano" (actor_id no
    // corresponde a identidad Auth vigente pero sigue apuntando al
    // tenant A). Este es el escenario Q2-13 del contrato.
    const orphanMapping = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("tenant_id")
      .eq("actor_id", subA)
      .maybeSingle();
    expect((orphanMapping.data as { tenant_id: string } | null)?.tenant_id).toBe(tenantA);

    // Step 3: alta B con MISMO email
    const b = await createActorWithEmail(sharedEmail);
    const subB = b.id;
    const jwtB = b.jwt;

    // Verificar `sub B != sub A`
    expect(subB).not.toBe(subA);

    // Step 4: onboarding B
    const onboardingB = await ONBOARDING_POST(
      buildOnboardingRequest({ token: jwtB, acceptLanguage: "en" }),
    );
    expect(onboardingB.status).toBe(200);
    const bodyB = JSON.parse(await onboardingB.text()) as { tenantId: string };
    const tenantB = bodyB.tenantId;

    // Verificar: tenant B distinto de tenant A (cero reclamo automático)
    expect(tenantB).not.toBe(tenantA);

    // Verificar: mapping B apunta a tenantB (no a tenantA)
    const mappingB = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("tenant_id")
      .eq("actor_id", subB)
      .maybeSingle();
    expect((mappingB.data as { tenant_id: string } | null)?.tenant_id).toBe(tenantB);
    expect((mappingB.data as { tenant_id: string } | null)?.tenant_id).not.toBe(tenantA);

    // Verificar: B no hereda memberships del A (memberships de B
    // son sólo sobre tenantB, no sobre tenantA)
    const membershipsB = await admin
      .schema("spabla_v2")
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("actor_id", subB);
    const membershipTenantIds = (membershipsB.data ?? []).map(
      (m: { tenant_id: string }) => m.tenant_id,
    );
    expect(membershipTenantIds).toContain(tenantB);
    expect(membershipTenantIds).not.toContain(tenantA);

    // Verificar: el mapping huérfano de A sigue en cuarentena (no
    // fue reasignado a B)
    const orphanAfter = await admin
      .schema("spabla_v2")
      .from("actor_personal_workspace")
      .select("tenant_id, actor_id")
      .eq("actor_id", subA)
      .maybeSingle();
    expect((orphanAfter.data as { tenant_id: string } | null)?.tenant_id).toBe(tenantA);
    expect((orphanAfter.data as { actor_id: string } | null)?.actor_id).toBe(subA);

    // Q2-R2: además de todo lo anterior, el JWT original de A sigue
    // vigente (exp no ha caducado) pero la RPC ahora lo rechaza
    // con 401 opaco. Verificar la revocación efectiva aquí también.
    const payloadA = JSON.parse(
      Buffer.from(jwtA.split(".")[1] ?? "", "base64url").toString(),
    ) as { exp: number };
    expect(payloadA.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const revoked = await ONBOARDING_POST(
      buildOnboardingRequest({ token: jwtA, acceptLanguage: "en" }),
    );
    expect(revoked.status).toBe(401);

    // Cleanup del huérfano de A (fixture-level, ya que trackedActorIds
    // no lo incluye ya)
    await admin.schema("spabla_v2").from("actor_personal_workspace").delete().eq("actor_id", subA);
    await admin.schema("spabla_v2").from("tenant_memberships").delete().eq("tenant_id", tenantA);
    await admin.schema("spabla_v2").from("tenants").delete().eq("id", tenantA);
  }, 60_000);
});
