-- 07 적용 "후" 시나리오 (직책/권한 분리). roles_seed.sql 이 먼저 실행되어 있어야 합니다.
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

-- ===== A. 마이그레이션 안전성: 기존 데이터를 바꾸지 않았는가 =====
select tn('A 안전성', '기존 권한 행이 07 적용 전과 완전히 동일(추가·삭제 0건)', $q$select (select count(*) from (select * from snap except select * from user_permissions) a) + (select count(*) from (select * from user_permissions except select * from snap) b)$q$, 0);
select tn('A 안전성', '직책 값이 하나도 바뀌지 않음(회장 4명: club1·3(2명)·4)', $q$select count(*) from club_members where role_label = '회장'$q$, 4);
select tn('A 안전성', '운영진 여부(is_staff): 회장·총무(승인) 6명', $q$select count(*) from club_members where is_staff$q$, 6);
select tn('A 안전성', '이상한 직책(부회장)은 운영진이 아님', $q$select count(*) from club_members where role_label = '부회장' and is_staff$q$, 0);
select tn('A 안전성', '가입 대기 회원은 운영진이 아님', $q$select count(*) from club_members where status = 'pending' and is_staff$q$, 0);

-- ===== B. 점검 목록(관리자 전용) =====
select tnu('B 점검', '[관리자] 회장 없음: club2 1건', 1, $q$select count(*) from club_role_audit() where i_issue = 'NO_CHAIR'$q$, 1);
select tnu('B 점검', '[관리자] 회장 2명: club3 의 2행', 1, $q$select count(*) from club_role_audit() where i_issue = 'MULTI_CHAIR'$q$, 2);
select tnu('B 점검', '[관리자] 이상한 직책 1건', 1, $q$select count(*) from club_role_audit() where i_issue = 'BAD_ROLE'$q$, 1);
select tnu('B 점검', '[관리자] 권한 불일치 2건(과다 1 + 부족 1)', 1, $q$select count(*) from club_role_audit() where i_issue = 'PERM_MISMATCH'$q$, 2);
select tnu('B 점검', '[관리자] 회원이 아닌데 권한이 남은 경우 1건', 1, $q$select count(*) from club_role_audit() where i_issue = 'ORPHAN_PERMS'$q$, 1);
select td('B 점검', '[회장] 점검 목록 조회 불가', 2, $q$select * from club_role_audit()$q$, 'deny');
select td('B 점검', '[일반 회원] 점검 목록 조회 불가', 4, $q$select * from club_role_audit()$q$, 'deny');

-- ===== C. 직책 변경 규칙 =====
select td('C 직책변경', '[총무] 직접 UPDATE 로 본인을 회장으로', 3, $q$update club_members set role_label = '회장' where id = test_mid(test_c(1), test_u(3))$q$, 'deny');
select td('C 직책변경', '[총무] 직접 UPDATE 로 회원을 총무로', 3, $q$update club_members set role_label = '총무' where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('C 직책변경', '[회장] 직접 UPDATE 로 직책 변경(전용 기능만 허용)', 2, $q$update club_members set role_label = '총무' where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('C 직책변경', '[통합관리자] 직접 UPDATE 로 직책 변경(전용 기능만 허용)', 1, $q$update club_members set role_label = '총무' where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('C 직책변경', '[총무] 전용 기능 호출 불가', 3, $q$select set_member_role(test_mid(test_c(1), test_u(4)), '총무')$q$, 'deny');
select td('C 직책변경', '[일반 회원] 전용 기능 호출 불가', 5, $q$select set_member_role(test_mid(test_c(1), test_u(4)), '총무')$q$, 'deny');
select td('C 직책변경', '[회장] 회원 → 총무', 2, $q$select set_member_role(test_mid(test_c(1), test_u(4)), '총무')$q$, 'allow');
select tn('C 직책변경', '  → 직책 총무·운영진 자동 ON', $q$select count(*) from club_members where id = test_mid(test_c(1), test_u(4)) and role_label = '총무' and is_staff$q$, 1);
select tn('C 직책변경', '  → 운영진 권한 6개 자동 부여', $q$select count(*) from user_permissions where user_id = test_u(4) and club_id = test_c(1)$q$, 6);
select td('C 직책변경', '[회장] 총무 → 회원', 2, $q$select set_member_role(test_mid(test_c(1), test_u(4)), '회원')$q$, 'allow');
select tn('C 직책변경', '  → 운영진 자동 OFF, 일반 권한 3개만 남음', $q$select count(*) from user_permissions where user_id = test_u(4) and club_id = test_c(1)$q$, 3);
select tn('C 직책변경', '  → 운영진 승인 권한이 회수됨', $q$select count(*) from user_permissions where user_id = test_u(4) and club_id = test_c(1) and permission_code = 'CLUB_MEMBER_APPROVE'$q$, 0);
select td('C 직책변경', '[회장] 다른 동호회(club4) 회원의 직책 변경 불가', 2, $q$select set_member_role(test_mid(test_c(4), test_u(15)), '총무')$q$, 'deny');
select td('C 직책변경', '[회장] 직책을 회장으로 지정 불가(교체 기능 사용)', 2, $q$select set_member_role(test_mid(test_c(1), test_u(5)), '회장')$q$, 'deny');
select td('C 직책변경', '[회장] 회장 본인의 직책을 전용 기능으로 변경 불가', 2, $q$select set_member_role(test_mid(test_c(1), test_u(2)), '총무')$q$, 'deny');
select td('C 직책변경', '[통합관리자] 가입 대기 회원의 직책 변경 불가', 1, $q$select set_member_role(test_mid(test_c(1), test_u(6)), '총무')$q$, 'deny');
select td('C 직책변경', '[통합관리자] 잘못된 직책(부회장) 회원을 회원으로 바로잡기', 1, $q$select set_member_role(test_mid(test_c(1), test_u(10)), '회원')$q$, 'allow');
select tnu('C 직책변경', '  → 이상한 직책 점검 항목이 0건', 1, $q$select count(*) from club_role_audit() where i_issue = 'BAD_ROLE'$q$, 0);
select td('C 직책변경', '[통합관리자] 총무 지정', 1, $q$select set_member_role(test_mid(test_c(1), test_u(5)), '총무')$q$, 'allow');

-- ===== D. 회장 교체 =====
select td('D 회장교체', '[총무] 회장 교체 불가', 3, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(5)), '총무')$q$, 'deny');
select td('D 회장교체', '[일반 회원] 회장 교체 불가', 4, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(5)), '총무')$q$, 'deny');
select td('D 회장교체', '[회장] 기존 회장의 새 직책을 안 고르면 불가', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(3)), null)$q$, 'deny');
select td('D 회장교체', '[회장] 기존 회장을 "회장"으로 내리는 값은 불가', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(3)), '회장')$q$, 'deny');
select td('D 회장교체', '[회장] 가입 대기 회원을 새 회장으로 지정 불가', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(6)), '총무')$q$, 'deny');
select td('D 회장교체', '[회장] 다른 동호회 회원을 새 회장으로 지정 불가', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(4), test_u(15)), '총무')$q$, 'deny');
select td('D 회장교체', '[회장] 본인을 새 회장으로 지정 불가(이미 회장)', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(2)), '총무')$q$, 'deny');
select td('D 회장교체', '[회장] 총무(3)를 새 회장으로, 본인은 총무로', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(3)), '총무', '교체 테스트')$q$, 'allow');
select tn('D 회장교체', '  → 회장은 정확히 1명', $q$select count(*) from club_members where club_id = test_c(1) and status = 'approved' and role_label = '회장'$q$, 1);
select tn('D 회장교체', '  → 새 회장이 3번 사용자', $q$select count(*) from club_members where club_id = test_c(1) and user_id = test_u(3) and role_label = '회장'$q$, 1);
select tn('D 회장교체', '  → 기존 회장(2)은 총무로, 운영진 유지', $q$select count(*) from club_members where club_id = test_c(1) and user_id = test_u(2) and role_label = '총무' and is_staff$q$, 1);
select tn('D 회장교체', '  → 이력 1건(누가·언제·누구로)', $q$select count(*) from club_chair_history where club_id = test_c(1) and old_chair_user_id = test_u(2) and new_chair_user_id = test_u(3) and old_chair_new_role = '총무' and changed_by = test_u(2) and changed_at is not null and note = '교체 테스트'$q$, 1);
select td('D 회장교체', '[예전 회장(지금은 총무)] 다시 교체 불가', 2, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(2)), '총무')$q$, 'deny');
select td('D 회장교체', '[새 회장] 회원(4)에게 넘기고 본인은 회원으로', 3, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(4)), '회원')$q$, 'allow');
select tn('D 회장교체', '  → 내려간 회장은 운영진 OFF·일반 권한 3개', $q$select count(*) from user_permissions where user_id = test_u(3) and club_id = test_c(1)$q$, 3);
select tn('D 회장교체', '  → 새 회장(4)은 운영진 권한 6개', $q$select count(*) from user_permissions where user_id = test_u(4) and club_id = test_c(1)$q$, 6);
select tn('D 회장교체', '  → 이력 누적 2건', $q$select count(*) from club_chair_history where club_id = test_c(1)$q$, 2);
select td('D 회장교체', '[통합관리자] 회장이 없는 club2 에 회장 지정(기존 회장 없음)', 1, $q$select change_club_chair(test_c(2), test_mid(test_c(2), test_u(13)), null)$q$, 'allow');
select tn('D 회장교체', '  → club2 이력의 기존 회장은 비어 있음(공석이었음)', $q$select count(*) from club_chair_history where club_id = test_c(2) and old_chair_user_id is null and new_chair_user_id = test_u(13)$q$, 1);
select td('D 회장교체', '[통합관리자] 회장이 2명인 club3 에서는 교체 불가(먼저 정리)', 1, $q$select change_club_chair(test_c(3), test_mid(test_c(3), test_u(11)), '회원')$q$, 'deny');
select td('D 회장교체', '[통합관리자] 중복 회장 중 한 명을 총무로 내리기(정리)', 1, $q$select set_member_role(test_mid(test_c(3), test_u(12)), '총무')$q$, 'allow');
select tnu('D 회장교체', '  → 회장 2명 점검 항목이 0건', 1, $q$select count(*) from club_role_audit() where i_issue = 'MULTI_CHAIR'$q$, 0);
select td('D 회장교체', '[회장] 일반 회원(5)을 정리하려는 회장 중복 정리는 통합관리자 전용', 11, $q$select set_member_role(test_mid(test_c(3), test_u(11)), '회원')$q$, 'deny');

-- ===== E. 회장 1명·공석 방지 (API 로 직접 시도) =====
select td('E 공석방지', '[통합관리자] 이미 회장이 있는 동호회에 두 번째 회장 직접 삽입', 1, $q$insert into club_members(club_id, user_id, role_label, status) values (test_c(1), test_u(16), '회장', 'approved')$q$, 'deny');
select td('E 공석방지', '[회장] 본인 가입 상태를 탈회로 직접 변경', 4, $q$update club_members set status = 'withdrawn' where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('E 공석방지', '[통합관리자] 회장 행을 직접 탈회 처리', 1, $q$update club_members set status = 'withdrawn' where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('E 공석방지', '[통합관리자] 회장 행을 직접 삭제', 1, $q$delete from club_members where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('E 공석방지', '[총무(2)] 회장 행을 직접 삭제', 2, $q$delete from club_members where id = test_mid(test_c(1), test_u(4))$q$, 'deny');
select td('E 공석방지', '[총무(2)] 회원 행을 총무로 직접 삽입', 2, $q$insert into club_members(club_id, user_id, role_label, status) values (test_c(1), test_u(16), '총무', 'approved')$q$, 'deny');
do $$ begin
  begin
    update club_members set role_label = '회원' where id = test_mid(test_c(1), test_u(4));
    raise exception 'OK_REACHED';
  exception when others then
    insert into results values ('E 공석방지', '[DB 직접 작업(SQL Editor)] 비상 수정은 허용', 'allow', case when sqlerrm = 'OK_REACHED' then 'allow' else 'deny: ' || sqlerrm end, sqlerrm = 'OK_REACHED');
  end;
end $$;

-- ===== F. 가입·승인·탈회 시 권한 자동 부여/회수 =====
select td('F 자동권한', '[신규(16)] 동호회 가입 신청', 16, $q$insert into club_members(club_id, user_id, role_label, status) values (test_c(1), test_u(16), '회원', 'pending')$q$, 'allow');
select td('F 자동권한', '[신규(16)] 가입 신청을 직책 총무로 시도', 17, $q$insert into club_members(club_id, user_id, role_label, status) values (test_c(1), test_u(17), '총무', 'pending')$q$, 'deny');
select td('F 자동권한', '[회장(4)] 가입 승인', 4, $q$update club_members set status = 'approved' where id = test_mid(test_c(1), test_u(16))$q$, 'allow');
select tn('F 자동권한', '  → 일반 권한 3개 자동 부여(승인 시 따로 권한 부여 불필요)', $q$select count(*) from user_permissions where user_id = test_u(16) and club_id = test_c(1)$q$, 3);
select tn('F 자동권한', '  → 운영진 권한은 없음', $q$select count(*) from user_permissions where user_id = test_u(16) and club_id = test_c(1) and permission_code = 'CLUB_MEMBER_APPROVE'$q$, 0);
select td('F 자동권한', '[일반 회원(16)] 공지(일반글) 작성 가능', 16, $q$insert into posts(club_id, author_id, type, title) values (test_c(1), test_u(16), 'notice', '공지')$q$, 'allow');
select td('F 자동권한', '[일반 회원(16)] 활동보고서 작성 불가', 16, $q$insert into posts(club_id, author_id, type, title) values (test_c(1), test_u(16), 'report', '보고')$q$, 'deny');
select td('F 자동권한', '[회장(4)] 활동보고서 작성 가능', 4, $q$insert into posts(club_id, author_id, type, title) values (test_c(1), test_u(4), 'report', '보고')$q$, 'allow');
select td('F 자동권한', '[회원(16)] 탈회 신청 표시', 16, $q$update club_members set withdrawal_requested = true where id = test_mid(test_c(1), test_u(16))$q$, 'allow');
select td('F 자동권한', '[회원(16)] 본인 직책을 직접 변경', 16, $q$update club_members set role_label = '총무' where id = test_mid(test_c(1), test_u(16))$q$, 'deny');
select td('F 자동권한', '[회장(4)] 탈회 승인(회원)', 4, $q$update club_members set status = 'withdrawn', withdrawal_requested = false where id = test_mid(test_c(1), test_u(16))$q$, 'allow');
select tn('F 자동권한', '  → 탈회 후 동호회 권한 전부 자동 회수', $q$select count(*) from user_permissions where user_id = test_u(16) and club_id = test_c(1)$q$, 0);
select td('F 자동권한', '[통합관리자] 동호회 개설 승인: 새 동호회 생성', 1, $q$insert into clubs(id, name) values (test_c(9), '새동호회')$q$, 'allow');
select td('F 자동권한', '[통합관리자] 개설 승인: 신청자(17)를 회장으로 등록', 1, $q$insert into club_members(club_id, user_id, role_label, status) values (test_c(9), test_u(17), '회장', 'approved')$q$, 'allow');
select tn('F 자동권한', '  → 새 회장에게 운영진 권한 6개 자동 부여(개설 승인 시 따로 권한 부여 불필요)', $q$select count(*) from user_permissions where user_id = test_u(17) and club_id = test_c(9)$q$, 6);

-- ===== G. 점검 화면 조치(확인 후 하나씩) =====
select td('G 조치', '[회장(4)] 권한 맞추기 실행 불가', 4, $q$select resync_member_permissions(test_mid(test_c(1), test_u(8)))$q$, 'deny');
select td('G 조치', '[통합관리자] 권한 과다(8번) 맞추기', 1, $q$select resync_member_permissions(test_mid(test_c(1), test_u(8)))$q$, 'allow');
select tn('G 조치', '  → 8번: 운영진 권한이 회수되고 일반 권한 3개', $q$select count(*) from user_permissions where user_id = test_u(8) and club_id = test_c(1)$q$, 3);
select td('G 조치', '[통합관리자] 권한 부족(9번 총무) 맞추기', 1, $q$select resync_member_permissions(test_mid(test_c(1), test_u(9)))$q$, 'allow');
select tn('G 조치', '  → 9번: 운영진 권한 6개', $q$select count(*) from user_permissions where user_id = test_u(9) and club_id = test_c(1)$q$, 6);
select td('G 조치', '[회원] 남은 권한 회수 실행 불가', 5, $q$select revoke_orphan_permissions(test_u(7), test_c(1))$q$, 'deny');
select td('G 조치', '[통합관리자] 승인 회원의 권한은 "남은 권한 회수"로 지울 수 없음', 1, $q$select revoke_orphan_permissions(test_u(5), test_c(1))$q$, 'deny');
select td('G 조치', '[통합관리자] 외부인(7)에게 남은 동호회 권한 회수', 1, $q$select revoke_orphan_permissions(test_u(7), test_c(1))$q$, 'allow');
select tn('G 조치', '  → 외부인의 동호회 권한 0개', $q$select count(*) from user_permissions where user_id = test_u(7) and club_id = test_c(1)$q$, 0);
select tnu('G 조치', '모든 조치 후 점검 목록이 비어 있음(회장 공석 포함)', 1, $q$select count(*) from club_role_audit()$q$, 0);

-- ===== H. 이력·수동 권한 편집·함수 노출 =====
select td('H 이력', '[동호회 회원] 회장 교체 이력 조회', 5, $q$select * from club_chair_history where club_id = test_c(1)$q$, 'allow');
select td('H 이력', '[동호회와 무관한 사용자(7)] 이력 조회 불가', 7, $q$select * from club_chair_history where club_id = test_c(1)$q$, 'deny');
select td('H 이력', '[통합관리자] 전체 이력 조회', 1, $q$select * from club_chair_history$q$, 'allow');
select td('H 이력', '[통합관리자] 이력 직접 추가 불가(전용 기능으로만 기록)', 1, $q$insert into club_chair_history(club_id, new_chair_user_id) values (test_c(1), test_u(5))$q$, 'deny');
select td('H 이력', '[통합관리자] 이력 직접 삭제 불가', 1, $q$delete from club_chair_history$q$, 'deny');
select td('H 이력', '[회장] 이력 직접 수정 불가', 4, $q$update club_chair_history set note = 'x'$q$, 'deny');
select td('I 수동편집차단', '[회장] 회원에게 동호회 권한 직접 부여 불가(04 정책 제거됨)', 4, $q$insert into user_permissions(user_id, permission_code, club_id) values (test_u(5), 'CLUB_REPORT_WRITE', test_c(1))$q$, 'deny');
select td('I 수동편집차단', '[회장] 회원의 동호회 권한 직접 삭제 불가', 4, $q$delete from user_permissions where user_id = test_u(5) and club_id = test_c(1)$q$, 'deny');
select td('I 수동편집차단', '[통합관리자] 비상용 직접 편집은 가능(전사 관리자 정책 유지)', 1, $q$insert into user_permissions(user_id, permission_code, club_id) values (test_u(16), 'CLUB_VIEW', test_c(1))$q$, 'allow');
select td('J 함수노출', '[비로그인] 직책 변경 기능 호출 불가', -1, $q$select set_member_role(test_mid(test_c(1), test_u(5)), '회원')$q$, 'deny');
select td('J 함수노출', '[비로그인] 회장 교체 기능 호출 불가', -1, $q$select change_club_chair(test_c(1), test_mid(test_c(1), test_u(5)), '회원')$q$, 'deny');
select td('J 함수노출', '[로그인 사용자] 권한 동기화 내부 함수 직접 호출 불가', 4, $q$select sync_member_club_permissions(test_u(5), test_c(1))$q$, 'deny');
select td('J 함수노출', '[로그인 사용자] 직책 가드 트리거 함수 직접 호출 불가', 4, $q$select guard_club_member_roles()$q$, 'deny');

select grp, label, expect, got from results where not pass order by grp, label;
select grp, count(*) filter (where pass) as 통과, count(*) filter (where not pass) as 실패 from results group by grp order by grp;
select count(*) filter (where pass) as 전체통과, count(*) filter (where not pass) as 전체실패 from results;
