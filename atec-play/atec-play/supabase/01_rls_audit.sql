-- ============================================================
-- 01_rls_audit.sql  —  현재 DB 보안 상태 점검 (읽기 전용, 데이터를 바꾸지 않습니다)
-- 사용법: Supabase 대시보드 → SQL Editor 에 붙여넣고 아래 쿼리를 하나씩 실행하세요.
--         결과를 그대로 공유해 주시면 정책 초안(02번)을 실제 상태에 맞게 다듬을 수 있습니다.
-- ============================================================

-- [A] 테이블별 RLS 켜짐 여부 — rls_enabled 가 false 인 표는 누구나(로그인만 하면) 전부 읽고 쓸 수 있습니다.
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- [B] 현재 적용된 정책 전체 — qual/with_check 가 'true' 이면 사실상 제한이 없는 정책입니다.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- [C] 위험 신호: 조건이 true 이거나 비어 있는 정책
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual in ('true', '(true)') or with_check in ('true', '(true)'))
order by tablename;

-- [D] 컬럼 타입 확인 — 02번 초안은 id 계열이 uuid 라고 가정하지 않고 text 로 비교하지만,
--     실제 타입을 알면 더 빠른 정책으로 바꿀 수 있습니다.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name in ('id', 'club_id', 'company_id', 'user_id', 'post_id', 'author_id', 'requester_id')
order by table_name, column_name;

-- [E] 시연용 계정이 남아 있는지 (README 의 공개 비밀번호 Demo1234! 사용 계정일 수 있음)
select u.id, u.email, u.name, u.status
from public.users u
order by u.email;

-- [F] 통합관리자(전사 권한 보유자) 목록 — 의도한 사람만 있는지 확인하세요.
select u.name, u.email, up.permission_code
from public.user_permissions up
join public.users u on u.id = up.user_id
where up.club_id is null and up.company_id is null
  and up.permission_code in ('ACC_APPROVE', 'ACC_MANAGE', 'PERM_MANAGE', 'CLUB_CREATE_APPROVE', 'CLUB_CLOSE_APPROVE')
order by u.name, up.permission_code;

-- [G] 스토리지 버킷 공개 여부 — club-files 의 public 이 true 이면 주소만 알면 누구나 열람합니다.
select id, name, public from storage.buckets;

-- [H] 스토리지 정책
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;
