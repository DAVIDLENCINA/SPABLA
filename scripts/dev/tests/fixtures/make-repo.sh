#!/usr/bin/env bash
# Helper: create a minimal fake SPABLA repo root under $1.
# Emits absolute path on stdout.
set -eu -o pipefail
root="$1"
mkdir -p "$root/scripts/ci" "$root/supabase" "$root/.github/workflows"
touch "$root/package.json" "$root/package-lock.json"
cat >"$root/supabase/config.toml" <<'EOF'
project_id = "spabla-hito-8-2-local"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public", "spabla_v2"]

[db]
port = 54322
major_version = 17
EOF
cat >"$root/scripts/ci/apply-migrations.sh" <<'EOF'
#!/usr/bin/env bash
set -eu
echo "stub"
EOF
chmod +x "$root/scripts/ci/apply-migrations.sh"
printf '%s' "$root"
