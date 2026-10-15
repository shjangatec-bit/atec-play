-- 09 알림 시나리오 (07·08·09 적용 후).
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

create function nc(p_where text) returns int language plpgsql as $$ declare n int; begin execute 'select count(*) from notifications where ' || p_where into n; return n; end $$;
create function try_exec(p text) returns text language plpgsql as $$ begin execute p; return 'allow'; exception when others then return 'deny'; end $$;
-- 사용자 u 의 type 알림 수
create function nu(u int, t text) returns int language sql as $$ select count(*)::int from notifications where user_id = test_u(u) and type = t $$;

select tn('A 기본', '적용만으로는 알림이 생기지 않음', $q$select nc('true')$q$, 0);

-- ===== B. 가입 신청 → 운영진(회장 2·총무 3)에게 =====
select td('B 가입신청', '신입(16)이 club1 가입 신청', 16, format($q$insert into club_members(club_id, user_id, role_label, status) values (%L, %L, '회원', 'pending')$q$, test_c(1), test_u(16)), 'allow');
select tn('B 가입신청', '회장(2)에게 알림 1건', $q$select nu(2, 'member.join_requested')$q$, 1);
select tn('B 가입신청', '총무(9)에게도 알림 1건', $q$select nu(9, 'member.join_requested')$q$, 1);
select tn('B 가입신청', '총무(3)에게 알림 1건', $q$select nu(3, 'member.join_requested')$q$, 1);
select tn('B 가입신청', '일반 회원(4)·본인(16)에게는 알림 없음', $q$select nc($$user_id in (test_u(4), test_u(16))$$)$q$, 0);
select tn('B 가입신청', '내용에 신청자 이름·동호회 이름 포함(운영진 3명: 2·3·9)', $q$select nc($$type='member.join_requested' and title like '[club1]%' and body like 'U16 %' and link = '/clubs/' || test_c(1)$$)$q$, 3);
select tn('B 가입신청', '대기 중인 다른 신청자(6)의 기존 상태는 알림 없음(INSERT 때만)', $q$select nc($$body like 'U6 %'$$)$q$, 0);
select tn('B 가입신청', '이미 approved 로 직접 등록(개설 승인 등)하면 가입신청 알림 없음', $q$with i as (insert into club_members(club_id, user_id, role_label, status) values (test_c(4), test_u(7), '회원', 'approved') returning 1) select (select count(*) from i) + nc($$type='member.join_requested' and title like '[club4]%'$$) - 1$q$, 0);

-- ===== C. 승인·반려 → 본인에게 =====
select td('C 처리', '회장(2)이 16 의 가입을 승인', 2, format($q$update club_members set status = 'approved', processed_by = %L where club_id = %L and user_id = %L$q$, test_u(2), test_c(1), test_u(16)), 'allow');
select tn('C 처리', '16 에게 승인 알림 1건', $q$select nu(16, 'member.approved')$q$, 1);
select tn('C 처리', '승인한 회장(2)에게는 알림 없음', $q$select nc($$user_id = test_u(2) and type = 'member.approved'$$)$q$, 0);
select tn('C 처리', '반려 대상 만들기(17 신청, 슈퍼유저)', $q$with i as (insert into club_members(club_id, user_id, role_label, status) values (test_c(1), test_u(17), '회원', 'pending') returning 1) select count(*) from i$q$, 1);
select td('C 처리', '총무(3)가 17 의 가입을 반려', 3, format($q$update club_members set status = 'rejected' where club_id = %L and user_id = %L$q$, test_c(1), test_u(17)), 'allow');
select tn('C 처리', '17 에게 반려 알림 1건', $q$select nu(17, 'member.rejected')$q$, 1);
select tn('C 처리', '반려한 총무(3)는 승인/반려 알림 없음', $q$select nc($$user_id = test_u(3) and type in ('member.approved','member.rejected')$$)$q$, 0);
update club_members set status = 'rejected' where user_id = test_u(17);
select tn('C 처리', '같은 상태로 다시 갱신하면 중복 알림 없음', $q$select nu(17, 'member.rejected')$q$, 1);

-- ===== D. 탈퇴 =====
select td('D 탈퇴', '일반 회원(4)이 탈퇴 신청', 4, format($q$update club_members set withdrawal_requested = true where club_id = %L and user_id = %L$q$, test_c(1), test_u(4)), 'allow');
select tn('D 탈퇴', '운영진(2·3)에게 탈퇴 신청 알림', $q$select nu(2, 'member.withdrawal_requested') + nu(3, 'member.withdrawal_requested')$q$, 2);
select td('D 탈퇴', '회장(2)이 탈퇴 처리', 2, format($q$update club_members set status = 'withdrawn', withdrawal_requested = false where club_id = %L and user_id = %L$q$, test_c(1), test_u(4)), 'allow');
select tn('D 탈퇴', '4 에게 탈퇴 처리 알림', $q$select nu(4, 'member.withdrawn')$q$, 1);

-- ===== E. 직책 변경 =====
select td('E 직책', '회장(2)이 회원(5)을 총무로', 2, format($q$select set_member_role(%L, '총무')$q$, test_mid(test_c(1), test_u(5))), 'allow');
select tn('E 직책', '5 에게 직책 변경 알림(회원 → 총무)', $q$select nc($$user_id = test_u(5) and type = 'member.role_changed' and body = '회원 → 총무'$$)$q$, 1);
select tn('E 직책', '변경한 회장(2)에게는 없음', $q$select nu(2, 'member.role_changed')$q$, 0);

-- ===== F. 계정 승인·반려 =====
update users set status = 'pending' where id in (test_u(16), test_u(17));
delete from notifications;
select td('F 계정', '관리자(1)가 16 계정 승인', 1, format($q$update users set status = 'approved' where id = %L$q$, test_u(16)), 'allow');
select tn('F 계정', '16 에게 승인 알림', $q$select nu(16, 'account.approved')$q$, 1);
select td('F 계정', '관리자(1)가 17 계정 반려', 1, format($q$update users set status = 'rejected' where id = %L$q$, test_u(17)), 'allow');
select tn('F 계정', '17 에게 반려 알림', $q$select nu(17, 'account.rejected')$q$, 1);
select tn('F 계정', '관리자(1)에게는 알림 없음', $q$select nc($$user_id = test_u(1)$$)$q$, 0);
select tn('F 계정', '이름만 바꾼 업데이트는 알림 없음', $q$with u as (update users set name = name || 'x' where id = test_u(16) returning 1) select (select count(*) from u) + nu(16, 'account.approved') - 2$q$, 0);

-- ===== G. 동호회 개설·폐쇄 신청 결과 =====
delete from notifications;
insert into club_lifecycle_requests(id, type, club_id, requester_id, status, proposed_name) values
 ('e0000000-0000-0000-0000-0000000000a1', 'close', test_c(1), test_u(2), 'pending', null),
 ('e0000000-0000-0000-0000-0000000000a2', 'create', null, test_u(17), 'pending', '새 동호회');
select tn('G 신청', '신청 접수(pending 생성) 자체는 알림 없음', $q$select nc('true')$q$, 0);
select td('G 신청', '관리자(1)가 폐쇄 신청 승인', 1, $q$update club_lifecycle_requests set status = 'approved' where id = 'e0000000-0000-0000-0000-0000000000a1'$q$, 'allow');
select tn('G 신청', '신청자(2)에게 1건(운영진 알림과 중복되지 않음)', $q$select nu(2, 'club_request.approved')$q$, 1);
select tn('G 신청', '다른 운영진(3)에게도 1건', $q$select nu(3, 'club_request.approved')$q$, 1);
select tn('G 신청', '관리자(1)·일반 회원에게는 없음(운영진 2·3·5·9 와 반려 대상 17 제외)', $q$select nc($$user_id not in (test_u(2), test_u(3), test_u(5), test_u(9), test_u(17))$$)$q$, 0);
select td('G 신청', '관리자(1)가 개설 신청 반려', 1, $q$update club_lifecycle_requests set status = 'rejected' where id = 'e0000000-0000-0000-0000-0000000000a2'$q$, 'allow');
select tn('G 신청', '개설 신청자(17)에게 반려 알림(제안 이름 사용)', $q$select nc($$user_id = test_u(17) and type = 'club_request.rejected' and title like '[새 동호회]%'$$)$q$, 1);
select td('G 신청', '관리자(1)가 상태를 pending 으로 되돌려도 알림 없음', 1, $q$update club_lifecycle_requests set status = 'pending' where id = 'e0000000-0000-0000-0000-0000000000a2'$q$, 'allow');
select tn('G 신청', '(위 되돌림 후 총 알림 수 유지: 신청자 1 + 운영진 3 + 반려 1 = 5건)', $q$select nc('true')$q$, 5);

-- ===== G2. 자기 자신에게는 알리지 않음 =====
delete from notifications;
select td('G2 본인제외', '운영진(3)이 본인 탈퇴 신청', 3, format($q$update club_members set withdrawal_requested = true where club_id = %L and user_id = %L$q$, test_c(1), test_u(3)), 'allow');
select tn('G2 본인제외', '다른 운영진(2·5·9)에게는 알림, 본인(3)에게는 없음', $q$select nc($$type = 'member.withdrawal_requested' and user_id in (test_u(2), test_u(5), test_u(9))$$) * 10 + nc($$user_id = test_u(3)$$)$q$, 30);

-- ===== H. 조회·수정 권한 =====
delete from notifications;
insert into notifications(user_id, type, title) values (test_u(5), 't', '5번 알림'), (test_u(5), 't', '5번 알림 2'), (test_u(2), 't', '2번 알림');
select tnu('H 권한', '본인(5)은 자기 알림 2건만 조회', 5, $q$select count(*) from notifications$q$, 2);
select tnu('H 권한', '관리자(1)도 남의 알림은 0건', 1, $q$select count(*) from notifications$q$, 0);
select td('H 권한', '비로그인은 조회 불가', -1, $q$select * from notifications$q$, 'deny');
select td('H 권한', '본인이 읽음 표시 가능', 5, $q$update notifications set read_at = now() where user_id = test_u(5) and title = '5번 알림'$q$, 'allow');
select td('H 권한', '남의 알림 읽음 표시는 0건', 5, $q$update notifications set read_at = now() where user_id = test_u(2)$q$, 'deny');
select td('H 권한', '내용(title) 수정 불가', 5, $q$update notifications set title = '위조' where user_id = test_u(5)$q$, 'deny');
select td('H 권한', '받는 사람(user_id) 바꿔치기 불가', 5, format($q$update notifications set user_id = %L where user_id = test_u(5)$q$, test_u(2)), 'deny');
select td('H 권한', '알림 직접 생성 불가', 5, format($q$insert into notifications(user_id, type, title) values (%L, 't', '가짜')$q$, test_u(2)), 'deny');
select td('H 권한', '관리자도 알림 직접 생성 불가', 1, format($q$insert into notifications(user_id, type, title) values (%L, 't', '가짜')$q$, test_u(2)), 'deny');
select td('H 권한', '남의 알림 삭제는 0건', 5, $q$delete from notifications where user_id = test_u(2)$q$, 'deny');
select td('H 권한', '본인 알림 삭제 가능', 5, $q$delete from notifications where user_id = test_u(5) and title = '5번 알림 2'$q$, 'allow');
select td('H 권한', 'notify_user 직접 호출 불가(로그인 사용자)', 5, format($q$select notify_user(%L, 't', '가짜', null, null)$q$, test_u(2)), 'deny');
select td('H 권한', 'notify_user 직접 호출 불가(비로그인)', -1, format($q$select notify_user(%L, 't', '가짜', null, null)$q$, test_u(2)), 'deny');
select tn('H 권한', '가짜 알림이 하나도 생기지 않음', $q$select nc($$title in ('가짜','위조')$$)$q$, 0);
select tn('H 권한', '남은 알림: 5번 1건(읽음 표시됨) + 2번 1건', $q$select nc($$(user_id = test_u(5) and read_at is not null) or user_id = test_u(2)$$)$q$, 2);

-- ===== I. 08 감사 로그와 함께 동작 =====
select tn('I 공존', '감사 로그(08)는 계속 기록됨', $q$select (select count(*) from audit_log where action = 'member.role_change') $q$, 1);

select grp, label, expect, got, case when pass then 'PASS' else '** FAIL **' end as result from results order by grp, label;
select count(*) filter (where pass) as pass, count(*) filter (where not pass) as fail from results;
