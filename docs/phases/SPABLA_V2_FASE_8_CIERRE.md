# SPABLA V2 — Fase 8 — Cierre técnico

**Tipo**: Cierre de fase.
**Estado**: CERRADO Y CONGELADO.
**Fecha**: 2026-08-11.
**Rama oficial**: `spabla-v2/fase-8-persistence-multitenancy`.
**Plan cerrado**: `docs/phases/SPABLA_V2_FASE_8_PLAN.md` V1.3.
**ADR base**: `docs/decisions/ADR-008-STORAGE-AND-MULTI-TENANCY.md` V1.3.
**Auditoría**: `docs/audit_reports/AUDIT_2026-08-11_phase-8-persistence-multitenancy.md`.

## §1. Alcance Hitos 8.1–8.5

- **Hito 8.1** — `PersistencePort` congelado; `VerifiedIdentity`, `TenantContext`, `PersistenceError` con brand phantom; conformance in-memory.
- **Hito 8.2** — Baseline V1 sintética; reconciliación V1 (voice policy); bootstrap V2 (`spabla_v2.tenants|tenant_memberships|conversations|messages|usage_ledger`); RLS + FORCE RLS + policies; 5 admin functions SECURITY DEFINER; publicación `supabase_realtime` determinista (§5 V1.2 erratum `SET TABLE`); CI Job A engine + Job B integración SQL.
- **Hito 8.3** — `SupabasePersistence` productivo con las 5 operaciones bajo RLS + capacidad privilegiada inyectada para `appendUsage`; validación runtime del cursor; distinción `unavailable retryable:true` vs `identity_invalid retryable:false`; 26 tests de integración TS contra Supabase local.
- **Hito 8.4** — `UsageEmitter` como emisor validador del harness; migración correctiva `20260811120000` que hace `admin_append_usage` semánticamente idempotente (retry idéntico → silencio; retry divergente → `conflict retryable:false`) mediante `INSERT ... ON CONFLICT DO NOTHING RETURNING` + comparación atómica de campos normativos.
- **Hito 8.5** — Test SQL dedicado de `admin_purge_usage_by_tenant`; Job C `phase-8 restore drill` que dumpea, restaura en base independiente y ejecuta suites de aislamiento + purga sobre el destino; artefacto verificable; auditoría global APTA.

## §2. Rama y SHAs relevantes

- Rama oficial: `spabla-v2/fase-8-persistence-multitenancy`.
- SHA base pre-Fase 8 (base Fase 7): `234f12e78172245958a9cf81c96a98cbcdb8fdb3`.
- SHA de cierre (a promocionar tras este documento): SHA del commit `docs(phase): close Fase 8 persistence and multi-tenancy` sobre la rama oficial.
- Commits oficiales por hito: 8.1 `639c159` · 8.2 `04e1380` · 8.3 `94b8a6f` · 8.4 `1dcada6` · 8.4 fix `1ee6cde`.
- Rama de validación de este cierre: `spabla-v2/hito-8-5-cierre-fase-8`.

## §3. CI

- Hito 8.2 oficial: https://github.com/DAVIDLENCINA/SPABLA/actions/runs/30702017703 (Job A 639 + Job B SQL).
- Hito 8.3 oficial: https://github.com/DAVIDLENCINA/SPABLA/actions/runs/31032509154 (Job A + Job B 26/26 integration).
- Hito 8.4 oficial: https://github.com/DAVIDLENCINA/SPABLA/actions/runs/31486078436.
- Hito 8.4 fix oficial: https://github.com/DAVIDLENCINA/SPABLA/actions/runs/31487386949.
- Hito 8.5 candidato con Job C: https://github.com/DAVIDLENCINA/SPABLA/actions/runs/31490909356 (Job A + Job B 47/47 + Job C restore drill).

## §4. Artefacto de restauración

Artefacto de GitHub Actions: `phase-8-restore-drill` (run `31490909356`, retention 30 días).

Resumen textual capturado en el artefacto:
- PostgreSQL server 17.6 · psql/pg_dump 17.10 · Supabase CLI 2.110.0 · Node 24.
- Source DB `postgres`, target DB `restored_target` (mismo cluster, `TEMPLATE template0`).
- Dump: 102 096 bytes, SHA-256 `ba25c002c6bebfedf28f7e83299e3bfa5ccff5a71a01f240480a7ad8394ff1b0`.
- Target post-restore: 5 tablas `spabla_v2.*` (esperado 5), 6 tablas V1 `public.*`, 7 policies en `spabla_v2`, `ENABLE + FORCE RLS` en 5/5, 5/5 admin functions con owner `postgres`.
- Matriz ACL sobre las 5 admin functions: `service_role=true`, `anon=false`, `authenticated=false` para las 5 · 3 = 15 comprobaciones.
- Drills funcionales en target: `rls_bootstrap.test.sql` OK · `purge_ledger.test.sql` OK.
- Source integridad: 0 → 0 tenants, 0 → 0 ledger (cero mutación cruzada).
- Verdict: PASS.

## §5. Hashes de migraciones

| Timestamp | Archivo | SHA-256 |
|---|---|---|
| `20260101000000` | `_v1_baseline.sql` | `7f4eb833ec37608aa74a596df28d7c835c576c5ca0c999a9d8fc045d3c5607dc` |
| `20260617000000` | `_add_message_source.sql` | `e11539ec653a3e862d521d585061d285f59178f59d79f26a68f33ea4f60e47fc` |
| `20260617000100` | `_reconcile_v1_voice_policy.sql` | `b341e0ba1701c2f1a74695d337625812dea0979164e4da0aac21a728d7664466` |
| `20260730160000` | `_phase8_bootstrap.sql` | `fbaed75d9d52500233a6363d9abe61feb828b927187f2163a02b8391b793d58b` |
| `20260811120000` | `_reconcile_usage_conflict_detection.sql` | `51e9d7dd573d8e2ea2e83179d156adfdadb367f84f271bd0d73515aa052e8e03` |

Cero reescritura de migraciones aplicadas. Legacy hash intacto.

## §6. Versiones

- Node.js: **24** (LTS activo).
- Supabase CLI: **2.110.0** (pinneado en `.github/workflows/ci.yml` mediante `supabase/setup-cli@v1`).
- `@supabase/supabase-js`: `^2.106.2` (`engine/package-lock.json` fija `2.106.2`).
- `@types/node`: `^24.13.3` (lockfile).
- PostgreSQL: 17.6 (source, Supabase image); psql/pg_dump 17.10 (Ubuntu 24.04 runner).

## §7. Resultados de tests

- Job A (engine): **639 passed | 47 skipped (686)** en 27 files (26 passed + 1 skipped adapter integration + 1 skipped emitter integration por falta de env vars locales).
- Job B (integration): 3 suites SQL (`v1_baseline_smoke`, `rls_bootstrap`, `purge_ledger`) OK + **47/47 tests TS integration** (26 adapter + 21 emitter), cero skipped.
- Job C (restore drill): VERDICT PASS. Artefacto textual disponible.

## §8. Resultados ACL

Reproducido íntegramente en §9 del informe de auditoría. Sobre BD RESTAURADA (target `restored_target`), las 5 admin functions verifican `has_function_privilege` cierrada `service_role=true, anon=false, authenticated=false`. Ownership 5/5 `postgres`.

## §9. Resultados RLS y aislamiento

- `spabla_v2.tenants|tenant_memberships|conversations|messages|usage_ledger`: `rowsecurity = t` **y** `forcerowsecurity = t` (5/5).
- V1 `public.*` (6 tablas): `rowsecurity = t`, `forcerowsecurity = f` (fidelidad V1).
- Aislamiento verificado por 26 tests SQL (Job B) + 21 tests TS emitter + 26 tests TS adapter, todos verdes en CI oficial y en target restaurado.

## §10. Idempotencia

- `admin_append_usage` reconciliado (§4 Hito 8.4): retry idéntico → éxito silencioso; retry divergente → `PersistenceError({code:"conflict", retryable:false})`; concurrencia atómica vía `INSERT ... ON CONFLICT DO NOTHING RETURNING`.
- 2 tests dedicados en `usage-emitter.integration.test.ts`: conflicting sequential + concurrent divergent (`Promise.allSettled`).

## §11. Purga

- `admin_purge_usage_by_tenant` cubierto por `supabase/tests/purge_ledger.test.sql` (9 comprobaciones): scope al tenant objetivo, aislamiento del sibling, denegación a `anon`/`authenticated`, tenant desconocido → 0 removed, RLS/FORCE preservados, no toca tablas hermanas.
- Verificado también en target restaurado (Job C).

## §12. Foundation, Fase 7, ADR-008 intactas

- `git diff 234f12e..HEAD -- engine/src/types/` → vacío.
- `git diff 234f12e..HEAD -- engine/src/adapters/{index.ts,resolve-language-support*,conformance*,contract*,options-viability*,CONTRACT.md}` → vacío.
- `git diff 234f12e..HEAD -- engine/src/index.ts` → vacío.
- `git diff 234f12e..HEAD -- docs/decisions/ADR-008-STORAGE-AND-MULTI-TENANCY.md` → vacío.

## §13. Cero migración destructiva

Cadena de 5 archivos, forward-only. La corrección Hito 8.4 se hizo por nueva migración `20260811120000` con `CREATE OR REPLACE FUNCTION`; cero DROP, cero rename destructivo, cero pérdida de datos. Legacy `20260617000000` byte-idéntico al inventario del 2026-07-29.

## §14. Cero secretos

Grep sobre todo el commit: cero `wztkxtgmuaegonlkukeh`, `--linked`, `db push`, `migration repair`, `config push`, `NEXT_PUBLIC_SERVICE_ROLE`, `service_role_key`, `anon_key`, `ghp_`, `sk_live`, `sbp_`, `xoxb-`. Workflow enmascara `ANON`/`SERVICE` con `::add-mask::` antes de `>> $GITHUB_ENV`. Artefacto Job C sin secretos ni PII.

## §15. Cero conexión productiva

Cero llamada al proyecto `wztkxtgmuaegonlkukeh`. Todo CI opera contra stack local Docker del runner. Reconciliación remota **fuera de alcance** hasta autorización operativa expresa separada.

## §16. Riesgos residuales

Reproducidos del informe de auditoría §20:
- Reconciliación remota productiva diferida.
- Rate limits / observabilidad tenant-aware → Fase 9+.
- Node 20 EOL mitigado con adopción explícita de Node 24 LTS.
- Cambios en Postgres / Supabase CLI: pinneado a versiones exactas; ampliación requerirá fe de erratas técnica.

## §17. Reconciliación productiva

**Expresamente fuera de alcance del cierre de Fase 8.** Ninguna migración aplicada al remoto productivo. Cualquier `supabase db push`, `migration repair` o exposición de `spabla_v2` mediante PostgREST del proyecto productivo requerirá autorización expresa separada, plan operativo, backup verificado y ejecución humana controlada.

## §18. Veredicto

**FASE 8 CERRADA — APTA PARA FASE 9.**
