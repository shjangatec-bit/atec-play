-- 시드 (슈퍼유저라 RLS 우회)
insert into companies(id,name) values ('c0000000-0000-0000-0000-000000000001','A사'),('c0000000-0000-0000-0000-000000000002','B사');
insert into users(id,email,name,company_id,status) values
 ('a0000000-0000-0000-0000-000000000001','admin@x','관리자','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000002','leader@x','회장','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000003','member@x','회원','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000004','pending@x','대기','c0000000-0000-0000-0000-000000000001','pending'),
 ('a0000000-0000-0000-0000-000000000005','pay@x','지급담당','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000006','acc@x','계정담당','c0000000-0000-0000-0000-000000000001','approved'),
 ('a0000000-0000-0000-0000-000000000007','other@x','타회원','c0000000-0000-0000-0000-000000000002','approved'),
 ('a0000000-0000-0000-0000-000000000008','guest@x','게스트','c0000000-0000-0000-0000-000000000001','pending');
insert into clubs(id,name) values ('d0000000-0000-0000-0000-000000000001','축구'),('d0000000-0000-0000-0000-000000000002','독서');
insert into club_members(club_id,user_id,role_label,status) values
 ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000007','회원','pending'),
 ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','회장','approved'),
 ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','회원','approved');
insert into user_permissions(user_id,permission_code,club_id,company_id) values
 ('a0000000-0000-0000-0000-000000000001','ACC_APPROVE',null,null),
 ('a0000000-0000-0000-0000-000000000001','PERM_MANAGE',null,null),
 ('a0000000-0000-0000-0000-000000000001','CLUB_CLOSE_APPROVE',null,null),
 ('a0000000-0000-0000-0000-000000000001','CLUB_CREATE_APPROVE',null,null),
 ('a0000000-0000-0000-0000-000000000002','CLUB_MEMBER_APPROVE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000002','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000005','CLUB_BUDGET_DISBURSE',null,'c0000000-0000-0000-0000-000000000001'),
 ('a0000000-0000-0000-0000-000000000006','ACC_APPROVE',null,null);
insert into posts(id,club_id,author_id,type,title) values
 ('e0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','notice','공지'),
 ('e0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','report','보고서');
insert into club_budget_disbursements(club_id,company_id,status) values ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','unpaid');

create table results(label text, expect text, got text, pass boolean);
-- DML 테스트: 오류 없이 1행 이상 처리되면 'allow', 오류 또는 0행이면 'deny'
create function td(p_label text, p_uid text, p_sql text, p_expect text) returns void language plpgsql as $$
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
  insert into results values (p_label, p_expect, got, got = p_expect);
end $$;
-- SELECT 테스트: 보이는 행 수 비교
create function tc(p_label text, p_uid text, p_sql text, p_expect int) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute 'set local role ' || case when p_uid is null then 'anon' else 'authenticated' end;
    perform set_config('request.jwt.claim.sub', coalesce(p_uid,''), true);
    execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when others then n := -1;
  end;
  reset role;
  insert into results values (p_label, p_expect::text||'행', n::text||'행', (n = p_expect) or (p_expect = 0 and n = -1));
end $$;

\set admin    '''a0000000-0000-0000-0000-000000000001'''
\set leader   '''a0000000-0000-0000-0000-000000000002'''
\set member   '''a0000000-0000-0000-0000-000000000003'''
\set pend     '''a0000000-0000-0000-0000-000000000004'''
\set pay      '''a0000000-0000-0000-0000-000000000005'''
\set acc      '''a0000000-0000-0000-0000-000000000006'''
\set guest '''a0000000-0000-0000-0000-000000000008'''
\set other    '''a0000000-0000-0000-0000-000000000007'''
\set c1 'd0000000-0000-0000-0000-000000000001'
\set c2 'd0000000-0000-0000-0000-000000000002'

-- ===== 권한 상승 시도 (모두 deny 여야 함) =====
select td('[일반회원] 본인에게 전사 관리자 권한 부여', :member, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000003','ACC_APPROVE')$q$, 'deny');
select td('[일반회원] 본인에게 PERM_MANAGE 부여', :member, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000003','PERM_MANAGE')$q$, 'deny');
select td('[일반회원] 본인에게 동호회 회장 권한 부여', :member, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','CLUB_MEMBER_APPROVE','d0000000-0000-0000-0000-000000000001')$q$, 'deny');
select td('[가입대기] 본인 status 를 approved 로 변경', :pend, $q$update users set status='approved' where id='a0000000-0000-0000-0000-000000000004'$q$, 'deny');
select td('[일반회원] 타인 계정 status 변경', :member, $q$update users set status='rejected' where id='a0000000-0000-0000-0000-000000000007'$q$, 'deny');
select td('[신규가입] status=approved 로 users 행 삽입', 'b0000000-0000-0000-0000-000000000009', $q$insert into users(id,email,name,status) values ('b0000000-0000-0000-0000-000000000009','n@x','신규','approved')$q$, 'deny');
select td('[신규가입] 타인 id 로 users 행 삽입', 'b0000000-0000-0000-0000-000000000009', $q$insert into users(id,email,name,status) values ('b0000000-0000-0000-0000-00000000000a','n@x','신규','pending')$q$, 'deny');
select td('[회장] 전사(club null) 권한 부여', :leader, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000003','CLUB_POST_WRITE')$q$, 'deny');
select td('[회장] 다른 동호회(c2) 권한 부여', :leader, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000002')$q$, 'deny');
select td('[회장] 허용 목록 밖 코드(ACC_APPROVE) 를 club 범위로 부여', :leader, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','ACC_APPROVE','d0000000-0000-0000-0000-000000000001')$q$, 'deny');
select td('[회장] 동호회 status 를 closed 로 변경(트리거)', :leader, $q$update clubs set status='closed' where id='d0000000-0000-0000-0000-000000000001'$q$, 'deny');
select td('[회장] 다른 동호회(c2) 소개글 수정', :leader, $q$update clubs set description='x' where id='d0000000-0000-0000-0000-000000000002'$q$, 'deny');
select td('[일반회원] 가입 신청 시 role_label=회장', :member, $q$insert into club_members(club_id,user_id,role_label,status) values ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','회장','pending')$q$, 'deny');
select td('[일반회원] 가입 신청 시 status=approved', :member, $q$insert into club_members(club_id,user_id,role_label,status) values ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','회원','approved')$q$, 'deny');
select td('[일반회원] 타인 명의로 가입 신청', :member, $q$insert into club_members(club_id,user_id,role_label,status) values ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000007','회원','pending')$q$, 'deny');
select td('[일반회원] 본인 가입행 role_label 을 회장으로 변경', :member, $q$update club_members set role_label='회장' where user_id='a0000000-0000-0000-0000-000000000003'$q$, 'deny');
select td('[일반회원] 본인 가입대기 행을 스스로 approved 로 변경', :other, $q$update club_members set status='approved' where user_id='a0000000-0000-0000-0000-000000000007' and club_id='d0000000-0000-0000-0000-000000000002'$q$, 'deny');
select td('[회장] 다른 동호회(c2) 가입 승인', :leader, $q$update club_members set status='approved' where club_id='d0000000-0000-0000-0000-000000000002'$q$, 'deny');
select td('[계정담당] PERM_MANAGE 같은 상위 권한 부여', :acc, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000003','PERM_MANAGE')$q$, 'deny');
select td('[일반회원] 권한 없이 공지 작성', :member, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','notice','x')$q$, 'deny');
select td('[일반회원] 타인 명의로 게시글 작성', :leader, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','notice','x')$q$, 'deny');
select td('[일반회원] 타인 게시글 삭제', :member, $q$delete from posts where id='e0000000-0000-0000-0000-000000000001'$q$, 'deny');
select td('[일반회원] 타인 명의로 좋아요', :member, $q$insert into post_likes(post_id,user_id) values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000007')$q$, 'deny');
select td('[지급담당] 타사(B사) 지원금 지급 처리', :pay, $q$insert into club_budget_disbursements(club_id,company_id,status) values ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','paid')$q$, 'deny');
select td('[일반회원] 지원금 지급 처리', :member, $q$update club_budget_disbursements set status='paid'$q$, 'deny');
select td('[일반회원] 개설 신청서를 타인 명의로 제출', :member, $q$insert into club_lifecycle_requests(type,requester_id,status) values ('create','a0000000-0000-0000-0000-000000000007','pending')$q$, 'deny');
select td('[일반회원] 개설 신청을 스스로 approved 로 제출', :member, $q$insert into club_lifecycle_requests(type,requester_id,status) values ('create','a0000000-0000-0000-0000-000000000003','approved')$q$, 'deny');
select td('[일반회원] 동호회 직접 생성', :member, $q$insert into clubs(name) values ('몰래만든클럽')$q$, 'deny');
select td('[일반회원] 지원 단가 수정', :member, $q$insert into club_support_rates(club_id,unit_amount) values ('d0000000-0000-0000-0000-000000000001',999999)$q$, 'deny');
select td('[비로그인] users 에 행 삽입', null, $q$insert into users(id,email,name,status) values (gen_random_uuid(),'a@x','a','pending')$q$, 'deny');

-- ===== 정상 업무 (모두 allow 여야 함) =====
select td('[신규가입] 본인 id + pending 으로 users 삽입', 'b0000000-0000-0000-0000-000000000009', $q$insert into users(id,email,name,status) values ('b0000000-0000-0000-0000-000000000009','n@x','신규','pending')$q$, 'allow');
select td('[일반회원] 동호회 가입 신청(pending/회원)', :member, $q$insert into club_members(club_id,user_id,role_label,status) values ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','회원','pending')$q$, 'allow');
select td('[일반회원] 탈회 신청 표시', :member, $q$update club_members set withdrawal_requested=true where user_id='a0000000-0000-0000-0000-000000000003' and club_id='d0000000-0000-0000-0000-000000000001'$q$, 'allow');
select td('[일반회원] 댓글 작성', :member, $q$insert into post_comments(post_id,author_id,content) values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','hi')$q$, 'allow');
select td('[일반회원] 좋아요', :member, $q$insert into post_likes(post_id,user_id) values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003')$q$, 'allow');
select td('[일반회원] 본인 좋아요 취소', :member, $q$delete from post_likes where user_id='a0000000-0000-0000-0000-000000000003'$q$, 'allow');
select td('[회장] 같은 동호회 회원에게 권한 부여', :leader, $q$insert into user_permissions(user_id,permission_code,club_id) values ('a0000000-0000-0000-0000-000000000003','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000001')$q$, 'allow');
select td('[회장] 소개글 수정', :leader, $q$update clubs set description='소개' where id='d0000000-0000-0000-0000-000000000001'$q$, 'allow');
select td('[회장] 가입 신청 승인(c1 가입대기 건)', :leader, $q$update club_members set processed_by='a0000000-0000-0000-0000-000000000002' where club_id='d0000000-0000-0000-0000-000000000001' and user_id='a0000000-0000-0000-0000-000000000003'$q$, 'allow');
select td('[회장] 탈회 처리(status 변경)', :leader, $q$update club_members set status='withdrawn' where club_id='d0000000-0000-0000-0000-000000000001' and user_id='a0000000-0000-0000-0000-000000000003'$q$, 'allow');
select td('[회장] 탈회 회원 권한 회수', :leader, $q$delete from user_permissions where user_id='a0000000-0000-0000-0000-000000000003' and club_id='d0000000-0000-0000-0000-000000000001'$q$, 'allow');
select td('[회장] 공지 작성', :leader, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','notice','새공지')$q$, 'allow');
select td('[회장] 활동보고서 작성은 보고서 권한 없으면 거부', :leader, $q$insert into posts(club_id,author_id,type,title) values ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','report','보고')$q$, 'deny');
select td('[회장] 본인 게시글 삭제', :leader, $q$delete from posts where title='새공지'$q$, 'allow');
select td('[회장] 폐설 신청 제출', :leader, $q$insert into club_lifecycle_requests(type,club_id,requester_id,status) values ('close','d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','pending')$q$, 'allow');
select td('[계정담당] 계정 승인(users.status 변경)', :acc, $q$update users set status='approved', approved_by='a0000000-0000-0000-0000-000000000006' where id='a0000000-0000-0000-0000-000000000004'$q$, 'allow');
select td('[계정담당] 신규 승인 회원에게 기본 권한 부여', :acc, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000004','CLUB_CREATE_REQUEST')$q$, 'allow');
select td('[관리자] 임의 권한 부여(PERM_MANAGE)', :admin, $q$insert into user_permissions(user_id,permission_code) values ('a0000000-0000-0000-0000-000000000007','ORG_VIEW_COMPANY')$q$, 'allow');
select td('[관리자] 동호회 생성(개설 승인)', :admin, $q$insert into clubs(name) values ('신규클럽')$q$, 'allow');
select td('[관리자] 동호회 폐설(status 변경)', :admin, $q$update clubs set status='closed' where name='독서'$q$, 'allow');
select td('[관리자] 개설 신청 처리', :admin, $q$update club_lifecycle_requests set status='approved'$q$, 'allow');
select td('[관리자] 지원 단가 설정', :admin, $q$select 1$q$, 'allow');
select td('[지급담당] 자사(A사) 지원금 지급 처리', :pay, $q$update club_budget_disbursements set status='paid' where company_id='c0000000-0000-0000-0000-000000000001'$q$, 'allow');

-- ===== 조회 범위 =====
select tc('[비로그인] 회사 목록 조회(회원가입 화면)', null, 'select * from companies', 2);
select tc('[비로그인] users 조회 불가', null, 'select * from users', 0);
select tc('[비로그인] posts 조회 불가', null, 'select * from posts', 0);
select tc('[일반회원] users 명단 조회', :other, 'select * from users', 9);
select tc('[일반회원] 지원금 지급내역 조회 불가', :other, 'select * from club_budget_disbursements', 0);
select tc('[가입대기(게스트)] 공지 열람', :guest, $q$select * from posts where type='notice'$q$, 1);
select tc('[가입대기(게스트)] 활동보고서 열람 불가', :guest, $q$select * from posts where type='report'$q$, 0);
select tc('[승인회원] 활동보고서 열람', :other, $q$select * from posts where type='report'$q$, 1);
select tc('[가입대기] 본인 users 행 조회(로그인 직후 status 확인)', :pend, $q$select * from users where id='a0000000-0000-0000-0000-000000000004'$q$, 1);
select tc('[가입대기] 본인 권한 조회', :pend, $q$select * from user_permissions where user_id='a0000000-0000-0000-0000-000000000004'$q$, 1);
select tc('[지급담당] 자사 지급내역 조회', :pay, 'select * from club_budget_disbursements', 1);
select tc('[승인회원] 게시글 첨부/참석자 조회 가능(원글 열람 가능 시)', :other, 'select * from post_attachments', 0);

select pass, label, expect, got from results order by pass, label;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed, count(*) as total from results;
