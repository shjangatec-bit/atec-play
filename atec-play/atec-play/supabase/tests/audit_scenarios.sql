-- 08 감사 로그 시나리오 (07·08 적용 후). roles_seed.sql 이 먼저 실행되어 있어야 합니다.
create table results(grp text, label text, expect text, got text, pass boolean);
create function test_mid(c uuid, u uuid) returns uuid language sql security definer as $$ select id from public.club_members where club_id = c and user_id = u order by (status = 'approved') desc limit 1 $$;
-- 동작 테스트: u = 사용자 번호(-1 이면 비로그인). 오류 없이 1행 이상 처리되면 allow, 아니면 deny
create function td(p_grp text, p_label text, p_u int, p_sql text, p_expect text) returns void language plpgsql as $$
declare n int; got text;
begin
  begin
    execute 'set local role ' || case when p_u = -1 then 'anon' else 'authenticated' end;
    perform set_config('request.jwt.claim.sub', case when p_u = -1 then '' else test_u(p_u)::text end, true);
    execute p_sql; get diagnostics n = row_count;
    got := case when n > 0 then 'allow' else 'deny' end;
  exception when others then got := 'deny';
  end;
  reset role;
  insert into results values (p_grp, p_label, p_expect, got, got = p_expect);
end $$;
-- 값 테스트(슈퍼유저로 상태 확인): sql 이 돌려주는 정수가 기대값과 같은지
create function tn(p_grp text, p_label text, p_sql text, p_expect int) returns void language plpgsql as $$
declare n int;
begin execute p_sql into n; insert into results values (p_grp, p_label, p_expect::text, n::text, n = p_expect); end $$;
-- 값 테스트(로그인 사용자 권한으로 조회)
create function tnu(p_grp text, p_label text, p_u int, p_sql text, p_expect int) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', test_u(p_u)::text, true);
    execute p_sql into n;
  exception when others then n := -1;
  end;
  reset role;
  insert into results values (p_grp, p_label, p_expect::text, n::text, n = p_expect);
end $$;

-- 헬퍼: 작업 기록 개수 (슈퍼유저로 조회)
create function ac(p_where text) returns int language plpgsql as $$ declare n int; begin execute 'select count(*) from audit_log where ' || p_where into n; return n; end $$;
create table base as select count(*)::int as n from audit_log;

-- ===== A. 기록 방식 =====
select tn('A 기본', '07·08 적용만으로는 기록이 생기지 않음', $q$select (select count(*) from audit_log)$q$, 0);

-- ===== B. 직책 변경 =====
-- 2 = club1 회장, 3 = club1 총무. 회장이 4(회원)를 총무로
select td('B 직책', '회장(2)이 회원(4)을 총무로', 2, format($q$select set_member_role(%L, '총무')$q$, test_mid(test_c(1), test_u(4))), 'allow');
select tn('B 직책', '직책 변경 1건 기록(member.role_change)', $q$select ac($$action='member.role_change'$$)$q$, 1);
select tn('B 직책', '작업자=회장(2), 이름 스냅샷 U2, 출처 db', $q$select ac($$action='member.role_change' and actor_id=test_u(2) and actor_name='U2' and source='db' and detail->>'from'='회원' and detail->>'to'='총무' and target_label='[club1] U4'$$)$q$, 1);
select tn('B 직책', '직책 변경에 딸린 권한 자동 동기화는 별도 기록 안 함', $q$select ac($$action like 'permission.%'$$)$q$, 0);
-- 실패한 변경은 기록 없음
select td('B 직책', '일반 회원(5)이 직책 변경 시도 → 거부', 5, format($q$select set_member_role(%L, '총무')$q$, test_mid(test_c(1), test_u(3))), 'deny');
select tn('B 직책', '거부된 시도는 기록되지 않음', $q$select ac($$action='member.role_change'$$)$q$, 1);
-- 회장 교체
select td('B 직책', '회장(2)이 회장 교체(4 → 새 회장, 기존 회장은 총무)', 2, format($q$select change_club_chair(%L, %L, '총무', '테스트')$q$, test_c(1), test_mid(test_c(1), test_u(4))), 'allow');
select tn('B 직책', '회장 교체 = 2건 기록(기존 회장 하향 + 새 회장 승격)', $q$select ac($$action='member.role_change'$$) - 1$q$, 2);
-- 직책이 같은 값으로 갱신되면 기록 없음
update club_members set status = status where role_label = '회원';
select tn('B 직책', '직책 변화 없는 업데이트는 기록 안 함', $q$select ac($$action='member.role_change'$$) - 3$q$, 0);

-- ===== C. 권한 부여·회수 =====
select td('C 권한', '관리자(1)가 전사 권한 부여', 1, format($q$insert into user_permissions(user_id, permission_code, club_id, granted_by) values (%L, 'ORG_VIEW_ALL', null, %L)$q$, test_u(16), test_u(1)), 'allow');
select tn('C 권한', '권한 부여 1건 기록', $q$select ac($$action='permission.grant' and actor_id=test_u(1) and detail->>'code'='ORG_VIEW_ALL'$$)$q$, 1);
select td('C 권한', '관리자(1)가 권한 회수', 1, format($q$delete from user_permissions where user_id = %L and permission_code = 'ORG_VIEW_ALL'$q$, test_u(16)), 'allow');
select tn('C 권한', '권한 회수 1건 기록', $q$select ac($$action='permission.revoke' and actor_id=test_u(1) and detail->>'code'='ORG_VIEW_ALL'$$)$q$, 1);
select td('C 권한', '관리자(1)가 권한 맞추기 RPC', 1, format($q$select resync_member_permissions(%L)$q$, test_mid(test_c(1), test_u(9))), 'allow');
select tn('C 권한', '권한 맞추기로 바뀐 권한은 permission.grant 로 기록', $q$select ac($$action='permission.grant' and detail->>'user_id'=test_u(9)::text$$)$q$, 3);

-- ===== D. 계정 승인 / 개설·폐쇄 신청 =====
update users set status = 'pending' where id = test_u(16);   -- SQL Editor(로그인 없음) 직접 변경
select tn('D 계정', 'SQL 직접 변경은 출처 sql, 작업자 없음', $q$select ac($$action='account.status_change' and source='sql' and actor_id is null$$)$q$, 1);
select td('D 계정', '관리자(1)가 계정 승인', 1, format($q$update users set status = 'approved' where id = %L$q$, test_u(16)), 'allow');
select tn('D 계정', '승인 기록(pending→approved, 작업자 1)', $q$select ac($$action='account.status_change' and actor_id=test_u(1) and detail->>'from'='pending' and detail->>'to'='approved'$$)$q$, 1);
insert into club_lifecycle_requests(id, type, club_id, requester_id, status) values ('e0000000-0000-0000-0000-000000000001', 'close', test_c(4), test_u(15), 'pending');
select td('D 신청', '관리자(1)가 폐쇄 신청 승인', 1, $q$update club_lifecycle_requests set status = 'approved' where id = 'e0000000-0000-0000-0000-000000000001'$q$, 'allow');
select tn('D 신청', '신청 처리 기록', $q$select ac($$action='club_request.status_change' and detail->>'to'='approved' and target_label='club4'$$)$q$, 1);

-- ===== E. 지원 단가 / 지원금 지급 =====
insert into club_support_rates(id, club_id, unit_amount) values ('f0000000-0000-0000-0000-000000000001', test_c(1), 30000);
select tn('E 단가', '단가 신규 등록 기록(to=30000)', $q$select ac($$action='support_rate.change' and detail->>'to'='30000' and detail->'from' = 'null'::jsonb$$)$q$, 1);
update club_support_rates set unit_amount = 30000 where id = 'f0000000-0000-0000-0000-000000000001';
select tn('E 단가', '같은 값으로 갱신하면 기록 안 함', $q$select ac($$action='support_rate.change'$$)$q$, 1);
update club_support_rates set unit_amount = 25000 where id = 'f0000000-0000-0000-0000-000000000001';
select tn('E 단가', '값 변경 기록(30000→25000)', $q$select ac($$action='support_rate.change' and detail->>'from'='30000' and detail->>'to'='25000'$$)$q$, 1);

insert into club_budget_disbursements(id, club_id, company_id, status, year, month, attendee_count, amount)
values ('f1000000-0000-0000-0000-000000000001', test_c(1), 'c0000000-0000-0000-0000-000000000001', 'pending', 2026, 9, 5, 125000);
select tn('E 지급', 'pending 행 생성은 기록하지 않음', $q$select ac($$action like 'disbursement.%'$$)$q$, 0);
update club_budget_disbursements set status = 'paid' where id = 'f1000000-0000-0000-0000-000000000001';
select tn('E 지급', 'paid 전환 기록(금액 125000)', $q$select ac($$action='disbursement.paid' and detail->>'amount'='125000' and target_label='club1 · 2026-9'$$)$q$, 1);
update club_budget_disbursements set attendee_count = 6 where id = 'f1000000-0000-0000-0000-000000000001';
select tn('E 지급', 'paid 상태에서 금액 안 바뀌면 기록 안 함', $q$select ac($$action like 'disbursement.%'$$)$q$, 1);
update club_budget_disbursements set amount = 150000 where id = 'f1000000-0000-0000-0000-000000000001';
select tn('E 지급', 'paid 상태 금액 변경 기록', $q$select ac($$action='disbursement.paid' and detail->>'from_status'='paid' and detail->>'from_amount'='125000'$$)$q$, 1);
update club_budget_disbursements set status = 'pending' where id = 'f1000000-0000-0000-0000-000000000001';
select tn('E 지급', 'paid → pending 되돌림 기록', $q$select ac($$action='disbursement.revert'$$)$q$, 1);
insert into club_budget_disbursements(club_id, company_id, status, year, month, attendee_count, amount)
values (test_c(2), 'c0000000-0000-0000-0000-000000000001', 'paid', 2026, 9, 4, 120000);
select tn('E 지급', '처음부터 paid 로 upsert 해도 기록', $q$select ac($$action='disbursement.paid' and target_label='club2 · 2026-9'$$)$q$, 1);

-- ===== F. 조회·위조·변조 방지 =====
select tnu('F 보안', '통합관리자(1)는 기록 조회 가능', 1, $q$select count(*) from audit_log$q$, (select count(*) from audit_log)::int);
select tnu('F 보안', '일반 회원(5)은 0건 조회', 5, $q$select count(*) from audit_log$q$, 0);
select tnu('F 보안', '동호회 회장(2)도 0건 조회', 2, $q$select count(*) from audit_log$q$, 0);

select td('F 보안', '비로그인 → 조회 거부', -1, $q$select * from audit_log$q$, 'deny');
select td('F 보안', '관리자(1)도 화면에서 직접 insert 불가', 1, $q$insert into audit_log(action) values ('fake')$q$, 'deny');
select td('F 보안', '관리자(1)도 화면에서 update 불가', 1, $q$update audit_log set action = 'x'$q$, 'deny');
select td('F 보안', '관리자(1)도 화면에서 delete 불가', 1, $q$delete from audit_log$q$, 'deny');
select td('F 보안', '일반 회원이 audit_write 호출 불가', 5, format($q$select audit_write(%L, 'fake')$q$, test_u(5)), 'deny');
select td('F 보안', '관리자(1)도 audit_write 호출 불가(서버 전용)', 1, format($q$select audit_write(%L, 'fake')$q$, test_u(1)), 'deny');
select td('F 보안', '비로그인이 audit_write 호출 불가', -1, $q$select audit_write(null, 'fake')$q$, 'deny');
select td('F 보안', '일반 회원이 audit_insert 직접 호출 불가', 5, format($q$select audit_insert(%L, 'fake', null, null, null, null, 'db')$q$, test_u(5)), 'deny');
select tn('F 보안', '위 시도들로 가짜 기록이 생기지 않음', $q$select ac($$action in ('fake','x')$$)$q$, 0);
-- 슈퍼유저(SQL Editor)도 수정·삭제·비우기 불가
create function try_exec(p text) returns text language plpgsql as $$ begin execute p; return 'allow'; exception when others then return 'deny'; end $$;
select tn('F 변조', '슈퍼유저 update 차단', $q$select (try_exec('update audit_log set action = ''x''') = 'deny')::int$q$, 1);
select tn('F 변조', '슈퍼유저 delete 차단', $q$select (try_exec('delete from audit_log') = 'deny')::int$q$, 1);
select tn('F 변조', '슈퍼유저 truncate 차단', $q$select (try_exec('truncate audit_log') = 'deny')::int$q$, 1);
-- 서버(service_role)는 기록 가능
create function as_service(p_sql text) returns text language plpgsql as $$ begin set local role service_role; execute p_sql; reset role; return 'allow'; exception when others then reset role; return 'deny'; end $$;
select tn('G API', 'service_role 은 audit_write 가능', format($f$select (as_service(%L) = 'allow')::int$f$, format($g$select audit_write(%L, 'user.password_reset', 'user', 'x', 'U5', '{"k":1}'::jsonb, 'api')$g$, test_u(1))), 1);
select tn('G API', 'API 기록 저장됨(작업자 1, 이름 스냅샷, 출처 api, 상세)', $q$select ac($$action='user.password_reset' and actor_id=test_u(1) and actor_name='U1' and source='api' and detail->>'k'='1'$$)$q$, 1);
select tn('G API', 'service_role 도 테이블 직접 update 불가', $q$select (as_service('update audit_log set action = ''x''') = 'deny')::int$q$, 1);

-- ===== H. 기존 기능이 그대로 동작하는가(회귀) =====
select td('H 회귀', '회장 교체 후 새 회장(4)이 총무를 임명 가능', 4, format($q$select set_member_role(%L, '회원')$q$, test_mid(test_c(1), test_u(5))), 'allow');
select tn('H 회귀', '직책↔is_staff 유지: club1 회장 1명', $q$select count(*) from club_members where club_id = test_c(1) and status = 'approved' and role_label = '회장'$q$, 1);

select grp, label, expect, got, case when pass then 'PASS' else '** FAIL **' end as result from results order by grp, label;
select count(*) filter (where pass) as pass, count(*) filter (where not pass) as fail from results;
