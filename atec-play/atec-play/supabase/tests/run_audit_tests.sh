#!/usr/bin/env bash
# 감사 로그(08) 시나리오 테스트 — 로컬 PostgreSQL(psql, createdb)이 필요합니다.
# 사용: PGHOST=... PGPORT=... PGUSER=postgres bash supabase/tests/run_audit_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."     # supabase/
DB=${DB:-audit_test}
psql -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/mock_schema.sql >/dev/null
$P -f tests/existing_policies_mock.sql >/dev/null
$P -c "create function public.guard_users_update() returns trigger language plpgsql security definer set search_path=public as \$\$ begin return new; end \$\$;
       create function public.rls_auto_enable() returns void language plpgsql security definer set search_path=public as \$\$ begin null; end \$\$;" >/dev/null
for f in 02_fix_existing_policies.sql 04_optional_tighten_and_fix.sql 05_dedupe_user_permissions.sql 06_revoke_function_execute.sql; do $P -f $f >/dev/null 2>&1; done
$P -f tests/roles_seed.sql >/dev/null
$P -f 07_roles_separation.sql >/dev/null
$P -f "${SQL08:-08_audit_log.sql}" >/dev/null
psql -q -A -F ' | ' -d $DB -f tests/audit_scenarios.sql | grep -vE '^(td|tn|tnu|)$|^\([0-9]+ rows?\)$'
