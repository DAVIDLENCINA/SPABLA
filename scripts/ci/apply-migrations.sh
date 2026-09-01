#!/usr/bin/env bash
# SPABLA V2 · Fase 8 · Hito 8.2 — apply migrations to LOCAL Supabase.
#
# Rebuilds the local Supabase database from empty, applying the full
# canonical chain of migrations under `supabase/migrations/`. Zero remote
# connection: only touches the local stack started by `supabase start`.
#
# Governance: Plan Hito 8.2 V1.2 §12.

set -euo pipefail

# Resolve repo root from the script location so the script can be invoked from
# anywhere. Uses only POSIX-portable primitives (`dirname`, `cd`, `pwd`).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

echo "[apply-migrations] repo root: ${REPO_ROOT}"
echo "[apply-migrations] supabase --version:"
supabase --version

echo "[apply-migrations] migration chain (lexicographic order):"
ls -1 supabase/migrations/

echo "[apply-migrations] resetting local database (drops + re-applies chain)"
supabase db reset --local
