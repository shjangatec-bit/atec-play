-- ============================================================
-- 05_dedupe_user_permissions.sql  —  user_permissions 중복 행 정리 + 재발 방지
--
-- 문제: 같은 사용자의 같은 권한이 여러 줄로 저장되어 있습니다. (예: 한 사람의 ACC_APPROVE 가 3줄)
--   원인  : 중복 방지 규칙(user_id, club_id, permission_code)이 club_id 가 비어 있는(전사·회사 범위) 행을
--           서로 다른 값으로 취급해서, 가입 승인·권한 템플릿 적용 때마다 같은 행이 계속 추가됩니다.
--   영향  : 권한 설정 화면에서 권한을 "끄면" 중복 행 중 1개만 지워져 권한이 계속 남아 있습니다. (회수 실패)
-- 해결: ① 중복 행 삭제(가장 오래된 1개만 남김) ② 같은 행을 다시 넣으려 하면 조용히 건너뛰는 트리거
--       (앱의 upsert/ignoreDuplicates 코드는 그대로 동작합니다)
--
-- 실행 전 /api/admin/backup 으로 백업하세요. ①은 되돌릴 수 없지만 "완전히 같은 중복 행"만 지웁니다.
-- ============================================================

-- [0] 먼저 미리보기 (읽기 전용): 몇 건이 중복인지 확인하세요. 이 쿼리만 따로 실행해도 됩니다.
-- select u.name, up.permission_code, up.club_id, up.company_id, count(*) as 줄수
-- from public.user_permissions up join public.users u on u.id = up.user_id
-- group by u.name, up.user_id, up.permission_code, up.club_id, up.company_id
-- having count(*) > 1 order by u.name, up.permission_code;

begin;

-- [1] 중복 삭제: 사용자·권한·동호회·회사가 모두 같은 행 중 1개만 남깁니다. (NULL 도 같은 값으로 비교)
delete from public.user_permissions up
using (
  select ctid as tid,
         row_number() over (partition by user_id, permission_code, club_id, company_id order by ctid) as rn
  from public.user_permissions
) d
where up.ctid = d.tid and d.rn > 1;

-- [2] 재발 방지: 완전히 같은 행을 넣으려 하면 오류 없이 건너뜁니다.
create or replace function public.skip_duplicate_user_permission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.user_permissions up
    where up.user_id = new.user_id
      and up.permission_code = new.permission_code
      and up.club_id is not distinct from new.club_id
      and up.company_id is not distinct from new.company_id
  ) then
    return null;   -- 이미 같은 권한이 있으므로 새 행을 만들지 않음
  end if;
  return new;
end $$;

drop trigger if exists trg_skip_duplicate_user_permission on public.user_permissions;
create trigger trg_skip_duplicate_user_permission
  before insert on public.user_permissions
  for each row execute function public.skip_duplicate_user_permission();

commit;

-- 되돌리기(트리거만 제거. 삭제된 중복 행은 복원되지 않음):
--   drop trigger if exists trg_skip_duplicate_user_permission on public.user_permissions;
--   drop function if exists public.skip_duplicate_user_permission();
