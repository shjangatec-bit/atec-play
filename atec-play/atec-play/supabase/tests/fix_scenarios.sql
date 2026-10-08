-- psql 변수: ex = 취약점 시도 결과 기대값('allow'=아직 뚫림, 'deny'=차단), opt = 선택 적용(04) 여부(1/0)
insert into companies(id,name) values ('c0000000-0000-0000-0000-000000000001','A사'),('c0000000-0000-0000-0000-000000000002','B사');
insert into users(id,email,name,company_id,status) values
 ('a0000000-0000-0000-0000-000000000001','admin@x','관리자','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000002','leader@x','회장','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000003','member@x','회원','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000004','pending@x','대기','c0000000-0000-0000-0000-000000000001','pending'),
 ('a0000000-0000-0000-0000-000000000005','pay@x','지급담당','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000006','acc@x','계정담당','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000007','other@x','타회원','c0000000-0000-0000-0000-000000000002','approved');
insert into clubs(id,name) values ('d0000000-0000-0000-0000-000000000001','축구'),('d0000000-0000-0000-0000-000000000002','독서');
insert into club_members(club_id,user_id,role_label,status) values
 ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','회장','approved'),
 ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','회원','approved'),
 ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000007','회원','pending');
insert into user_permissions(user_id,permission_code,club_id,company_id) values
 ('a0000000-0000-0000-0000-000000000001','ACC_APPROVE',null,null),('a0000000-0000-0000-0000-000000000001','ACC_MANAGE',null,null),
 ('a0000000-0000-0000-0000-000000000001','PERM_MANAGE',null,null),('a0000000-0000-0000-0000-000000000001','CLUB_CREATE_APPROVE',null,null),
 ('a0000000-0000-0000-0000-000000000001','CLUB_CLOSE_APPROVE',null,null),
 ('a0000000-0000-0000-0000-000000000002','CLUB_MEMBER_APPROVE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000002','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000002','CLUB_REPORT_WRITE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000003','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000003','CLUB_BUDGET_VIEW','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000005','CLUB_BUDGET_DISBURSE',null,'c0000000-0000-0000-0000-000000000001'),
 ('a0000000-0000-0000-0000-000000000006','ACC_APPROVE',null,null);
insert into posts(id,club_id,author_id,type,title) values
 ('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','notice','공지');
insert into club_budget_disbursements(club_id,company_id,status) values ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','unpaid');

create table results(grp text, label text, expect text, got text, pass boolean);
create function td(p_grp text, p_label text, p_uid text, p_sql text, p_expect text) returns void language plpgsql as $$
declare n int; got text;
begin
  begin
    execute 'set local role ' || case when p_uid is null then 'anon' else 'authenticated' end;
    perform set_config('request.jwt.claim.sub', coalesce(p_uid,''), true);
    execute p_sql; get diagnostics n = row_count;
    got := case when n > 0 then 'allow' else 'deny' end;
  exception when others then got := 'deny';
  end;
  reset role;
  insert into results values (p_grp, p_label, p_expect, got, got = p_expect);
end $$;

\set admin  '''a0000000-0000-0000-0000-000000000001'''
\set leader '''a0000000-0000-0000-0000-000000000002'''
\set member '''a0000000-0000-0000-0000-000000000003'''
\set pend   '''a0000000-0000-0000-0000-000000000004'''
\set pay    '''a0000000-0000-0000-0000-000000000005'''
\set acc    '''a0000000-0000-0000-0000-000000000006'''
\set other  '''a0000000-0000-0000-0000-000000000007'''
\set newu   '''b0000000-0000-0000-0000-000000000009'''

-- ===== 취약점 시도 =====
select td('취약점','[가입대기] 본인 status 를 approved 로 변경(스스로 승인)', :pend, $q$update users set status='approved' where id='a0000000-0000-0000-0000-000000000004'$q$, :'ex');
select td('취약점','[신규가입] status=approved 로 가입', :newu, $q$insert into users(id,email,name,status) values ('b0000000-0000-0000-0000-000000000009','n@x','신규','approved')$q$, :'ex');
select td('취약점','[일반회원] 동호회에 스스로 회장·approved 로 삽입', :member, $q$insert into club_members(club_id,user_id,role_label,status) values ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','회장','approved')$q$, :'ex');
select td('취약점','[일반회원] 본인 가입행 직책을 회장으로 변경', :member, $q$update club_members set role_label='회장' where user_id='a0000000-0000-0000-0000-000000000003' and club_id='d0000000-0000-0000-0000-000000000001'$q$, :'ex');
select td('취약점','[가입대기 회원] 본인 가입 신청을 스스로 approved 로 변경', :other, $q$update club_members set status='approved' where user_id='a0000000-0000-0000-0000-000000000007' and club_id='d0000000-0000-0000-0000-000000000002'$q$, :'ex');
select td('취약점','[비로그인] club_members 전체 조회', null, $q$select * from club_members$q$, :'ex');
select td('취약점','[비로그인] clubs 전체 조회', null, $q$select * from clubs$q$, :'ex');
select td('취약점','[일반 글쓰기 권한자] 활동보고서(지원금 근거) 작성', :member, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','report','보고서')$q$, :'ex');

-- ===== 정상 업무 (수정 전후 모두 허용되어야 함) =====
select td('정상','[신규가입] pending 으로 가입', 'b0000000-0000-0000-0000-00000000000a', $q$insert into users(id,email,name,status) values ('b0000000-0000-0000-0000-00000000000a','n2@x','신규2','pending')$q$, 'allow');
select td('정상','[일반회원] 동호회 가입 신청(pending/회원)', :member, $q$insert into club_members(club_id,user_id,role_label,status) values ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','회원','pending')$q$, 'allow');
select td('정상','[일반회원] 탈회 신청 표시', :member, $q$update club_members set withdrawal_requested=true where user_id='a0000000-0000-0000-0000-000000000003' and club_id='d0000000-0000-0000-0000-000000000001'$q$, 'allow');
select td('정상','[계정담당] 계정 승인(users.status 변경)', :acc, $q$update users set status='approved' where id='a0000000-0000-0000-0000-000000000004'$q$, 'allow');
select td('정상','[통합관리자] 계정 승인', :admin, $q$update users set status='approved' where id='a0000000-0000-0000-0000-000000000004'$q$, 'allow');
select td('정상','[회장] 가입 신청 승인 처리', :leader, $q$update club_members set processed_by='a0000000-0000-0000-0000-000000000002' where club_id='d0000000-0000-0000-0000-000000000001' and user_id='a0000000-0000-0000-0000-000000000003'$q$, 'allow');
select td('정상','[회장] 회원 탈회 처리(status 변경)', :leader, $q$update club_members set status='withdrawn' where club_id='d0000000-0000-0000-0000-000000000001' and user_id='a0000000-0000-0000-0000-000000000003'$q$, 'allow');
select td('정상','[통합관리자] 직책(role_label) 변경', :admin, $q$update club_members set role_label='총무' where club_id='d0000000-0000-0000-0000-000000000001' and user_id='a0000000-0000-0000-0000-000000000003'$q$, 'allow');
select td('정상','[회장] 공지 작성', :leader, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','notice','새공지')$q$, 'allow');
select td('정상','[회장] 활동보고서 작성(보고서 권한 보유)', :leader, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','report','보고')$q$, 'allow');
select td('정상','[일반회원] 댓글 작성', :other, $q$insert into post_comments(post_id,author_id,content) values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000007','hi')$q$, 'allow');
select td('정상','[지급담당] 자사 지원금 지급 처리', :pay, $q$update club_budget_disbursements set status='paid' where company_id='c0000000-0000-0000-0000-000000000001'$q$, 'allow');
select td('정상','[통합관리자] 동호회 폐설 처리', :admin, $q$update clubs set status='closed' where name='독서'$q$, 'allow');
select td('정상','[비로그인] 회사 목록 조회(회원가입 화면)', null, $q$select * from companies$q$, 'allow');
select td('정상','[승인회원] 동호회 목록 조회', :other, $q$select * from clubs$q$, 'allow');
select td('정상','[승인회원] 동호회 회원 조회', :other, $q$select * from club_members$q$, 'allow');
select td('정상','[가입대기] 로그인 직후 본인 상태 조회', :pend, $q$select * from users where id='a0000000-0000-0000-0000-000000000004'$q$, 'allow');
select td('정상','[가입대기] 동호회 목록 조회(게스트 열람)', :pend, $q$select * from clubs$q$, 'allow');

-- ===== 선택 적용(04) 관련 : opt=1 일 때 허용/차단이 바뀌는 항목 =====
select td('선택04','[회장] 같은 동호회 회원에게 권한 부여', :leader, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','CLUB_VIEW','d0000000-0000-0000-0000-000000000001')$q$, :'optexp');
select td('선택04','[회장] 소개글 수정', :leader, $q$update clubs set description='소개' where id='d0000000-0000-0000-0000-000000000001'$q$, :'optexp');
select td('선택04','[계정담당] 신규 회원 기본 권한 부여', :acc, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000004','CLUB_CREATE_REQUEST')$q$, :'optexp');
select td('선택04','[예산조회권 없는 회원] 타 회사 지원금 지급내역 조회', :other, $q$select * from club_budget_disbursements$q$, :'optrev');
select td('선택04','[예산조회권 있는 회원] 자기 동호회 지급내역 조회', :member, $q$select * from club_budget_disbursements$q$, 'allow');
-- 선택 적용 여부와 무관하게 항상 차단되어야 하는 것
select td('항상차단','[회장] 다른 동호회(c2) 권한 부여', :leader, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000002')$q$, 'deny');
select td('항상차단','[회장] 전사 권한 부여', :leader, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000003','CLUB_POST_WRITE')$q$, 'deny');
select td('항상차단','[회장] 허용 목록 밖 권한(ACC_APPROVE) 을 동호회 범위로 부여', :leader, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','ACC_APPROVE','d0000000-0000-0000-0000-000000000001')$q$, 'deny');
select td('항상차단','[회장] 동호회 운영 상태를 closed 로 변경', :leader, $q$update clubs set status='closed' where id='d0000000-0000-0000-0000-000000000001'$q$, 'deny');
select td('항상차단','[일반회원] 본인에게 관리자 권한 부여', :member, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000003','PERM_MANAGE')$q$, 'deny');
select td('항상차단','[계정담당] PERM_MANAGE 같은 상위 권한 부여', :acc, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000004','PERM_MANAGE')$q$, 'deny');
select td('항상차단','[지급담당] 타사(B사) 지원금 지급 처리', :pay, $q$insert into club_budget_disbursements(club_id,company_id,status) values ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','paid')$q$, 'deny');

select grp, label, expect, got from results where not pass order by grp, label;
select grp, count(*) filter (where pass) as 통과, count(*) filter (where not pass) as 실패 from results group by grp order by grp;
