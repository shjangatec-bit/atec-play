-- ============================================================
-- 08. 관리자 작업 기록(감사 로그)
-- 누가·언제·무엇을 바꿨는지를 DB 가 직접 남깁니다. (화면 코드가 빠뜨려도 기록됨)
--   - 기록 대상: 직책 변경, 동호회 권한 부여·회수, 계정 승인 상태 변경,
--                지원 단가 변경, 지원금 지급, 동호회 개설·폐쇄 신청 처리
--   - 비밀번호 초기화·백업 내려받기는 서버 API 가 audit_write 로 기록합니다.
--   - 기록은 통합관리자(PERM_MANAGE 또는 ACC_MANAGE)만 조회, 아무도 수정·삭제 불가.
-- 적용 순서: 이 SQL 을 먼저 실행한 뒤 코드 PR 을 머지하세요. (되돌리기: 08_audit_log_rollback.sql)
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1. 테이블 (추가만 가능)
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,                 -- 작업한 사람(SQL Editor 직접 실행이면 비어 있음)
  actor_name   text,                 -- 당시 이름(나중에 이름이 바뀌어도 기록은 유지)
  action       text not null,        -- 예: member.role_change
  target_type  text,                 -- club_member / user_permission / user / club_support_rate / ...
  target_id    text,
  target_label text,                 -- 사람이 읽는 대상 설명(예: "[테니스] 홍길동")
  detail       jsonb not null default '{}'::jsonb,
  source       text not null default 'db'   -- db(트리거) / api(서버) / sql(SQL Editor)
);
create index if not exists audit_log_at_idx     on public.audit_log (at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (public.has_global_perm('PERM_MANAGE') or public.has_global_perm('ACC_MANAGE'));
-- insert/update/delete 정책은 만들지 않습니다 → 화면(로그인 사용자)에서는 쓸 수 없음

revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;

-- 수정·삭제 차단(관리자·SQL Editor 도 불가). 정말 지워야 하면 이 트리거를 먼저 명시적으로 내려야 함
create or replace function public.audit_log_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '작업 기록은 수정하거나 삭제할 수 없습니다.';
end $$;
drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists trg_audit_log_no_truncate on public.audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- ------------------------------------------------------------
-- 2. 기록 함수
-- ------------------------------------------------------------
-- 내부용: 트리거에서만 사용
create or replace function public.audit_insert(
  p_actor uuid, p_action text, p_target_type text, p_target_id text, p_target_label text,
  p_detail jsonb, p_source text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, target_label, detail, source)
  values (p_actor, (select name from public.users where id = p_actor),
          p_action, p_target_type, p_target_id, p_target_label, coalesce(p_detail, '{}'::jsonb), p_source);
end $$;

-- 서버 API 전용(서비스 키로만 호출). 화면에서 호출할 수 없으므로 위조된 기록을 만들 수 없음
create or replace function public.audit_write(
  p_actor uuid, p_action text, p_target_type text default null, p_target_id text default null,
  p_target_label text default null, p_detail jsonb default '{}'::jsonb, p_source text default 'api')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_insert(p_actor, p_action, p_target_type, p_target_id, p_target_label, p_detail, p_source);
end $$;

-- 트리거 공통: 작업자와 출처 결정 (로그인 사용자가 없으면 SQL Editor 직접 실행)
create or replace function public.audit_ctx(out v_actor uuid, out v_source text)
language plpgsql stable as $$
begin
  v_actor  := auth.uid();
  v_source := case when v_actor is null then 'sql' else 'db' end;
end $$;

create or replace function public.audit_user_label(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.users where id = p_user), '(알 수 없음)')
$$;

create or replace function public.audit_club_label(p_club uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.clubs where id = p_club), '(알 수 없음)')
$$;

-- ------------------------------------------------------------
-- 3. 트리거
-- ------------------------------------------------------------
-- 3-1. 직책 변경 (회장 교체·총무↔회원 모두 여기서 잡힘)
create or replace function public.trg_audit_member_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.role_label is distinct from old.role_label then
    select * into c from public.audit_ctx();
    perform public.audit_insert(c.v_actor, 'member.role_change', 'club_member', new.id::text,
      '[' || public.audit_club_label(new.club_id) || '] ' || public.audit_user_label(new.user_id),
      jsonb_build_object('club_id', new.club_id, 'user_id', new.user_id, 'from', old.role_label, 'to', new.role_label),
      c.v_source);
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_member_role on public.club_members;
create trigger trg_audit_member_role
  after update on public.club_members
  for each row execute function public.trg_audit_member_role();

-- 3-2. 권한 부여·회수. 직책 변경에 따른 자동 동기화는 직책 변경 기록에 포함되므로 제외
create or replace function public.trg_audit_user_permission()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record; r public.user_permissions%rowtype; v_act text;
begin
  if coalesce(current_setting('app.role_rpc', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select * into c from public.audit_ctx();
  r     := case when tg_op = 'DELETE' then old else new end;
  v_act := case when tg_op = 'DELETE' then 'permission.revoke' else 'permission.grant' end;
  perform public.audit_insert(c.v_actor, v_act, 'user_permission', r.id::text,
    public.audit_user_label(r.user_id) || ' · ' || r.permission_code
      || coalesce(' · ' || public.audit_club_label(r.club_id), ''),
    jsonb_build_object('user_id', r.user_id, 'code', r.permission_code, 'club_id', r.club_id, 'company_id', r.company_id),
    c.v_source);
  return coalesce(new, old);
end $$;
drop trigger if exists trg_audit_user_permission on public.user_permissions;
create trigger trg_audit_user_permission
  after insert or delete on public.user_permissions
  for each row execute function public.trg_audit_user_permission();

-- 3-3. 계정 승인 상태 변경
create or replace function public.trg_audit_user_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status is distinct from old.status then
    select * into c from public.audit_ctx();
    perform public.audit_insert(c.v_actor, 'account.status_change', 'user', new.id::text, new.name,
      jsonb_build_object('from', old.status, 'to', new.status), c.v_source);
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_user_status on public.users;
create trigger trg_audit_user_status
  after update on public.users
  for each row execute function public.trg_audit_user_status();

-- 3-4. 지원 단가 (to_jsonb 로 읽어 컬럼 구성이 달라도 동작)
create or replace function public.trg_audit_support_rate()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if tg_op = 'UPDATE' and to_jsonb(new)->>'unit_amount' is not distinct from to_jsonb(old)->>'unit_amount' then
    return new;
  end if;
  select * into c from public.audit_ctx();
  perform public.audit_insert(c.v_actor, 'support_rate.change', 'club_support_rate', new.id::text,
    public.audit_club_label(new.club_id),
    jsonb_build_object('club_id', new.club_id,
      'from', case when tg_op = 'UPDATE' then to_jsonb(old)->>'unit_amount' end,
      'to', to_jsonb(new)->>'unit_amount'),
    c.v_source);
  return new;
end $$;
drop trigger if exists trg_audit_support_rate on public.club_support_rates;
create trigger trg_audit_support_rate
  after insert or update on public.club_support_rates
  for each row execute function public.trg_audit_support_rate();

-- 3-5. 지원금 지급(paid 로 생성·전환, paid 상태에서 금액 변경, paid 에서 되돌림)
create or replace function public.trg_audit_disbursement()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record; j jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if new.status is distinct from 'paid' and not (tg_op = 'UPDATE' and o->>'status' = 'paid') then
    return new;
  end if;
  if tg_op = 'UPDATE' and o->>'status' is not distinct from j->>'status' and o->>'amount' is not distinct from j->>'amount' then
    return new;
  end if;
  select * into c from public.audit_ctx();
  perform public.audit_insert(c.v_actor,
    case when new.status = 'paid' then 'disbursement.paid' else 'disbursement.revert' end,
    'club_budget_disbursement', new.id::text,
    public.audit_club_label(new.club_id) || ' · ' || coalesce(j->>'year', '?') || '-' || coalesce(j->>'month', '?'),
    jsonb_build_object('club_id', new.club_id, 'company_id', new.company_id,
      'year', j->>'year', 'month', j->>'month', 'attendee_count', j->>'attendee_count',
      'amount', j->>'amount', 'from_status', o->>'status', 'from_amount', o->>'amount', 'to_status', new.status),
    c.v_source);
  return new;
end $$;
drop trigger if exists trg_audit_disbursement on public.club_budget_disbursements;
create trigger trg_audit_disbursement
  after insert or update on public.club_budget_disbursements
  for each row execute function public.trg_audit_disbursement();

-- 3-6. 동호회 개설·폐쇄 신청 처리(상태 변경)
create or replace function public.trg_audit_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.status is distinct from old.status then
    select * into c from public.audit_ctx();
    perform public.audit_insert(c.v_actor, 'club_request.status_change', 'club_lifecycle_request', new.id::text,
      coalesce(public.audit_club_label(new.club_id), new.proposed_name),
      jsonb_build_object('type', new.type, 'club_id', new.club_id, 'from', old.status, 'to', new.status),
      c.v_source);
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_lifecycle on public.club_lifecycle_requests;
create trigger trg_audit_lifecycle
  after update on public.club_lifecycle_requests
  for each row execute function public.trg_audit_lifecycle();

-- ------------------------------------------------------------
-- 4. 함수 실행 권한 (Security Advisor 경고 방지)
-- ------------------------------------------------------------
revoke execute on function public.audit_insert(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.audit_write(uuid, text, text, text, text, jsonb, text)  from public, anon, authenticated;
revoke execute on function public.audit_ctx()                                             from public, anon, authenticated;
revoke execute on function public.audit_user_label(uuid)                                  from public, anon, authenticated;
revoke execute on function public.audit_club_label(uuid)                                  from public, anon, authenticated;
revoke execute on function public.audit_log_immutable()                                   from public, anon, authenticated;
revoke execute on function public.trg_audit_member_role()                                 from public, anon, authenticated;
revoke execute on function public.trg_audit_user_permission()                             from public, anon, authenticated;
revoke execute on function public.trg_audit_user_status()                                 from public, anon, authenticated;
revoke execute on function public.trg_audit_support_rate()                                from public, anon, authenticated;
revoke execute on function public.trg_audit_disbursement()                                from public, anon, authenticated;
revoke execute on function public.trg_audit_lifecycle()                                   from public, anon, authenticated;
grant  execute on function public.audit_write(uuid, text, text, text, text, jsonb, text)  to service_role;

notify pgrst, 'reload schema';

commit;
