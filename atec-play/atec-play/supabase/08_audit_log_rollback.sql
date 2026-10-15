-- 08 되돌리기: 트리거·함수를 제거합니다.
-- 기록 테이블(audit_log)은 이미 쌓인 기록을 보존하기 위해 남겨 둡니다.
-- (기록까지 지우려면 맨 아래 주석을 풀어 따로 실행하세요)
begin;

drop trigger if exists trg_audit_member_role     on public.club_members;
drop trigger if exists trg_audit_user_permission on public.user_permissions;
drop trigger if exists trg_audit_user_status     on public.users;
drop trigger if exists trg_audit_support_rate    on public.club_support_rates;
drop trigger if exists trg_audit_disbursement    on public.club_budget_disbursements;
drop trigger if exists trg_audit_lifecycle       on public.club_lifecycle_requests;

drop function if exists public.trg_audit_member_role();
drop function if exists public.trg_audit_user_permission();
drop function if exists public.trg_audit_user_status();
drop function if exists public.trg_audit_support_rate();
drop function if exists public.trg_audit_disbursement();
drop function if exists public.trg_audit_lifecycle();
drop function if exists public.audit_write(uuid, text, text, text, text, jsonb, text);
drop function if exists public.audit_insert(uuid, text, text, text, text, jsonb, text);
drop function if exists public.audit_ctx();
drop function if exists public.audit_user_label(uuid);
drop function if exists public.audit_club_label(uuid);

notify pgrst, 'reload schema';
commit;

-- 기록까지 완전히 삭제하려면(되돌릴 수 없음):
-- drop trigger trg_audit_log_immutable on public.audit_log;
-- drop trigger trg_audit_log_no_truncate on public.audit_log;
-- drop table public.audit_log;
-- drop function public.audit_log_immutable();
