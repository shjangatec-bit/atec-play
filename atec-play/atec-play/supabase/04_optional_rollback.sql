-- ============================================================
-- 04_optional_rollback.sql  —  04_optional_tighten_and_fix.sql "만" 되돌립니다.
-- (02 의 보안 수정은 그대로 유지됩니다. 02 까지 되돌리려면 03_fix_rollback.sql 을 사용하세요.)
-- ============================================================
begin;

drop policy if exists user_permissions_default_grant      on public.user_permissions;
drop policy if exists user_permissions_club_leader_insert on public.user_permissions;
drop policy if exists user_permissions_club_leader_delete on public.user_permissions;
drop policy if exists user_permissions_chairman_grant     on public.user_permissions;
drop policy if exists clubs_leader_update                 on public.clubs;
drop trigger  if exists trg_guard_clubs_status on public.clubs;
drop function if exists public.guard_clubs_status();

-- 지원금 지급내역 조회 범위를 원래대로(승인 회원 전원)
alter policy disb_select on public.club_budget_disbursements using (public.is_approved());

commit;
