#!/usr/bin/env bash
# 직책/권한 분리(07) 시나리오 테스트 — 로컬 PostgreSQL(psql, createdb)이 필요합니다.
# 사용: PGHOST=... PGPORT=... PGUSER=postgres bash supabase/tests/run_roles_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."     # supabase/
DB=${DB:-roles_test}
psql -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/mock_schema.sql >/dev/null
$P -f tests/existing_policies_mock.sql >/dev/null
# 실제 DB 에 있는 트리거용 함수(정의는 모르므로 더미)
$P -c "create function public.guard_users_update() returns trigger language plpgsql security definer set search_path=public as \$\$ begin return new; end \$\$;
       create function public.rls_auto_enable() returns void language plpgsql security definer set search_path=public as \$\$ begin null; end \$\$;" >/dev/null
for f in 02_fix_existing_policies.sql 04_optional_tighten_and_fix.sql 05_dedupe_user_permissions.sql 06_revoke_function_execute.sql; do $P -f $f >/dev/null 2>&1; done
$P -f tests/roles_seed.sql >/dev/null          # 07 적용 전 기존 데이터(일부러 어긋나게)
$P -f "${SQL07:-07_roles_separation.sql}" >/dev/null
psql -q -A -F ' | ' -d $DB -f tests/roles_scenarios.sql | grep -vE '^(td|tn|tnu)$|^\([0-9]+ rows?\)$|^$'
