-- 07 적용 "전"의 기존 데이터를 재현: 일부러 직책·권한이 어긋난 데이터를 섞어 둡니다.
create function test_u(n int) returns uuid language sql immutable as $$ select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function test_c(n int) returns uuid language sql immutable as $$ select ('d0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into companies(id, name) values ('c0000000-0000-0000-0000-000000000001', 'A사');
-- 사용자: 1 관리자, 2 회장(club1), 3 총무(club1), 4·5 회원(club1), 6 가입대기(club1), 7 외부인, 8 권한 과다, 9 권한 부족, 10 이상한 직책,
--        11·12 club3 회장 2명, 13·14 club2 회원(회장 없음), 15 club4 회장, 16 신규 가입자, 17 개설 신청자
insert into users(id, email, name, company_id, status)
select test_u(n), 'u' || n || '@x', 'U' || n, 'c0000000-0000-0000-0000-000000000001', 'approved' from generate_series(1, 17) n;
insert into clubs(id, name) select test_c(n), 'club' || n from generate_series(1, 4) n;

insert into club_members(club_id, user_id, role_label, status) values
 (test_c(1), test_u(2), '회장', 'approved'), (test_c(1), test_u(3), '총무', 'approved'),
 (test_c(1), test_u(4), '회원', 'approved'), (test_c(1), test_u(5), '회원', 'approved'),
 (test_c(1), test_u(6), '회원', 'pending'),
 (test_c(1), test_u(8), '회원', 'approved'),      -- 8: 직책은 회원인데 운영진 권한이 남아 있음(과다)
 (test_c(1), test_u(9), '총무', 'approved'),      -- 9: 총무인데 운영진 권한이 없음(부족)
 (test_c(1), test_u(10), '부회장', 'approved'),   -- 10: 알 수 없는 직책
 (test_c(3), test_u(11), '회장', 'approved'), (test_c(3), test_u(12), '회장', 'approved'),   -- 회장 2명
 (test_c(2), test_u(13), '회원', 'approved'), (test_c(2), test_u(14), '회원', 'approved'),   -- 회장 없음
 (test_c(4), test_u(15), '회장', 'approved');

-- 권한: 직책에 맞게 올바르게 들어 있는 것 + 일부러 어긋난 것
do $$
declare staff text[] := array['CLUB_MEMBER_APPROVE','CLUB_VIEW','CLUB_POST_WRITE','CLUB_REPORT_WRITE','CLUB_REPORT_VIEW','CLUB_BUDGET_VIEW'];
        base  text[] := array['CLUB_VIEW','CLUB_POST_WRITE','CLUB_BUDGET_VIEW'];
        r record; c text;
begin
  for r in select * from (values (2,1,true),(3,1,true),(4,1,false),(5,1,false),(10,1,false),(11,3,true),(12,3,true),(13,2,false),(14,2,false),(15,4,true)) v(u,cl,st) loop
    foreach c in array (case when r.st then staff else base end) loop
      insert into user_permissions(user_id, permission_code, club_id) values (test_u(r.u), c, test_c(r.cl));
    end loop;
  end loop;
  foreach c in array base loop insert into user_permissions(user_id, permission_code, club_id) values (test_u(8), c, test_c(1)); end loop;
  insert into user_permissions(user_id, permission_code, club_id) values (test_u(8), 'CLUB_MEMBER_APPROVE', test_c(1)), (test_u(8), 'CLUB_REPORT_WRITE', test_c(1));  -- 과다
  foreach c in array base loop insert into user_permissions(user_id, permission_code, club_id) values (test_u(9), c, test_c(1)); end loop;                              -- 부족(운영진 권한 3개 없음)
  insert into user_permissions(user_id, permission_code, club_id) values (test_u(7), 'CLUB_VIEW', test_c(1));                                                         -- 외부인에게 남은 권한
end $$;

-- 전사 권한(통합관리자)
insert into user_permissions(user_id, permission_code) values
 (test_u(1), 'PERM_MANAGE'), (test_u(1), 'ACC_MANAGE'), (test_u(1), 'ACC_APPROVE'), (test_u(1), 'CLUB_CREATE_APPROVE'), (test_u(1), 'CLUB_CLOSE_APPROVE');

create table snap as select * from user_permissions;   -- 07 적용 직전 스냅샷
