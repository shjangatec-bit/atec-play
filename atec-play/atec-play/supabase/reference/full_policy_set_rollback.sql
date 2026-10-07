-- ============================================================
-- 03_rls_rollback.sql  —  02_rls_policies_DRAFT.sql 적용 후 문제가 생겼을 때 되돌리는 스크립트
--
-- 주의: 이 스크립트는 "RLS 를 끄므로" 원래 상태(제한 없음)로 돌아갑니다. 임시 응급조치용이며,
--       원인을 고친 뒤에는 다시 02번을 적용해야 안전합니다.
--       02번 적용 전에 이미 존재하던 다른 정책은 건드리지 않습니다. (이름이 rls_ 로 시작하는 정책만 삭제)
-- ============================================================

begin;

-- 트리거·함수 제거
drop trigger if exists trg_guard_clubs_status on public.clubs;
drop trigger if exists trg_guard_club_members_self_update on public.club_members;
drop function if exists public.guard_clubs_status();
drop function if exists public.guard_club_members_self_update();

-- rls_ 로 시작하는 정책을 한꺼번에 삭제
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname in ('public', 'storage') and policyname like 'rls\_%' escape '\'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- RLS 끄기 (응급 복구: 즉시 이전처럼 모두 접근 가능해집니다)
alter table public.companies                  disable row level security;
alter table public.users                      disable row level security;
alter table public.permissions                disable row level security;
alter table public.clubs                      disable row level security;
alter table public.user_permissions           disable row level security;
alter table public.club_members               disable row level security;
alter table public.club_lifecycle_requests    disable row level security;
alter table public.club_support_rates         disable row level security;
alter table public.posts                      disable row level security;
alter table public.post_attachments           disable row level security;
alter table public.post_attendees             disable row level security;
alter table public.post_comments              disable row level security;
alter table public.post_likes                 disable row level security;
alter table public.club_budget_disbursements  disable row level security;

drop function if exists public.has_perm(text, text, text);
drop function if exists public.is_approved();
drop function if exists public.is_active_user();

commit;
