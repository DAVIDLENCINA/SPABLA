# SPABLA V2 — Fase 8 — Hito 8.2 — Cierre técnico

**Tipo**: Cierre técnico de hito.
**Estado**: CERRADO Y CONGELADO.
**Fecha**: 2026-08-05.
**Rama oficial**: `spabla-v2/fase-8-persistence-multitenancy`.
**Plan cerrado**: `docs/phases/SPABLA_V2_FASE_8_HITO_8_2_PLAN.md` V1.2 (APROBADO Y CONGELADO — V1.2 (fe de erratas técnica del 2026-07-30)).

## §1. Alcance cerrado

- Baseline reproducible de V1 desde base vacía (`supabase/migrations/20260101000000_v1_baseline.sql`).
- Cadena de migraciones local única y lineal: baseline → legacy → reconciliación V1 → bootstrap V2.
- Schema `spabla_v2` multi-tenant (`tenants`, `tenant_memberships`, `conversations`, `messages`, `usage_ledger`).
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` en las cinco tablas V2.
- Separación de funciones administrativas SECURITY DEFINER (`admin_create_tenant`, `admin_add_membership`, `admin_deactivate_membership`, `admin_append_usage`, `admin_purge_usage_by_tenant`) con `REVOKE EXECUTE FROM PUBLIC/anon/authenticated` + `GRANT EXECUTE TO service_role`.
- `usage_ledger` append-only con idempotencia tenant-scoped estructural `UNIQUE(tenant_id, source, idempotency_key)`.
- CI GitHub Actions con Job A (engine: `tsc --noEmit` + Vitest) y Job B (Supabase local en Docker: `supabase start` + `supabase db reset --local` + suites SQL).
- Pruebas SQL de aislamiento: `supabase/tests/v1_baseline_smoke.test.sql` (estado final exacto de V1 y de la publicación `supabase_realtime`) y `supabase/tests/rls_bootstrap.test.sql` (aislamiento entre dos tenants, membership activa/inactiva, autoelevación denegada, ledger append-only, admin functions restringidas a `service_role`).

## §2. Evidencias

- Commit Hito 8.2: `04e1380bde1b693a72885f0ddc0f3ec59b745108`.
- Bugfix basal PostCSS: `91e69ab9b01959f17f5d0fa2d07f85337c350ed5`.
- Bugfix basal `@types/node`: `b91fd909261b81d3fcb883770c2479b4494f3d2e`.
- Candidato validado en la rama temporal: `c7fbd0c26069e97478eb368ac05afd2775edc194`.
- CI oficial verde: https://github.com/DAVIDLENCINA/SPABLA/actions/runs/30702017703
- Resultado engine: TypeScript exit 0 y 639/639 tests Vitest verdes.
- Resultado Supabase: stack local levantado, cadena completa de migraciones aplicada desde vacío, dos suites SQL verdes.
- Hash de la migración legacy: `e11539ec653a3e862d521d585061d285f59178f59d79f26a68f33ea4f60e47fc`.

## §3. Garantías

- Cero cambio en ADR-008 V1.3.
- Cero cambio en Foundation (`engine/src/types/*`).
- Cero cambio en Fase 7 (adapters/index, conformance, contract, options-viability, resolve-language-support).
- Cero modificación de la migración legacy `supabase/migrations/20260617000000_add_message_source.sql` (hash preservado).
- Cero conexión ni modificación del proyecto Supabase productivo.
- Cero secretos incorporados al repositorio.
- Rama de validación `spabla-v2/hito-8-2-validation` (`c7fbd0c...`) conservada temporalmente como evidencia.

## §4. Límites

- Este cierre no aplica migraciones al remoto productivo.
- No expone `spabla_v2` mediante PostgREST.
- No implementa el adapter productivo (`SupabasePersistence`).
- No autoriza por sí mismo el inicio de Hito 8.3.

## §5. Veredicto

**HITO 8.2 CERRADO — APTO COMO BASE PARA HITO 8.3.**
