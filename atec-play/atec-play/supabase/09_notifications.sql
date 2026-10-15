-- ============================================================
-- 09. 앱 안 알림 (승인·반려 등 처리 결과를 당사자에게 알려줌)
-- DB 트리거가 자동으로 알림을 만들기 때문에 화면 코드가 빠뜨릴 수 없습니다.
--   받는 사람 / 내용
--   - 본인           : 계정 승인·반려, 동호회 가입 승인·반려, 탈퇴 처리, 직책 변경, 동호회 개설·폐쇄 신청 결과
--   - 동호회 운영진  : 새 가입 신청, 탈퇴 신청, (폐쇄 신청의 처리 결과)   ※ 운영진 = 회장·총무(승인된 회원)
--   - 자기 자신이 한 작업은 알리지 않습니다.
-- 알림은 본인만 조회할 수 있고, 읽음 표시(read_at)와 삭제만 직접 할 수 있습니다. (내용 수정·생성 불가)
-- 적용 순서: 이 SQL 을 먼저 실행한 뒤 코드 PR 을 머지하세요. (되돌리기: 09_notifications_rollback.sql)
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,                 -- 받는 사람
  type       text not null,                 -- 예: member.approved
  title      text not null,
  body       text,
  link       text,                          -- 앱 안 이동 경로(예: /clubs/…)
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx   on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());
-- insert 정책은 만들지 않습니다 → 화면에서는 알림을 만들 수 없음(트리거만 생성)

revoke all on public.notifications from public, anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;   -- 읽음 표시만 가능, 내용·받는 사람 수정 불가

-- ------------------------------------------------------------
-- 2. 내부 함수 (트리거 전용)
-- ------------------------------------------------------------
create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;   -- 본인이 한 일은 알리지 않음
  insert into public.notifications (user_id, type, title, body, link) values (p_user, p_type, p_title, p_body, p_link);
end $$;

-- 동호회 운영진(승인된 회장·총무)에게 알림
create or replace function public.notify_club_staff(p_club uuid, p_type text, p_title text, p_body text, p_link text, p_exclude uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct user_id from public.club_members
           where club_id = p_club and status = 'approved' and is_staff
             and user_id is distinct from p_exclude loop
    perform public.notify_user(r.user_id, p_type, p_title, p_body, p_link);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. 트리거
-- ------------------------------------------------------------
-- 3-1. 계정 승인·반려
create or replace function public.trg_notify_user_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform public.notify_user(new.id, 'account.approved', '가입이 승인되었습니다', '이제 ATEC PLAY 의 모든 기능을 사용할 수 있습니다.', '/dashboard');
    elsif new.status = 'rejected' then
      perform public.notify_user(new.id, 'account.rejected', '가입이 반려되었습니다', '자세한 내용은 관리자에게 문의해 주세요.', null);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_user_status on public.users;
create trigger trg_notify_user_status
  after update on public.users
  for each row execute function public.trg_notify_user_status();

-- 3-2. 동호회 가입·탈퇴·직책
create or replace function public.trg_notify_club_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_club text; v_user text; v_link text;
begin
  select name into v_club from public.clubs where id = new.club_id;
  v_club := coalesce(v_club, '동호회');
  v_link := '/clubs/' || new.club_id::text;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      select name into v_user from public.users where id = new.user_id;
      perform public.notify_club_staff(new.club_id, 'member.join_requested',
        '[' || v_club || '] 새 가입 신청', coalesce(v_user, '회원') || ' 님이 가입을 신청했습니다.', v_link);
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'approved' then
      perform public.notify_user(new.user_id, 'member.approved', '[' || v_club || '] 가입이 승인되었습니다', null, v_link);
    elsif old.status = 'pending' and new.status = 'rejected' then
      perform public.notify_user(new.user_id, 'member.rejected', '[' || v_club || '] 가입이 반려되었습니다', null, v_link);
    elsif old.status = 'approved' and new.status = 'withdrawn' then
      perform public.notify_user(new.user_id, 'member.withdrawn', '[' || v_club || '] 탈퇴 처리되었습니다', null, null);
    end if;
  end if;

  if coalesce(new.withdrawal_requested, false) and not coalesce(old.withdrawal_requested, false) then
    select name into v_user from public.users where id = new.user_id;
    perform public.notify_club_staff(new.club_id, 'member.withdrawal_requested',
      '[' || v_club || '] 탈퇴 신청', coalesce(v_user, '회원') || ' 님이 탈퇴를 신청했습니다.', v_link);
  end if;

  if new.status = 'approved' and old.status = 'approved' and new.role_label is distinct from old.role_label then
    perform public.notify_user(new.user_id, 'member.role_changed',
      '[' || v_club || '] 직책이 변경되었습니다', coalesce(old.role_label, '-') || ' → ' || coalesce(new.role_label, '-'), v_link);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_club_member on public.club_members;
create trigger trg_notify_club_member
  after insert or update on public.club_members
  for each row execute function public.trg_notify_club_member();

-- 3-3. 동호회 개설·폐쇄 신청 결과
create or replace function public.trg_notify_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_kind text; v_res text; v_link text;
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    v_kind := case new.type when 'close' then '폐쇄' else '개설' end;
    v_res  := case new.status when 'approved' then '승인' else '반려' end;
    select name into v_name from public.clubs where id = new.club_id;
    v_name := coalesce(v_name, new.proposed_name, '동호회');
    v_link := case when new.club_id is not null and new.status = 'approved' and new.type <> 'close'
                   then '/clubs/' || new.club_id::text else '/clubs' end;
    perform public.notify_user(new.requester_id, 'club_request.' || new.status,
      '[' || v_name || '] ' || v_kind || ' 신청이 ' || v_res || '되었습니다', null, v_link);
    if new.type = 'close' and new.club_id is not null then
      perform public.notify_club_staff(new.club_id, 'club_request.' || new.status,
        '[' || v_name || '] 폐쇄 신청이 ' || v_res || '되었습니다', null, '/clubs', new.requester_id);   -- 신청자는 위에서 이미 알림
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_lifecycle on public.club_lifecycle_requests;
create trigger trg_notify_lifecycle
  after update on public.club_lifecycle_requests
  for each row execute function public.trg_notify_lifecycle();

-- ------------------------------------------------------------
-- 4. 함수 실행 권한 (Security Advisor 경고 방지)
-- ------------------------------------------------------------
revoke execute on function public.notify_user(uuid, text, text, text, text)       from public, anon, authenticated;
revoke execute on function public.notify_club_staff(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.trg_notify_user_status()                        from public, anon, authenticated;
revoke execute on function public.trg_notify_club_member()                        from public, anon, authenticated;
revoke execute on function public.trg_notify_lifecycle()                          from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
