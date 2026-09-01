/**
 * SPABLA V2 · Fase 9 · Hito 9.3.2-B-Q2-R3 · OTP fixture registry.
 *
 * Test-only helper (server-side; imports the Node `pg` client and
 * the Supabase JS SDK). Consumed by the OTP integration test files
 * to guarantee that every actor / tenant / mapping / membership /
 * lifecycle row / one-time-token / Mailpit message a test creates
 * gets deleted in `afterAll`, even if an assertion fails.
 *
 * The registry ALWAYS scopes by `runId` — a per-suite random string
 * that gets embedded in every email. The final cleanup pass also
 * calls `admin.listUsers()` and drops anything with a `runId`
 * suffix in its email, which catches ghost users created by
 * `signInWithOtp({shouldCreateUser:true})` for emails that the
 * test never learnt the id of.
 *
 * Never prints emails, tokens or OTP material. `sha12` truncated
 * hashes only.
 */

import { createHash } from "node:crypto";
import { Client as PgClient } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OtpFixtureRegistry = {
  readonly runId: string;
  registerUser(userId: string): void;
  registerTenant(tenantId: string): void;
  emailFor(label: string): string;
  cleanupAll(): Promise<void>;
  snapshotCounts(): Promise<SnapshotCounts>;
  /**
   * Rows in `auth.users` whose email contains `runId`. Zero means the
   * suite has cleaned up its own actors (independent of whatever
   * other suites left in the database).
   */
  countOwnResidualUsers(): Promise<number>;
};

export type SnapshotCounts = {
  readonly users: number;
  readonly identities: number;
  readonly one_time_tokens: number;
  readonly tenants: number;
  readonly mappings: number;
  readonly memberships: number;
  readonly lifecycle: number;
};

export type RegistryDeps = {
  readonly admin: SupabaseClient;
  readonly pgUrl: string;
  readonly inbucketUrl: string;
};

export function createOtpFixtureRegistry(
  runId: string,
  deps: RegistryDeps,
): OtpFixtureRegistry {
  const users = new Set<string>();
  const tenants = new Set<string>();

  const registry: OtpFixtureRegistry = {
    runId,
    registerUser(id) {
      if (id) users.add(id);
    },
    registerTenant(id) {
      if (id) tenants.add(id);
    },
    emailFor(label) {
      // Todos los emails llevan el runId — clave para la limpieza
      // final por listUsers + filtro por sufijo.
      return `otp-fx-${label}-${runId}@spabla.test`;
    },
    async countOwnResidualUsers(): Promise<number> {
      const pg = new PgClient({ connectionString: deps.pgUrl });
      await pg.connect();
      try {
        const r = await pg.query(
          `SELECT count(*)::int AS n FROM auth.users WHERE email LIKE $1`,
          [`%${runId}%`],
        );
        return r.rows[0]?.n ?? 0;
      } finally {
        await pg.end().catch(() => undefined);
      }
    },
    async snapshotCounts(): Promise<SnapshotCounts> {
      const pg = new PgClient({ connectionString: deps.pgUrl });
      await pg.connect();
      try {
        const r = await pg.query(`
          SELECT
            (SELECT count(*) FROM auth.users)::int AS users,
            (SELECT count(*) FROM auth.identities)::int AS identities,
            (SELECT count(*) FROM auth.one_time_tokens)::int AS one_time_tokens,
            (SELECT count(*) FROM spabla_v2.tenants)::int AS tenants,
            (SELECT count(*) FROM spabla_v2.actor_personal_workspace)::int AS mappings,
            (SELECT count(*) FROM spabla_v2.tenant_memberships)::int AS memberships,
            (SELECT count(*) FROM spabla_v2.actor_lifecycle_state)::int AS lifecycle
        `);
        return r.rows[0] as SnapshotCounts;
      } finally {
        await pg.end().catch(() => undefined);
      }
    },
    async cleanupAll() {
      // 1. Descubrimiento SQL directo (no HTTP): buscar en
      // `auth.users` cualquier email que contenga `runId`. Evita
      // lag/perPage del `admin.listUsers` HTTP en CI.
      const pg = new PgClient({ connectionString: deps.pgUrl });
      await pg.connect();
      try {
        const discovered = await pg.query(
          `SELECT id FROM auth.users WHERE email LIKE $1`,
          [`%${runId}%`],
        );
        for (const row of discovered.rows) {
          if (row.id) users.add(row.id as string);
        }
      } catch {
        /* ignore — el segundo pg abre su propia conexión */
      } finally {
        await pg.end().catch(() => undefined);
      }

      // 2. Limpieza SQL cascada (respetando FKs).
      const pg2 = new PgClient({ connectionString: deps.pgUrl });
      await pg2.connect();
      try {
        if (users.size > 0) {
          const ids = Array.from(users);
          await pg2.query(
            `DELETE FROM spabla_v2.actor_lifecycle_state WHERE actor_id = ANY($1::uuid[])`,
            [ids],
          );
          await pg2.query(
            `DELETE FROM spabla_v2.tenant_memberships WHERE actor_id = ANY($1::uuid[])`,
            [ids],
          );
          await pg2.query(
            `DELETE FROM spabla_v2.actor_personal_workspace WHERE actor_id = ANY($1::uuid[])`,
            [ids],
          );
        }
        if (tenants.size > 0) {
          const ids = Array.from(tenants);
          await pg2.query(
            `DELETE FROM spabla_v2.tenant_memberships WHERE tenant_id = ANY($1::uuid[])`,
            [ids],
          );
          await pg2.query(
            `DELETE FROM spabla_v2.tenants WHERE id = ANY($1::uuid[])`,
            [ids],
          );
        }
        // Barrido residual: cualquier tenant cuyo propio ID sea el
        // personal workspace de los actores del registro (por si
        // el test creó un tenant sin registrarlo).
        if (users.size > 0) {
          const ids = Array.from(users);
          await pg2.query(
            `DELETE FROM spabla_v2.tenant_memberships
              WHERE tenant_id IN (
                SELECT tenant_id FROM spabla_v2.actor_personal_workspace
                 WHERE actor_id = ANY($1::uuid[])
              )`,
            [ids],
          );
          await pg2.query(
            `DELETE FROM spabla_v2.tenants
              WHERE id IN (
                SELECT tenant_id FROM spabla_v2.actor_personal_workspace
                 WHERE actor_id = ANY($1::uuid[])
              )`,
            [ids],
          );
          await pg2.query(
            `DELETE FROM spabla_v2.actor_personal_workspace WHERE actor_id = ANY($1::uuid[])`,
            [ids],
          );
        }
        // 3. Limpieza de one_time_tokens vinculados a los usuarios
        // del registro (los cascadea el DELETE de auth.users, pero
        // se barre explícitamente antes por seguridad).
        if (users.size > 0) {
          await pg2.query(
            `DELETE FROM auth.one_time_tokens WHERE user_id = ANY($1::uuid[])`,
            [Array.from(users)],
          );
          // 4. DELETE SQL directo sobre auth.users (cascade a
          // auth.identities). Sustituye el admin.deleteUser HTTP
          // que introducía race en CI.
          await pg2.query(
            `DELETE FROM auth.identities WHERE user_id = ANY($1::uuid[])`,
            [Array.from(users)],
          );
          await pg2.query(
            `DELETE FROM auth.users WHERE id = ANY($1::uuid[])`,
            [Array.from(users)],
          );
        }
      } finally {
        await pg2.end().catch(() => undefined);
      }

      // 5. Mailpit — vaciar mensajes de correos con este runId.
      try {
        const searchUrl = `${deps.inbucketUrl}/api/v1/search?query=${encodeURIComponent(runId)}`;
        const res = await fetch(searchUrl);
        if (res.ok) {
          const body = (await res.json()) as { messages?: Array<{ ID: string }> };
          for (const m of body.messages ?? []) {
            await fetch(`${deps.inbucketUrl}/api/v1/message/${m.ID}`, {
              method: "DELETE",
            }).catch(() => undefined);
          }
        }
      } catch {
        /* silent */
      }
    },
  };
  return registry;
}

/** Truncated hash for evidence — never emits the plaintext. */
export function sha12(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}
