-- ============================================================
-- 07_roles_separation.sql  —  직책(회장/총무/회원)과 권한(운영진/일반)의 분리
--
-- 규칙
--   · 직책(role_label)   : 회장 / 총무 / 회원 — 화면에 표시되는 값
--   · 권한(is_staff)     : 운영진(직책이 회장·총무이고 승인 상태) / 일반 — 직책에서 자동 계산되는 값
--   · 직책이 바뀌면 동호회 권한(user_permissions 의 동호회 단위 6개 코드)이 자동으로 켜지고 꺼집니다. 수동 편집 없음.
--   · 동호회당 회장은 1명. 회장 교체는 전용 함수로만 가능하며 이력이 남습니다. 회장 공석은 막습니다.
--   · 직책 변경은 회장·통합관리자만. (총무는 직책을 바꿀 수 없음)
--
-- ⚠ 이 SQL 은 "기존 데이터를 바꾸지 않습니다." 이미 저장된 직책·권한은 그대로 두고,
--   불일치는 club_role_audit() (관리자 화면 '직책·권한 점검')로 목록을 보여 드린 뒤 확인 후 하나씩 바로잡습니다.
--
-- ⚠ 적용 순서: (1) 이 SQL 실행 → (2) 곧바로 앱 코드(PR) 배포.
--   앱 코드가 먼저 배포되면 is_staff 컬럼이 없어 동호회 화면에서 오류가 납니다.
--   이 SQL 만 먼저 적용된 짧은 시간 동안에는 옛 권한 설정 화면의 '회장/총무/회원 템플릿'이 오류를 낼 수 있습니다.
--
-- 되돌리기: 07_roles_separation_rollback.sql
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1. 권한 값: 직책에서 자동 계산되는 컬럼 (직접 수정 불가)
-- ------------------------------------------------------------
alter table public.club_members
  add column if not exists is_staff boolean
  generated always as (coalesce(status = 'approved' and role_label in ('회장', '총무'), false)) stored;

-- ------------------------------------------------------------
-- 2. 회장 교체 이력
-- ------------------------------------------------------------
create table if not exists public.club_chair_history (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references public.clubs(id) on delete cascade,
  old_chair_user_id  uuid references public.users(id) on delete set null,   -- 공석이었다면 비어 있음
  new_chair_user_id  uuid references public.users(id) on delete set null,
  old_chair_new_role text,                                                  -- 기존 회장이 내려간 직책(총무/회원)
  changed_by         uuid references public.users(id) on delete set null,   -- 교체를 실행한 사람
  changed_at         timestamptz not null default now(),
  note               text
);
create index if not exists club_chair_history_club_idx on public.club_chair_history (club_id, changed_at desc);

alter table public.club_chair_history enable row level security;
revoke all on public.club_chair_history from anon;
revoke insert, update, delete, truncate on public.club_chair_history from authenticated;
grant select on public.club_chair_history to authenticated;

drop policy if exists chair_history_select on public.club_chair_history;
create policy chair_history_select on public.club_chair_history for select to authenticated
  using (
    public.has_global_perm('PERM_MANAGE')
    or public.has_global_perm('ACC_MANAGE')
    or exists (
      select 1 from public.club_members m
      where m.club_id = club_chair_history.club_id and m.user_id = (select auth.uid()) and m.status = 'approved'
    )
  );

-- ------------------------------------------------------------
-- 3. 직책 → 동호회 권한 자동 동기화
--    운영진(회장·총무): 가입/탈회 승인, 조회, 게시글, 활동보고서 작성, 증빙 열람, 지원금 현황 (6개)
--    일반(회원)       : 조회, 게시글, 지원금 현황 (3개)   ← 지금 가입 승인 시 자동 부여되던 기본 권한과 동일
--    비회원·탈회·대기  : 없음
-- ------------------------------------------------------------
create or replace function public.club_perm_codes(p_staff boolean)
returns text[] language sql immutable set search_path = public as $$
  select case when p_staff
    then array['CLUB_MEMBER_APPROVE','CLUB_VIEW','CLUB_POST_WRITE','CLUB_REPORT_WRITE','CLUB_REPORT_VIEW','CLUB_BUDGET_VIEW']::text[]
    else array['CLUB_VIEW','CLUB_POST_WRITE','CLUB_BUDGET_VIEW']::text[]
  end
$$;

create or replace function public.sync_member_club_permissions(p_user uuid, p_club uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_all  constant text[] := array['CLUB_MEMBER_APPROVE','CLUB_VIEW','CLUB_POST_WRITE','CLUB_REPORT_WRITE','CLUB_REPORT_VIEW','CLUB_BUDGET_VIEW'];
  v_role text;
  v_want text[];
begin
  -- 이 동호회의 승인된 가입 행 (회장 > 총무 > 회원 순으로 우선)
  select cm.role_label into v_role
  from public.club_members cm
  where cm.user_id = p_user and cm.club_id = p_club and cm.status = 'approved'
  order by coalesce(cm.role_label = '회장', false) desc, coalesce(cm.role_label = '총무', false) desc
  limit 1;

  if found then
    v_want := public.club_perm_codes(v_role in ('회장', '총무'));
  else
    v_want := array[]::text[];
  end if;

  -- 목록에 없는 동호회 권한은 회수 (동호회 단위 6개 코드만 관리. 전사·회사 권한은 건드리지 않음)
  delete from public.user_permissions up
  where up.user_id = p_user and up.club_id = p_club and up.company_id is null
    and up.permission_code = any (v_all)
    and not (up.permission_code = any (v_want));

  -- 부족한 권한은 부여
  insert into public.user_permissions (user_id, permission_code, club_id, company_id, granted_by)
  select p_user, c, p_club, null, coalesce(auth.uid(), p_user)
  from unnest(v_want) as c
  where not exists (
    select 1 from public.user_permissions up
    where up.user_id = p_user and up.club_id = p_club and up.company_id is null and up.permission_code = c
  );
end $$;

create or replace function public.trg_sync_club_member_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_member_club_permissions(old.user_id, old.club_id);
    return old;
  end if;
  perform public.sync_member_club_permissions(new.user_id, new.club_id);
  if tg_op = 'UPDATE' and (old.user_id is distinct from new.user_id or old.club_id is distinct from new.club_id) then
    perform public.sync_member_club_permissions(old.user_id, old.club_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_club_member_permissions on public.club_members;
create trigger trg_sync_club_member_permissions
  after insert or update of role_label, status, user_id, club_id or delete on public.club_members
  for each row execute function public.trg_sync_club_member_permissions();

-- ------------------------------------------------------------
-- 4. 직책 변경 규칙 강제 (화면을 거치지 않고 API 로 직접 바꾸는 것도 막습니다)
--    · 직책 변경 → 전용 함수(set_member_role / change_club_chair)로만
--    · 회장을 내리거나 탈회·삭제 → 전용 함수 없이는 불가 (공석 방지)
--    · 회장·총무 직책으로 직접 삽입 → 통합관리자만
--    · 동호회당 승인된 회장은 1명 (새로 회장이 되는 경우에만 검사하므로, 이미 회장이 2명인 기존 데이터에도 마이그레이션은 실패하지 않음)
--    · DB 에 직접 접속해 하는 작업(SQL Editor, 로그인 정보 없음)은 예외로 허용
-- ------------------------------------------------------------
create or replace function public.guard_club_member_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_bypass boolean := auth.uid() is null or coalesce(current_setting('app.role_rpc', true), '') = 'on';
  v_assigner boolean;
begin
  if tg_op = 'INSERT' then
    if not v_bypass and new.role_label in ('회장', '총무') then
      v_assigner := public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE')
                    or public.has_global_perm('CLUB_CREATE_APPROVE');
      if not v_assigner then
        raise exception '회장·총무 직책은 통합관리자 또는 직책 변경 기능으로만 지정할 수 있습니다.';
      end if;
    end if;
    if new.status = 'approved' and new.role_label = '회장' then
      perform pg_advisory_xact_lock(hashtext('club_chair:' || new.club_id::text));
      if exists (select 1 from public.club_members m
                 where m.club_id = new.club_id and m.status = 'approved' and m.role_label = '회장' and m.id is distinct from new.id) then
        raise exception '이 동호회에는 이미 회장이 있습니다. 회장 교체 기능을 사용해 주세요.';
      end if;
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    -- 회장이 내려가거나(직책·승인 상태 변경) 탈회 처리되어 공석이 되는 것을 막음
    if old.status = 'approved' and old.role_label = '회장'
       and (new.status is distinct from 'approved' or new.role_label is distinct from '회장') and not v_bypass then
      raise exception '회장은 직접 내리거나 탈회 처리할 수 없습니다. 회장 교체 기능으로 먼저 다른 회원을 회장으로 지정해 주세요.';
    end if;
    if new.role_label is distinct from old.role_label and not v_bypass then
      raise exception '직책은 직책 변경 기능으로만 바꿀 수 있습니다.';
    end if;
    -- 새로 회장이 되는 경우: 동호회당 1명
    if new.status = 'approved' and new.role_label = '회장'
       and not (old.status = 'approved' and old.role_label = '회장') then
      perform pg_advisory_xact_lock(hashtext('club_chair:' || new.club_id::text));
      if exists (select 1 from public.club_members m
                 where m.club_id = new.club_id and m.status = 'approved' and m.role_label = '회장' and m.id <> new.id) then
        raise exception '이 동호회에는 이미 회장이 있습니다. 회장 교체 기능을 사용해 주세요.';
      end if;
    end if;
    return new;

  else -- DELETE
    if old.status = 'approved' and old.role_label = '회장' and not v_bypass then
      raise exception '회장은 삭제할 수 없습니다. 회장 교체 기능으로 먼저 다른 회원을 회장으로 지정해 주세요.';
    end if;
    return old;
  end if;
end $$;

drop trigger if exists trg_guard_club_member_roles on public.club_members;
create trigger trg_guard_club_member_roles
  before insert or update or delete on public.club_members
  for each row execute function public.guard_club_member_roles();

-- ------------------------------------------------------------
-- 5. 직책 변경 함수 (화면에서 호출)
-- ------------------------------------------------------------
-- 5-1. 총무 ↔ 회원 변경: 그 동호회의 회장 또는 통합관리자만
create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  m       public.club_members%rowtype;
  v_admin boolean;
  v_chair boolean;
  v_chairs int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_role not in ('총무', '회원') then
    raise exception '직책은 총무 또는 회원만 지정할 수 있습니다. 회장은 회장 교체 기능을 사용해 주세요.';
  end if;

  select * into m from public.club_members where id = p_member_id for update;
  if not found or m.status <> 'approved' then raise exception '승인된 회원이 아닙니다.'; end if;

  v_admin := public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE');
  v_chair := exists (select 1 from public.club_members c
                     where c.club_id = m.club_id and c.user_id = v_uid and c.status = 'approved' and c.role_label = '회장');
  if not (v_admin or v_chair) then
    raise exception '직책은 회장 또는 통합관리자만 변경할 수 있습니다.';
  end if;

  if m.role_label = '회장' then
    -- 회장이 여러 명인 기존 데이터를 정리하는 경우에 한해, 통합관리자가 한 명을 내릴 수 있음
    select count(*) into v_chairs from public.club_members c
    where c.club_id = m.club_id and c.status = 'approved' and c.role_label = '회장';
    if not (v_admin and v_chairs > 1) then
      raise exception '회장의 직책은 회장 교체 기능으로만 바꿀 수 있습니다.';
    end if;
  end if;

  perform set_config('app.role_rpc', 'on', true);
  update public.club_members set role_label = p_role where id = p_member_id;
  perform set_config('app.role_rpc', 'off', true);
end $$;

-- 5-2. 회장 교체: 새 회장 지정 + 기존 회장의 새 직책(총무/회원) 선택. 한 번에 처리되어 공석이 생기지 않음
--      (회장이 공석인 동호회라면 p_old_chair_new_role 없이 새 회장만 지정)
create or replace function public.change_club_chair(
  p_club uuid, p_new_member_id uuid, p_old_chair_new_role text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean;
  v_new    public.club_members%rowtype;
  v_old    public.club_members%rowtype;
  v_chairs int;
  v_id     uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtext('club_chair:' || p_club::text));

  v_admin := public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE');

  select * into v_new from public.club_members where id = p_new_member_id and club_id = p_club for update;
  if not found or v_new.status <> 'approved' then
    raise exception '새 회장은 이 동호회의 승인된 회원이어야 합니다.';
  end if;
  if v_new.role_label = '회장' then raise exception '이미 회장인 회원입니다.'; end if;

  select count(*) into v_chairs from public.club_members c
  where c.club_id = p_club and c.status = 'approved' and c.role_label = '회장';
  if v_chairs > 1 then
    raise exception '이 동호회에 회장이 여러 명입니다. 관리자 화면의 직책·권한 점검에서 먼저 정리해 주세요.';
  end if;

  if v_chairs = 1 then
    select * into v_old from public.club_members c
    where c.club_id = p_club and c.status = 'approved' and c.role_label = '회장' for update;
  end if;

  -- 실행 권한: 통합관리자 또는 현재 회장 본인
  if not (v_admin or (v_chairs = 1 and v_old.user_id = v_uid)) then
    raise exception '회장 교체는 현재 회장 또는 통합관리자만 할 수 있습니다.';
  end if;

  if v_chairs = 1 and coalesce(p_old_chair_new_role, '') not in ('총무', '회원') then
    raise exception '기존 회장의 새 직책(총무 또는 회원)을 선택해 주세요.';
  end if;

  perform set_config('app.role_rpc', 'on', true);
  if v_chairs = 1 then
    update public.club_members set role_label = p_old_chair_new_role where id = v_old.id;   -- 먼저 내리고
  end if;
  update public.club_members set role_label = '회장' where id = v_new.id;                    -- 새 회장 지정
  perform set_config('app.role_rpc', 'off', true);

  insert into public.club_chair_history (club_id, old_chair_user_id, new_chair_user_id, old_chair_new_role, changed_by, note)
  values (p_club, case when v_chairs = 1 then v_old.user_id end, v_new.user_id,
          case when v_chairs = 1 then p_old_chair_new_role end, v_uid, p_note)
  returning id into v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 6. 기존 데이터 점검·수정 (통합관리자 전용. 자동으로 바꾸지 않고, 화면에서 확인 후 하나씩 실행)
-- ------------------------------------------------------------
create or replace function public.club_role_audit()
returns table (i_issue text, i_club_id uuid, i_club_name text, i_member_id uuid, i_user_id uuid,
               i_user_name text, i_role text, i_detail text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_all constant text[] := array['CLUB_MEMBER_APPROVE','CLUB_VIEW','CLUB_POST_WRITE','CLUB_REPORT_WRITE','CLUB_REPORT_VIEW','CLUB_BUDGET_VIEW'];
begin
  if not (public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE')) then
    raise exception '통합관리자만 조회할 수 있습니다.';
  end if;

  return query
  -- (1) 운영 중인 동호회인데 회장이 없음
  select 'NO_CHAIR'::text, c.id, c.name::text, null::uuid, null::uuid, null::text, null::text,
         '회장이 없습니다. 회장을 지정해 주세요.'::text
  from public.clubs c
  where c.status = 'active'
    and not exists (select 1 from public.club_members m where m.club_id = c.id and m.status = 'approved' and m.role_label = '회장')

  union all
  -- (2) 회장이 2명 이상
  select 'MULTI_CHAIR', c.id, c.name::text, m.id, m.user_id, u.name::text, m.role_label::text,
         ('회장이 ' || n.cnt || '명입니다. 한 명만 남기고 나머지는 총무 또는 회원으로 바꿔 주세요.')::text
  from public.clubs c
  join (select cm.club_id, count(*) as cnt from public.club_members cm
        where cm.status = 'approved' and cm.role_label = '회장' group by cm.club_id having count(*) > 1) n on n.club_id = c.id
  join public.club_members m on m.club_id = c.id and m.status = 'approved' and m.role_label = '회장'
  join public.users u on u.id = m.user_id

  union all
  -- (3) 회장·총무·회원이 아닌 직책
  select 'BAD_ROLE', c.id, c.name::text, m.id, m.user_id, u.name::text, m.role_label::text,
         ('직책이 "' || coalesce(m.role_label::text, '(없음)') || '" 입니다. 총무 또는 회원으로 지정해 주세요.')::text
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  join public.users u on u.id = m.user_id
  where m.status = 'approved' and (m.role_label is null or m.role_label not in ('회장', '총무', '회원'))

  union all
  -- (4) 직책과 동호회 권한이 어긋남 (부족하거나 불필요한 권한)
  select 'PERM_MISMATCH', c.id, c.name::text, m.id, m.user_id, u.name::text, m.role_label::text,
         ('부족: ' || coalesce(nullif(array_to_string(miss.arr, ', '), ''), '없음')
          || ' / 불필요: ' || coalesce(nullif(array_to_string(xtra.arr, ', '), ''), '없음'))::text
  from public.club_members m
  join public.clubs c on c.id = m.club_id
  join public.users u on u.id = m.user_id
  cross join lateral (select coalesce(array_agg(up.permission_code::text), array[]::text[]) as arr
                      from public.user_permissions up
                      where up.user_id = m.user_id and up.club_id = m.club_id and up.company_id is null
                        and up.permission_code = any (v_all)) have
  cross join lateral (select array(select unnest(public.club_perm_codes(m.is_staff)) except select unnest(have.arr)) as arr) miss
  cross join lateral (select array(select unnest(have.arr) except select unnest(public.club_perm_codes(m.is_staff))) as arr) xtra
  where m.status = 'approved' and (cardinality(miss.arr) > 0 or cardinality(xtra.arr) > 0)

  union all
  -- (5) 이 동호회 회원이 아닌데 동호회 권한이 남아 있음
  select 'ORPHAN_PERMS', c.id, c.name::text, null::uuid, up.user_id, u.name::text, null::text,
         ('회원이 아닌데 남은 권한: ' || string_agg(up.permission_code::text, ', ' order by up.permission_code))::text
  from public.user_permissions up
  join public.clubs c on c.id = up.club_id
  join public.users u on u.id = up.user_id
  where up.company_id is null and up.permission_code = any (v_all)
    and not exists (select 1 from public.club_members m
                    where m.club_id = up.club_id and m.user_id = up.user_id and m.status = 'approved')
  group by c.id, c.name, up.user_id, u.name;
end $$;

-- 6-1. 한 회원의 동호회 권한을 직책에 맞게 다시 맞춤 (통합관리자가 점검 화면에서 확인 후 실행)
create or replace function public.resync_member_permissions(p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.club_members%rowtype;
begin
  if not (public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE')) then
    raise exception '통합관리자만 실행할 수 있습니다.';
  end if;
  select * into m from public.club_members where id = p_member_id;
  if not found then raise exception '회원 정보를 찾을 수 없습니다.'; end if;
  perform public.sync_member_club_permissions(m.user_id, m.club_id);
end $$;

-- 6-2. 회원이 아닌데 남아 있는 동호회 권한 회수 (통합관리자)
create or replace function public.revoke_orphan_permissions(p_user uuid, p_club uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE')) then
    raise exception '통합관리자만 실행할 수 있습니다.';
  end if;
  if exists (select 1 from public.club_members m where m.user_id = p_user and m.club_id = p_club and m.status = 'approved') then
    raise exception '이 동호회의 승인된 회원이므로 권한을 회수할 수 없습니다. 권한 맞추기를 사용해 주세요.';
  end if;
  perform public.sync_member_club_permissions(p_user, p_club);   -- 회원이 아니므로 동호회 권한이 모두 회수됨
end $$;

-- ------------------------------------------------------------
-- 7. 수동 권한 편집 경로 제거: 회장·개설승인 담당이 동호회 권한을 직접 넣고 빼던 정책(04)을 삭제
--    (직책에서 자동으로 관리되므로 불필요. 통합관리자의 user_permissions 전체 편집 정책은 비상용으로 유지)
-- ------------------------------------------------------------
drop policy if exists user_permissions_club_leader_insert on public.user_permissions;
drop policy if exists user_permissions_club_leader_delete on public.user_permissions;
drop policy if exists user_permissions_chairman_grant     on public.user_permissions;

-- ------------------------------------------------------------
-- 8. 함수 실행 권한 (Security Advisor 경고 방지)
--    내부용 함수는 누구도 직접 호출 불가, 화면이 호출하는 함수는 로그인 사용자만
-- ------------------------------------------------------------
revoke execute on function public.club_perm_codes(boolean)                      from public, anon, authenticated;
revoke execute on function public.sync_member_club_permissions(uuid, uuid)      from public, anon, authenticated;
revoke execute on function public.trg_sync_club_member_permissions()            from public, anon, authenticated;
revoke execute on function public.guard_club_member_roles()                    from public, anon, authenticated;

revoke execute on function public.set_member_role(uuid, text)                          from public, anon;
revoke execute on function public.change_club_chair(uuid, uuid, text, text)            from public, anon;
revoke execute on function public.club_role_audit()                                    from public, anon;
revoke execute on function public.resync_member_permissions(uuid)                      from public, anon;
revoke execute on function public.revoke_orphan_permissions(uuid, uuid)                from public, anon;
grant  execute on function public.set_member_role(uuid, text)                          to authenticated;
grant  execute on function public.change_club_chair(uuid, uuid, text, text)            to authenticated;
grant  execute on function public.club_role_audit()                                    to authenticated;
grant  execute on function public.resync_member_permissions(uuid)                      to authenticated;
grant  execute on function public.revoke_orphan_permissions(uuid, uuid)                to authenticated;

notify pgrst, 'reload schema';

commit;
