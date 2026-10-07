-- ############################################################
-- # 적용하지 마세요 (참고용 보관본)
-- # 이 파일은 "정책이 하나도 없다"고 가정하고 처음부터 만든 전체 정책 세트입니다.
-- # 실제 DB 에는 이미 정책 39개가 있고 대부분 적절하므로, 이 파일을 적용하면 기존 정책과 OR 로 합쳐져
-- # 제한이 의도대로 동작하지 않을 수 있습니다. 실제 적용용은 상위 폴더의 02_fix_existing_policies.sql 입니다.
-- ############################################################
-- ============================================================
-- 02_rls_policies_DRAFT.sql  —  RLS 정책 "초안"  (아직 적용하지 마세요)
--
-- ⚠ 반드시 지킬 것
--   1) 운영 DB에 바로 적용하지 말고, 먼저 테스트용 Supabase 프로젝트(또는 백업 복원본)에서 실행해 보세요.
--   2) 적용 전에 /api/admin/backup 으로 전체 백업을 받아 두세요.
--   3) 01_rls_audit.sql 의 결과(특히 [A][B][D][G])를 확인한 뒤, 이 초안과 다른 부분이 있으면 맞춰야 합니다.
--   4) 문제가 생기면 03_rls_rollback.sql 로 즉시 되돌릴 수 있습니다.
--
-- 이 초안이 근거로 삼은 것: 앱 코드(app/, components/, lib/)에서 실제로 실행하는 조회·쓰기 동작.
--   앱은 브라우저에서 로그인 사용자 권한으로 DB에 직접 쓰기 때문에, 정책이 그 동작을 막지 않도록 맞췄습니다.
--   service role 키를 쓰는 /api/admin/* 는 RLS 를 우회하므로 영향이 없습니다.
-- 확인하지 못한 것: 실제 테이블의 모든 컬럼·제약, 기존에 걸린 정책, 스토리지 설정.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. 도우미 함수
--    SECURITY DEFINER: 함수 안에서는 RLS 를 거치지 않고 읽습니다. (정책 → 함수 → 같은 표 조회로 인한 무한 재귀 방지)
--    id 계열 인자는 text 로 받아 타입(uuid/bigint)에 상관없이 동작하도록 했습니다.
-- ------------------------------------------------------------
create or replace function public.has_perm(p_code text, p_club text default null, p_company text default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_permissions up
    where up.user_id = (select auth.uid())
      and up.permission_code = p_code
      and (
        (up.club_id is null and up.company_id is null)            -- 전사 권한
        or (p_club is not null and up.club_id::text = p_club)     -- 해당 동호회 권한
        or (p_company is not null and up.company_id::text = p_company) -- 해당 회사 권한
      )
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users u where u.id = (select auth.uid()) and u.status = 'approved');
$$;

-- 승인 회원 + 가입 대기(게스트) 회원 : 동호회 게시판 열람 가능 범위
create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users u where u.id = (select auth.uid()) and u.status in ('approved', 'pending'));
$$;

grant execute on function public.has_perm(text, text, text) to authenticated;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_active_user() to authenticated;

-- ------------------------------------------------------------
-- 1. RLS 켜기 (켜는 순간부터 정책이 없는 동작은 전부 거부됩니다)
-- ------------------------------------------------------------
alter table public.companies                  enable row level security;
alter table public.users                      enable row level security;
alter table public.permissions                enable row level security;
alter table public.clubs                      enable row level security;
alter table public.user_permissions           enable row level security;
alter table public.club_members               enable row level security;
alter table public.club_lifecycle_requests    enable row level security;
alter table public.club_support_rates         enable row level security;
alter table public.posts                      enable row level security;
alter table public.post_attachments           enable row level security;
alter table public.post_attendees             enable row level security;
alter table public.post_comments              enable row level security;
alter table public.post_likes                 enable row level security;
alter table public.club_budget_disbursements  enable row level security;

-- 이미 같은 이름의 정책이 있으면 지우고 다시 만들도록, 이 파일이 만드는 정책 이름은 모두 "rls_" 로 시작합니다.
-- (기존에 다른 이름으로 걸려 있던 느슨한 정책은 01_rls_audit.sql [B] 로 찾아서 직접 삭제해야 합니다.
--  정책은 OR 로 합쳐지므로, 느슨한 옛 정책이 남아 있으면 이 초안의 제한이 무력화됩니다.)

-- ------------------------------------------------------------
-- 2. companies / permissions : 읽기 전용 기준 데이터
--    companies 는 로그인 전(회원가입 화면의 회사 선택)에도 읽혀야 하므로 anon 에게도 읽기를 허용합니다.
-- ------------------------------------------------------------
drop policy if exists rls_companies_read on public.companies;
create policy rls_companies_read on public.companies for select to anon, authenticated using (true);

drop policy if exists rls_permissions_read on public.permissions;
create policy rls_permissions_read on public.permissions for select to authenticated using (true);

-- ------------------------------------------------------------
-- 3. users
--    읽기: 본인 / 승인된 회원(명단 조회) / 계정 승인 담당
--    가입: 본인 행만, 반드시 status='pending' 으로만  (스스로 approved 로 가입하는 것 차단)
--    수정: 계정 승인·관리 담당만  (본인이 status 를 바꿔 스스로 승인하는 것 차단)
--    삭제: 불가
-- ------------------------------------------------------------
drop policy if exists rls_users_select on public.users;
create policy rls_users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or public.is_approved() or public.has_perm('ACC_APPROVE'));

drop policy if exists rls_users_insert on public.users;
create policy rls_users_insert on public.users for insert to authenticated
  with check (id = (select auth.uid()) and status = 'pending');

drop policy if exists rls_users_update on public.users;
create policy rls_users_update on public.users for update to authenticated
  using (public.has_perm('ACC_APPROVE') or public.has_perm('ACC_MANAGE'))
  with check (public.has_perm('ACC_APPROVE') or public.has_perm('ACC_MANAGE'));

-- ------------------------------------------------------------
-- 4. user_permissions  (가장 중요: 여기가 뚫리면 누구나 관리자가 될 수 있습니다)
--    읽기: 승인된 회원 / 본인 (본인 권한은 가입 대기 상태에서도 읽혀야 하므로 포함)
--    쓰기: 아래 세 부류만
--      ① PERM_MANAGE 보유자 — 모든 권한 부여·회수
--      ② ACC_APPROVE 보유자 — 신규 승인 회원에게 "기본 전사 권한"(동호회 개설/폐설 신청)만 부여
--      ③ 동호회 회장/총무(CLUB_MEMBER_APPROVE) 또는 개설 승인 담당 — "그 동호회" 범위 권한만 부여·회수
--    전사 권한(club_id·company_id 둘 다 비어 있음)을 ②·① 외에는 절대 줄 수 없게 했습니다.
-- ------------------------------------------------------------
drop policy if exists rls_userperm_select on public.user_permissions;
create policy rls_userperm_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_approved());

drop policy if exists rls_userperm_insert on public.user_permissions;
create policy rls_userperm_insert on public.user_permissions for insert to authenticated
  with check (
    public.has_perm('PERM_MANAGE')
    or (public.has_perm('ACC_APPROVE')
        and club_id is null and company_id is null
        and permission_code in ('CLUB_CREATE_REQUEST', 'CLUB_CLOSE_REQUEST'))
    or (club_id is not null and company_id is null
        and (public.has_perm('CLUB_MEMBER_APPROVE', club_id::text) or public.has_perm('CLUB_CREATE_APPROVE'))
        and permission_code in ('CLUB_VIEW', 'CLUB_POST_WRITE', 'CLUB_REPORT_WRITE', 'CLUB_REPORT_VIEW',
                                'CLUB_BUDGET_VIEW', 'CLUB_MEMBER_APPROVE'))
  );

drop policy if exists rls_userperm_delete on public.user_permissions;
create policy rls_userperm_delete on public.user_permissions for delete to authenticated
  using (
    public.has_perm('PERM_MANAGE')
    or (club_id is not null and public.has_perm('CLUB_MEMBER_APPROVE', club_id::text))
  );

-- upsert(ignoreDuplicates) 는 insert 정책만 사용합니다. 권한 값을 바꾸는 update 는 앱에서 쓰지 않으므로 허용하지 않습니다.

-- ------------------------------------------------------------
-- 5. clubs
--    읽기: 승인·가입대기 회원
--    생성: 개설 승인 담당만  /  수정: 회장·총무(소개글·커버), 개설/폐설 담당
--    ※ 회장·총무가 status(폐설 상태)를 직접 바꾸지 못하도록 아래 트리거로 보강합니다.
-- ------------------------------------------------------------
drop policy if exists rls_clubs_select on public.clubs;
create policy rls_clubs_select on public.clubs for select to authenticated using (public.is_active_user());

drop policy if exists rls_clubs_insert on public.clubs;
create policy rls_clubs_insert on public.clubs for insert to authenticated with check (public.has_perm('CLUB_CREATE_APPROVE'));

drop policy if exists rls_clubs_update on public.clubs;
create policy rls_clubs_update on public.clubs for update to authenticated
  using (public.has_perm('CLUB_CLOSE_APPROVE') or public.has_perm('CLUB_CREATE_APPROVE') or public.has_perm('CLUB_MEMBER_APPROVE', id::text))
  with check (public.has_perm('CLUB_CLOSE_APPROVE') or public.has_perm('CLUB_CREATE_APPROVE') or public.has_perm('CLUB_MEMBER_APPROVE', id::text));

create or replace function public.guard_clubs_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and not (public.has_perm('CLUB_CLOSE_APPROVE') or public.has_perm('CLUB_CREATE_APPROVE')) then
    raise exception '동호회 운영 상태는 통합관리자만 변경할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_clubs_status on public.clubs;
create trigger trg_guard_clubs_status before update on public.clubs for each row execute function public.guard_clubs_status();

-- ------------------------------------------------------------
-- 6. club_members
--    읽기: 승인된 회원(명단·인원수) / 본인 행
--    가입 신청: 본인이, 'pending' + '회원' 으로만  (스스로 회장·승인 상태로 넣는 것 차단)
--    개설 승인 시 회장 행 추가: CLUB_CREATE_APPROVE
--    수정: 회장·총무(승인/탈회 처리), 권한 관리자(직책 변경), 본인(탈회 신청 표시만 — 트리거로 컬럼 제한)
-- ------------------------------------------------------------
drop policy if exists rls_members_select on public.club_members;
create policy rls_members_select on public.club_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_approved());

drop policy if exists rls_members_insert on public.club_members;
create policy rls_members_insert on public.club_members for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and status = 'pending' and role_label = '회원' and public.is_approved())
    or public.has_perm('CLUB_CREATE_APPROVE')
  );

drop policy if exists rls_members_update on public.club_members;
create policy rls_members_update on public.club_members for update to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_perm('CLUB_MEMBER_APPROVE', club_id::text)
    or public.has_perm('PERM_MANAGE')
  )
  with check (
    user_id = (select auth.uid())
    or public.has_perm('CLUB_MEMBER_APPROVE', club_id::text)
    or public.has_perm('PERM_MANAGE')
  );

-- 본인 행을 수정하는 일반 회원은 withdrawal_requested 만 바꿀 수 있습니다.
create or replace function public.guard_club_members_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.user_id = (select auth.uid())
     and not (public.has_perm('CLUB_MEMBER_APPROVE', old.club_id::text) or public.has_perm('PERM_MANAGE')) then
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

-- ------------------------------------------------------------
-- 7. club_lifecycle_requests (개설·폐설 신청)
--    읽기: 신청자 본인 / 승인 담당  |  신청: 본인 명의 + pending 으로만  |  처리: 승인 담당
-- ------------------------------------------------------------
drop policy if exists rls_lifecycle_select on public.club_lifecycle_requests;
create policy rls_lifecycle_select on public.club_lifecycle_requests for select to authenticated
  using (requester_id = (select auth.uid()) or public.has_perm('CLUB_CREATE_APPROVE') or public.has_perm('CLUB_CLOSE_APPROVE'));

drop policy if exists rls_lifecycle_insert on public.club_lifecycle_requests;
create policy rls_lifecycle_insert on public.club_lifecycle_requests for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and public.is_approved());

drop policy if exists rls_lifecycle_update on public.club_lifecycle_requests;
create policy rls_lifecycle_update on public.club_lifecycle_requests for update to authenticated
  using (public.has_perm('CLUB_CREATE_APPROVE') or public.has_perm('CLUB_CLOSE_APPROVE'))
  with check (public.has_perm('CLUB_CREATE_APPROVE') or public.has_perm('CLUB_CLOSE_APPROVE'));

-- ------------------------------------------------------------
-- 8. club_support_rates (지원 단가)  읽기: 승인 회원  |  쓰기: 단가 설정 권한자
-- ------------------------------------------------------------
drop policy if exists rls_rates_select on public.club_support_rates;
create policy rls_rates_select on public.club_support_rates for select to authenticated using (public.is_approved());

drop policy if exists rls_rates_write on public.club_support_rates;
create policy rls_rates_write on public.club_support_rates for all to authenticated
  using (public.has_perm('CLUB_SUPPORT_RATE_EDIT')) with check (public.has_perm('CLUB_SUPPORT_RATE_EDIT'));

-- ------------------------------------------------------------
-- 9. club_budget_disbursements (지원금 지급내역)
--    읽기: 해당 회사 지급 담당 / 전사 조회 권한 / 해당 동호회 예산 조회 권한자
--    쓰기: 해당 회사 지급 담당만
-- ------------------------------------------------------------
drop policy if exists rls_budget_select on public.club_budget_disbursements;
create policy rls_budget_select on public.club_budget_disbursements for select to authenticated
  using (
    public.has_perm('CLUB_BUDGET_DISBURSE', null, company_id::text)
    or public.has_perm('ORG_VIEW_ALL')
    or public.has_perm('CLUB_BUDGET_VIEW', club_id::text)
  );

drop policy if exists rls_budget_write on public.club_budget_disbursements;
create policy rls_budget_write on public.club_budget_disbursements for all to authenticated
  using (public.has_perm('CLUB_BUDGET_DISBURSE', null, company_id::text))
  with check (public.has_perm('CLUB_BUDGET_DISBURSE', null, company_id::text));

-- ------------------------------------------------------------
-- 10. posts (게시글·공지·사진·활동보고서)
--    읽기: 공지/일반/사진 = 승인·가입대기 회원(게스트 열람 허용, 현재 앱 동작 유지)
--          활동보고서   = 승인 회원만
--    작성: 작성자 본인 명의 + 해당 동호회의 글쓰기(또는 보고서) 권한
--    삭제: 작성자 본인 / 회장·총무
-- ------------------------------------------------------------
drop policy if exists rls_posts_select on public.posts;
create policy rls_posts_select on public.posts for select to authenticated
  using ((type <> 'report' and public.is_active_user()) or (type = 'report' and public.is_approved()));

drop policy if exists rls_posts_insert on public.posts;
create policy rls_posts_insert on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_approved()
    and (
      (type <> 'report' and public.has_perm('CLUB_POST_WRITE', club_id::text))
      or (type = 'report' and public.has_perm('CLUB_REPORT_WRITE', club_id::text))
    )
  );

drop policy if exists rls_posts_update on public.posts;
create policy rls_posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

drop policy if exists rls_posts_delete on public.posts;
create policy rls_posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or public.has_perm('CLUB_MEMBER_APPROVE', club_id::text));

-- ------------------------------------------------------------
-- 11. 게시글에 딸린 표들 : 원글(posts)을 볼 수 있으면 읽을 수 있고, 쓰기는 원글 작성자(첨부·참석자) 또는 본인(댓글·좋아요)
--     아래 exists(...) 안의 posts 조회에도 위 posts 정책이 그대로 적용됩니다.
-- ------------------------------------------------------------
drop policy if exists rls_attach_select on public.post_attachments;
create policy rls_attach_select on public.post_attachments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists rls_attach_insert on public.post_attachments;
create policy rls_attach_insert on public.post_attachments for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
drop policy if exists rls_attach_delete on public.post_attachments;
create policy rls_attach_delete on public.post_attachments for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
                 and (p.author_id = (select auth.uid()) or public.has_perm('CLUB_MEMBER_APPROVE', p.club_id::text))));

drop policy if exists rls_attendees_select on public.post_attendees;
create policy rls_attendees_select on public.post_attendees for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists rls_attendees_insert on public.post_attendees;
create policy rls_attendees_insert on public.post_attendees for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
drop policy if exists rls_attendees_delete on public.post_attendees;
create policy rls_attendees_delete on public.post_attendees for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

drop policy if exists rls_comments_select on public.post_comments;
create policy rls_comments_select on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists rls_comments_insert on public.post_comments;
create policy rls_comments_insert on public.post_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_approved()
              and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists rls_comments_delete on public.post_comments;
create policy rls_comments_delete on public.post_comments for delete to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists rls_likes_select on public.post_likes;
create policy rls_likes_select on public.post_likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists rls_likes_insert on public.post_likes;
create policy rls_likes_insert on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_approved());
drop policy if exists rls_likes_delete on public.post_likes;
create policy rls_likes_delete on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 12. 스토리지 (club-files 버킷)
--    앱은 서명 URL 로 파일을 보여주므로 버킷은 반드시 비공개(public=false)여야 의미가 있습니다.
--    01_rls_audit.sql [G][H] 결과를 확인한 뒤, 아래 주석을 풀어 적용하세요. (기존 정책과 겹치지 않는지 먼저 확인)
-- ------------------------------------------------------------
-- update storage.buckets set public = false where id = 'club-files';
--
-- create policy rls_storage_read   on storage.objects for select to authenticated
--   using (bucket_id = 'club-files' and public.is_approved());
-- create policy rls_storage_insert on storage.objects for insert to authenticated
--   with check (bucket_id = 'club-files' and public.is_approved());
-- create policy rls_storage_delete on storage.objects for delete to authenticated
--   using (bucket_id = 'club-files' and owner = (select auth.uid()));

commit;

-- ============================================================
-- 적용 후 테스트 체크리스트 (일반 회원 / 회장 / 통합관리자 계정으로 각각)
--   [일반 회원] 가입 신청, 게시글 읽기, 댓글·좋아요, 탈회 신청                       → 정상 동작
--   [일반 회원] 브라우저 콘솔에서 user_permissions 에 관리자 권한 insert 시도           → 거부되어야 함
--   [일반 회원] 본인 users.status 를 approved 로 update 시도                          → 거부되어야 함
--   [회장]      가입 승인, 권한 부여(해당 동호회만), 글 삭제, 소개글 수정                → 정상 동작
--   [회장]      다른 동호회 권한 부여 / 동호회 status 를 closed 로 변경 시도             → 거부되어야 함
--   [통합관리자] 계정 승인, 권한 설정, 개설·폐설 승인, 지원금 설정                       → 정상 동작
--   [지급 담당] 자기 회사 지원금 지급 처리 / 다른 회사 건 처리 시도                       → 앞은 성공, 뒤는 거부
--   [로그아웃 상태] 회원가입 화면의 회사 목록 표시, 그 외 표 조회                          → 회사 목록만 보여야 함
-- ============================================================
