-- ============================================================
-- 07_roles_separation_rollback.sql  —  07 적용 전 구조로 되돌립니다.
--
--  · 직책 변경 규칙(트리거)·자동 권한 동기화·직책 변경 함수를 제거하고, 04 의 수동 권한 정책을 복구합니다.
--  · 회장 교체 이력(club_chair_history)은 기록 보존을 위해 삭제하지 않습니다.
--    완전히 지우려면 맨 아래 주석의 drop table 을 실행하세요.
--  · is_staff 컬럼은 직책에서 계산되는 값이라 삭제해도 데이터가 사라지지 않습니다.
--  · 07 로 이미 자동 부여·회수된 동호회 권한은 되돌리지 않습니다. (직책과 일치하는 상태로 남음)
--  ※ 앱 코드(PR)를 먼저 이전 버전으로 되돌린 뒤 실행하세요. 새 앱은 is_staff 와 아래 함수들을 사용합니다.
-- ============================================================
begin;

drop trigger if exists trg_guard_club_member_roles     on public.club_members;
drop trigger if exists trg_sync_club_member_permissions on public.club_members;

drop function if exists public.revoke_orphan_permissions(uuid, uuid);
drop function if exists public.resync_member_permissions(uuid);
drop function if exists public.club_role_audit();
drop function if exists public.change_club_chair(uuid, uuid, text, text);
drop function if exists public.set_member_role(uuid, text);
drop function if exists public.guard_club_member_roles();
drop function if exists public.trg_sync_club_member_permissions();
drop function if exists public.sync_member_club_permissions(uuid, uuid);
drop function if exists public.club_perm_codes(boolean);

alter table public.club_members drop column if exists is_staff;

-- 04 의 수동 권한 정책 복구
create policy user_permissions_club_leader_insert on public.user_permissions for insert to authenticated
  with check (
    club_id is not null and company_id is null
    and public.has_club_perm(club_id, 'CLUB_MEMBER_APPROVE')
    and permission_code in ('CLUB_VIEW', 'CLUB_POST_WRITE', 'CLUB_REPORT_WRITE', 'CLUB_REPORT_VIEW',
                            'CLUB_BUDGET_VIEW', 'CLUB_MEMBER_APPROVE')
  );
create policy user_permissions_club_leader_delete on public.user_permissions for delete to authenticated
  using (club_id is not null and company_id is null and public.has_club_perm(club_id, 'CLUB_MEMBER_APPROVE'));
create policy user_permissions_chairman_grant on public.user_permissions for insert to authenticated
  with check (
    public.has_global_perm('CLUB_CREATE_APPROVE')
    and club_id is not null and company_id is null
    and permission_code in ('CLUB_VIEW', 'CLUB_POST_WRITE', 'CLUB_REPORT_WRITE', 'CLUB_REPORT_VIEW',
                            'CLUB_BUDGET_VIEW', 'CLUB_MEMBER_APPROVE')
  );

notify pgrst, 'reload schema';
commit;

-- 이력 테이블까지 완전히 삭제하려면(되돌릴 수 없음):
--   drop table if exists public.club_chair_history;
