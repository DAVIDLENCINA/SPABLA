# Auditoría global — Fase 8 (persistencia y multi-tenancy)

**Fecha**: 2026-08-11.
**Rama auditada**: `spabla-v2/hito-8-5-cierre-fase-8`.
**SHA auditado**: `78c6f2728d84fec70c2830538f4fad28b73fab25`.
**Rama oficial destino**: `spabla-v2/fase-8-persistence-multitenancy` @ `1ee6cde64e1a948210b1c2d7b2a85b92caf102b8` (previo).
**Fuentes normativas**: ADR-008 V1.3 · Plan Fase 8 V1.3 · Plan Hito 8.2 V1.3 · Contratos Hito 8.1 (`engine/src/adapters/persistence/{port,identity,tenant-context,errors,conformance}.ts`) · Release Standard §2, §5 · Code Standard.

## 1. Hitos 8.1–8.4 completos

| Hito | Alcance | SHA oficial | CI |
|------|---------|-------------|----|
| 8.1 | `PersistencePort`, `VerifiedIdentity`, `TenantContext`, `PersistenceError` | `639c159` | verde |
| 8.2 | Baseline V1 sintética, reconciliación V1 (voice policy), bootstrap V2 (`spabla_v2`), tests SQL, CI Job A+B | `04e1380` | verde (`30702017703`) |
| 8.3 | `SupabasePersistence` con las 5 operaciones, tests de integración TS, Node 24 baseline | `94b8a6f` | verde (`31032509154`) |
| 8.4 | `UsageEmitter` + reconciliación semántica `admin_append_usage` (identidad idéntica vs divergente) | `1ee6cde` | verde (`31487386949`) |

## 2. Contrato `PersistencePort` (Hito 8.1)

- Cinco operaciones intactas: `saveConversation`, `loadConversation`, `saveMessage`, `listMessages`, `appendUsage`.
- Códigos cerrados `PersistenceErrorCode`: `identity_invalid`, `tenant_context_invalid`, `membership_denied`, `not_found`, `conflict`, `constraint_violation`, `unavailable`, `unauthorized`.
- `MessageCursor` brand-protected, orden total `(createdAt, messageId)`.
- Cero re-export desde `engine/src/index.ts` ni `engine/src/adapters/index.ts` (verificado por grep).

## 3. `TenantContext` e `IdentityProvider`

- `buildTenantContext(identity, tenantId)` brand phantom; cero forge externo.
- `VerifiedIdentitySource` cerrada: `supabase_auth_jwt | backend_admin_service_role | test_fixture`.
- `SupabasePersistence.assertIdentity` invoca `authenticated.auth.getUser()` **en cada operación pública**; cero caché persistente (revisión estática); `identity_invalid` cuando `auth.uid()` diverge del `TenantContext.identity.actorId`.

## 4. `SupabasePersistence`

- Constructor con capacidades explícitas (`authenticated`, `privileged`).
- `appendUsage` es la ÚNICA vía de escritura sobre `usage_ledger` a través de `admin_append_usage` (SECURITY DEFINER, `service_role`). Sin `privileged` → `unauthorized` sin escritura.
- `listMessages`: `limit ∈ (0, 500]` → `constraint_violation` en violación; cursor validado runtime (regex ISO-8601 + UUID) antes de interpolar en `.or(...)` de PostgREST; cursor de otra conversación → `not_found`.
- `translateAuthTransportOrIdentity`: 5xx / DNS / timeout → `unavailable retryable:true`; JWT malformado / sin sesión → `identity_invalid retryable:false`. Mensajes opacos.
- `translatePostgrestError`: SQLSTATE 23505 → `conflict`, 23503/23514 → `constraint_violation`, PGRST116 → `not_found`, transient → `unavailable retryable:true`.

## 5. `UsageEmitter`

- Capa delgada; recibe `PersistencePort` inyectado.
- `emit()` valida estructuralmente antes de tocar el port: `idempotencyKey`/`correlationId` UUID estricto; `source`/`unit` no vacíos; `quantity` finito; `quantity ≥ 0` para `entryKind = "normal"`.
- `emitFromMessage()` deriva `text_chars` de `text.length` (patrón §11.3 emisor validador).
- Test estructural: cero `service_role`, `SERVICE_ROLE`, `NEXT_PUBLIC`, `@supabase/supabase-js`, `createClient`, `process.env` en el fuente.

## 6. Idempotencia corregida (Hito 8.4 fix)

Migración `20260811120000_reconcile_usage_conflict_detection.sql` — forward-only:
- `INSERT ... ON CONFLICT (tenant_id, source, idempotency_key) DO NOTHING RETURNING id`.
- Si conflict: `SELECT` la fila superviviente, compara campos normativos (`actor_id, metric_kind, quantity, unit, correlation_id, entry_kind`; `occurred_at` sólo si el caller pasa valor). Divergencia → `RAISE ... USING ERRCODE = '23505'` con mensaje opaco.
- Adapter mapea `23505` → `PersistenceError({code:"conflict", retryable:false})`.
- Cubierto por 2 tests dedicados (secuencial + concurrente).

## 7. Multi-tenancy

- 5 tablas `spabla_v2.*` con `tenant_id UUID NOT NULL` obligatorio.
- FK compuesta `messages(tenant_id, conversation_id) → conversations(tenant_id, id)` — impide cross-tenant referencias estructuralmente.
- `tenants` como identidad canónica; `tenant_memberships` con `is_active` como gate.
- Aislamiento verificado por 26 tests SQL (Job B) + 21 tests TS emitter + 26 tests TS adapter.

## 8. RLS + FORCE RLS

Verificación mecánica (fuente + artefacto de restore drill):
- `spabla_v2.tenants`, `tenant_memberships`, `conversations`, `messages`, `usage_ledger`: `rowsecurity = t` **y** `forcerowsecurity = t`.
- V1 `public.*` (6 tablas): `rowsecurity = t`, `forcerowsecurity = f` (fidelidad V1, sin regresión).
- 7 policies sobre `spabla_v2.*` (contadas por artefacto). Patrones §7.1 / §7.1bis / §7.1ter respetados.

## 9. Grants, revokes y ownership

Matriz ACL verificada mecánicamente sobre la BD RESTAURADA (artefacto de Job C):

| Función | `service_role` | `anon` | `authenticated` |
|---|---|---|---|
| `admin_append_usage(...)` | ✅ t | ❌ f | ❌ f |
| `admin_purge_usage_by_tenant(uuid,text)` | ✅ t | ❌ f | ❌ f |
| `admin_create_tenant(text)` | ✅ t | ❌ f | ❌ f |
| `admin_add_membership(uuid,uuid,text)` | ✅ t | ❌ f | ❌ f |
| `admin_deactivate_membership(uuid,uuid)` | ✅ t | ❌ f | ❌ f |

Ownership: `5 de 5` admin functions owned by `postgres`.

Grants tabla-nivel: `authenticated` sólo SELECT sobre `spabla_v2.*` (INSERT autorizado en `conversations`, `messages`); cero grant a `anon` sobre schema/tables/functions de `spabla_v2` (verificado por grep sobre `20260730160000_phase8_bootstrap.sql`).

## 10. Migraciones forward-only

Cadena completa (SHA-256):

| Timestamp | Archivo | SHA-256 |
|---|---|---|
| `20260101000000` | `_v1_baseline.sql` | `7f4eb833ec37608aa74a596df28d7c835c576c5ca0c999a9d8fc045d3c5607dc` |
| `20260617000000` | `_add_message_source.sql` (legacy intangible) | `e11539ec653a3e862d521d585061d285f59178f59d79f26a68f33ea4f60e47fc` |
| `20260617000100` | `_reconcile_v1_voice_policy.sql` | `b341e0ba1701c2f1a74695d337625812dea0979164e4da0aac21a728d7664466` |
| `20260730160000` | `_phase8_bootstrap.sql` | `fbaed75d9d52500233a6363d9abe61feb828b927187f2163a02b8391b793d58b` |
| `20260811120000` | `_reconcile_usage_conflict_detection.sql` | `51e9d7dd573d8e2ea2e83179d156adfdadb367f84f271bd0d73515aa052e8e03` |

Cero reescritura de migraciones anteriores. Legacy hash byte-idéntico al inventario del 2026-07-29.

## 11. Cadena desde base vacía

`supabase db reset --local` aplica los 5 archivos en orden lexicográfico sin error (verificado por Job B y Job C). Restauración ensayada replica la estructura en DB independiente `restored_target` en el mismo cluster.

## 12. Restauración real ensayada

Job C `phase-8 restore drill` (run `31490909356`):
- Levanta stack Supabase local con Docker.
- Aplica migraciones desde vacío al source `postgres`.
- Genera schema-only dump (`pg_dump --schema-only --no-owner`) — 102 096 bytes, sha256 `ba25c002c6bebfedf28f7e83299e3bfa5ccff5a71a01f240480a7ad8394ff1b0`.
- Crea `restored_target` (TEMPLATE template0) en el mismo cluster.
- Sanea el dump (líneas `ALTER DEFAULT PRIVILEGES FOR ROLE` / `SET SESSION AUTHORIZATION` a comentario) por ser privilegios cross-role no relevantes al esquema multi-tenant.
- Restaura y verifica estructura, RLS, ACL y ownership en el TARGET.
- Ejecuta `rls_bootstrap.test.sql` + `purge_ledger.test.sql` en el target con fixtures sintéticos.
- `require_target` (guardas `current_database() = 'restored_target'`) impide auditar la source por confusión.
- Source integridad post-drill: `tenants before = tenants after = 0`, `ledger before = ledger after = 0` — cero mutación cruzada.

## 13. Ausencia de secretos

- Grep sobre commits Fase 8: cero `wztkxtgmuaegonlkukeh`, `--linked`, `db push`, `migration repair`, `config push`, `NEXT_PUBLIC_SERVICE_ROLE`, `service_role_key`, `anon_key`, tokens (`ghp_`, `sk_live`, `xoxb-`, `sbp_`).
- Workflow enmascara `ANON` y `SERVICE` con `::add-mask::` antes de escribir a `$GITHUB_ENV`.
- Artefacto del drill contiene sólo metadata pública (versiones, hashes, contadores estructurales). Cero token, JWT, URL productiva, correo o UUID productivo.

## 14. Cero conexión productiva

Cero comando `supabase` con `--linked` en el repo. Cero llamada a `wztkxtgmuaegonlkukeh`. CI opera exclusivamente contra stack local Docker.

## 15. Superficie pública

`engine/src/index.ts` sin cambios respecto a `234f12e` (base Fase 7):
```
$ git diff 234f12e..HEAD -- engine/src/index.ts
(vacío)
```
`engine/src/adapters/index.ts` sin cambios respecto a la base Fase 7. Cero re-export de `persistence/*` desde barrels públicos.

## 16. Foundation intacta

`git diff 234f12e..HEAD -- engine/src/types/` = vacío.

## 17. Fase 7 intacta

`git diff 234f12e..HEAD -- engine/src/adapters/{index.ts,resolve-language-support*,conformance*,contract*,options-viability*,CONTRACT.md}` = vacío.

## 18. ADR-008 intacta

`git diff 234f12e..HEAD -- docs/decisions/ADR-008-STORAGE-AND-MULTI-TENANCY.md` = vacío.

## 19. Tests basales preservados

Basal Fase 7: 580 tests. Basal Hito 8.1: 639 tests. Basal Fase 8 (Job A actual): **639 tests + 47 skipped (integration)** = 686 en 27 test files. Cero regresión.

## 20. Riesgos residuales

- **R1 — Reconciliación remota productiva** diferida hasta autorización expresa separada; requiere plan operativo, backup verificado y ejecución humana controlada.
- **R2 — Rate limits / observabilidad tenant-aware** son ADR-008 §15 asignados: Fase 9+.
- **R3 — Node 20 EOL**: mitigado adoptando Node 24 LTS en toda la Fase 8 (§9.7 Plan Fase 8 V1.3 §12 Plan Hito 8.2 V1.3, workflow).
- **R4 — Cambios en Postgres / Supabase CLI**: contrato pinneado (CLI 2.110.0; `@supabase/supabase-js@^2.106.2` lockfile 2.106.2; `@types/node@^24.13.3`). Ampliación futura requiere fe de erratas técnica.

## Veredicto

**APTO PARA CIERRE.**
