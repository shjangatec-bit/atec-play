-- ============================================================
-- 02_fix_existing_policies.sql  —  기존 정책 중 "위험한 6곳만" 고치는 필수 수정 (나머지 정책은 그대로 둡니다)
--
-- 근거: 01_rls_audit.sql 로 확인한 현재 정책 39개를 분석한 결과입니다.
-- 고치는 것:
--   1. users_insert_self      : 가입 시 status 를 'pending' 으로만 허용 (지금은 approved 로 가입 가능)
--   2. users_update_self      : 삭제 (지금은 본인이 status 를 approved 로 바꿔 스스로 승인 가능)
--   3. members_insert_self    : 가입 신청은 pending + '회원' 으로만 (지금은 스스로 '회장'·approved 로 삽입 가능)
--   4. members_update_self    : 본인 행은 '탈회 신청' 표시만 가능하도록 트리거로 제한 (지금은 status·직책 변경 가능)
--   5. members_select / clubs_select / permissions_select : 대상을 로그인 사용자로 명시적으로 고정
--      (이미 그렇게 되어 있었을 수 있어 변화가 없을 수 있음. members_select 는 승인 회원·본인 행으로 축소)
--   6. posts_insert           : 활동보고서는 보고서 작성 권한이 있어야만 (지금은 일반 글쓰기 권한만으로 보고서 작성 가능)
--
-- 적용 전: /api/admin/backup 으로 백업, 가능하면 테스트 프로젝트에서 먼저 실행하세요.
-- 문제가 생기면 03_fix_rollback.sql 로 원래 정책으로 되돌립니다.
-- ============================================================
begin;

-- 1·2. users ----------------------------------------------------
drop policy if exists users_update_self on public.users;      -- 앱에는 본인 정보 수정 기능이 없습니다(비밀번호는 Auth 에서 처리)
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users for insert to authenticated
  with check (id = auth.uid() and status = 'pending');

-- 3. club_members 가입 신청 ------------------------------------
drop policy if exists members_insert_self on public.club_members;
create policy members_insert_self on public.club_members for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and role_label = '회원');

-- 4. club_members 본인 행 수정은 withdrawal_requested 만 ------
create or replace function public.guard_club_members_self_update()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 회장·총무(해당 동호회 승인 권한), 개설 승인 담당, 계정 관리 담당은 기존대로 수정 가능
  if old.user_id = auth.uid()
     and not (public.has_club_perm(old.club_id, 'CLUB_MEMBER_APPROVE')
              or public.has_global_perm('CLUB_CREATE_APPROVE')
              or public.has_global_perm('ACC_MANAGE')) then
    if new.status is distinct from old.status
       or new.role_label is distinct from old.role_label
       or new.club_id is distinct from old.club_id
       or new.user_id is distinct from old.user_id then
      raise exception '본인의 가입 상태·직책은 직접 변경할 수 없습니다.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_club_members_self_update on public.club_members;
create trigger trg_guard_club_members_self_update before update on public.club_members
  for each row execute function public.guard_club_members_self_update();

-- 5. 비로그인(anon) 조회 차단 (companies 는 회원가입 화면에서 로그인 전에도 필요하므로 그대로 둠)
alter policy clubs_select       on public.clubs        to authenticated;
alter policy permissions_select on public.permissions  to authenticated;
alter policy members_select     on public.club_members to authenticated
  using (user_id = auth.uid() or public.is_approved());

-- 6. posts 작성: 글 종류별로 필요한 권한을 구분
alter policy posts_insert on public.posts
  with check (
    author_id = auth.uid()
    and (
      (type = 'report' and public.has_club_perm(club_id, 'CLUB_REPORT_WRITE'))
      or (type <> 'report' and public.has_club_perm(club_id, 'CLUB_POST_WRITE'))
    )
  );

commit;
