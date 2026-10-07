-- ============================================================
-- 04_optional_tighten_and_fix.sql  —  (선택) 02 적용 후 검토하세요. 필수는 아닙니다.
--
-- [A] 지원금 지급내역 조회 범위 축소 : 지금은 승인 회원 전원이 전 회사·전 동호회 지급내역을 볼 수 있습니다.
--      → 해당 회사 지급 담당 / 전사 조회 권한 / 해당 동호회 예산 조회 권한자만.
-- [B] 현재 정책으로는 통합관리자 외에는 아래 업무가 DB 에서 막혀 있어 회장·계정담당이 쓰면 오류가 날 수 있습니다.
--      (앱 화면은 회장에게 해당 버튼을 보여주지만, 기존 정책은 PERM_MANAGE 등 전사 권한자만 허용)
--      - 회장·총무가 회원에게 동호회 범위 권한 부여/회수, 가입 승인 시 기본 권한 부여
--      - 회장·총무의 동호회 소개글·커버 수정
--      - 계정 승인 담당의 신규 회원 기본 권한 부여
--      - 개설 승인 담당의 신규 동호회 회장 권한 부여
--      → 필요한 만큼만, 범위를 좁혀 허용합니다. (원하지 않으면 [B] 는 적용하지 마세요.)
-- ============================================================
begin;

-- [A]
alter policy disb_select on public.club_budget_disbursements
  using (
    public.has_company_perm(company_id, 'CLUB_BUDGET_DISBURSE')
    or public.has_global_perm('ORG_VIEW_ALL')
    or public.has_club_perm(club_id, 'CLUB_BUDGET_VIEW')
  );

-- [B-1] 계정 승인 담당: 신규 회원에게 "기본 전사 권한"(동호회 개설/폐설 신청)만 부여
create policy user_permissions_default_grant on public.user_permissions for insert to authenticated
  with check (
    public.has_global_perm('ACC_APPROVE')
    and club_id is null and company_id is null
    and permission_code in ('CLUB_CREATE_REQUEST', 'CLUB_CLOSE_REQUEST')
  );

-- [B-2] 회장·총무: "그 동호회" 범위의 일반 권한만 부여/회수 (전사·회사 범위 권한과 다른 동호회는 불가)
create policy user_permissions_club_leader_insert on public.user_permissions for insert to authenticated
  with check (
    club_id is not null and company_id is null
    and public.has_club_perm(club_id, 'CLUB_MEMBER_APPROVE')
    and permission_code in ('CLUB_VIEW', 'CLUB_POST_WRITE', 'CLUB_REPORT_WRITE', 'CLUB_REPORT_VIEW',
                            'CLUB_BUDGET_VIEW', 'CLUB_MEMBER_APPROVE')
  );
create policy user_permissions_club_leader_delete on public.user_permissions for delete to authenticated
  using (club_id is not null and company_id is null and public.has_club_perm(club_id, 'CLUB_MEMBER_APPROVE'));

-- [B-3] 개설 승인 담당: 새 동호회 회장에게 동호회 범위 권한 부여
create policy user_permissions_chairman_grant on public.user_permissions for insert to authenticated
  with check (
    public.has_global_perm('CLUB_CREATE_APPROVE')
    and club_id is not null and company_id is null
    and permission_code in ('CLUB_VIEW', 'CLUB_POST_WRITE', 'CLUB_REPORT_WRITE', 'CLUB_REPORT_VIEW',
                            'CLUB_BUDGET_VIEW', 'CLUB_MEMBER_APPROVE')
  );

-- [B-4] 회장·총무: 동호회 소개글·커버 수정 (운영 상태 status 는 아래 트리거로 통합관리자만 변경 가능)
create policy clubs_leader_update on public.clubs for update to authenticated
  using (public.has_club_perm(id, 'CLUB_MEMBER_APPROVE'))
  with check (public.has_club_perm(id, 'CLUB_MEMBER_APPROVE'));

create or replace function public.guard_clubs_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and not (public.has_global_perm('CLUB_CLOSE_APPROVE') or public.has_global_perm('CLUB_CREATE_APPROVE')) then
    raise exception '동호회 운영 상태는 통합관리자만 변경할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_clubs_status on public.clubs;
create trigger trg_guard_clubs_status before update on public.clubs
  for each row execute function public.guard_clubs_status();

commit;
