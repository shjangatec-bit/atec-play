-- ============================================================
-- 03_fix_rollback.sql  —  02_fix_existing_policies.sql 적용 전 상태(원래 정책)로 되돌립니다.
-- (04_optional_*.sql 을 적용했다면 그것도 함께 되돌립니다.)
-- 주의: 이것은 "보안 취약점이 있던 원래 상태"로 돌아가는 응급용입니다. 원인을 고친 뒤 다시 02 를 적용하세요.
-- ============================================================
begin;

-- 04 선택 적용분 제거 (없으면 무시)
drop policy if exists user_permissions_default_grant      on public.user_permissions;
drop policy if exists user_permissions_club_leader_insert on public.user_permissions;
drop policy if exists user_permissions_club_leader_delete on public.user_permissions;
drop policy if exists user_permissions_chairman_grant     on public.user_permissions;
drop policy if exists clubs_leader_update                 on public.clubs;
drop trigger  if exists trg_guard_clubs_status on public.clubs;
drop function if exists public.guard_clubs_status();
alter policy disb_select on public.club_budget_disbursements using (public.is_approved());

-- 02 적용분 원복
drop trigger  if exists trg_guard_club_members_self_update on public.club_members;
drop function if exists public.guard_club_members_self_update();

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users for insert with check (id = auth.uid());
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists members_insert_self on public.club_members;
create policy members_insert_self on public.club_members for insert with check (user_id = auth.uid());

alter policy members_select on public.club_members to public using (true);
alter policy clubs_select on public.clubs to public;
alter policy permissions_select on public.permissions to public;

alter policy posts_insert on public.posts
  with check (author_id = auth.uid()
              and (public.has_club_perm(club_id, 'CLUB_POST_WRITE') or public.has_club_perm(club_id, 'CLUB_REPORT_WRITE')));

commit;
