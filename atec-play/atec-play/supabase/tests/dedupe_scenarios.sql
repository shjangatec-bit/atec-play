-- 앱과 같은 제약(user_id, club_id, permission_code)을 걸고 중복이 쌓이는 상황을 재현
alter table user_permissions add constraint up_uniq unique (user_id, club_id, permission_code);
insert into users(id,email,name,status) values ('a0000000-0000-0000-0000-000000000001','a@x','김다영','approved'),('a0000000-0000-0000-0000-000000000002','b@x','다른사람','approved');
insert into companies(id,name) values ('c0000000-0000-0000-0000-00000000000a','A사'),('c0000000-0000-0000-0000-00000000000b','B사');
insert into clubs(id,name) values ('d0000000-0000-0000-0000-000000000001','축구');
-- 앱의 upsert(onConflict user_id,club_id,permission_code + ignoreDuplicates) 와 동일한 SQL 을 3번 실행 → 전사 권한이 3줄로 쌓임
do $$ begin for i in 1..3 loop
  insert into user_permissions(user_id,permission_code,club_id,company_id) values ('a0000000-0000-0000-0000-000000000001','ACC_APPROVE',null,null)
  on conflict (user_id,club_id,permission_code) do nothing;
end loop; end $$;
-- 회사 범위: 같은 권한이 A사·B사 두 회사에 각각 (정상 — 지워지면 안 됨)
insert into user_permissions(user_id,permission_code,club_id,company_id) values
 ('a0000000-0000-0000-0000-000000000001','CLUB_BUDGET_DISBURSE',null,'c0000000-0000-0000-0000-00000000000a'),
 ('a0000000-0000-0000-0000-000000000001','CLUB_BUDGET_DISBURSE',null,'c0000000-0000-0000-0000-00000000000b');
-- 동호회 범위 + 다른 사람의 같은 권한(정상 — 지워지면 안 됨)
insert into user_permissions(user_id,permission_code,club_id,company_id) values
 ('a0000000-0000-0000-0000-000000000001','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000001',null),
 ('a0000000-0000-0000-0000-000000000002','ACC_APPROVE',null,null);
select '정리 전: 김다영 ACC_APPROVE 줄 수 = ' || count(*) as 상태 from user_permissions where user_id='a0000000-0000-0000-0000-000000000001' and permission_code='ACC_APPROVE';
\i supabase/05_dedupe_user_permissions.sql
select '정리 후: 김다영 ACC_APPROVE 줄 수 = ' || count(*) as 상태 from user_permissions where user_id='a0000000-0000-0000-0000-000000000001' and permission_code='ACC_APPROVE';
select '회사 범위(A사·B사) 권한 보존 = ' || count(*) || ' (기대 2)' as 상태 from user_permissions where permission_code='CLUB_BUDGET_DISBURSE';
select '동호회 범위 권한 보존 = ' || count(*) || ' (기대 1)' as 상태 from user_permissions where permission_code='CLUB_POST_WRITE';
select '다른 사람 권한 보존 = ' || count(*) || ' (기대 1)' as 상태 from user_permissions where user_id='a0000000-0000-0000-0000-000000000002';
-- 재발 방지: 앱이 하는 방식 그대로 다시 넣어도 늘어나지 않아야 함 (오류도 없어야 함)
do $$ begin for i in 1..3 loop
  insert into user_permissions(user_id,permission_code,club_id,company_id) values ('a0000000-0000-0000-0000-000000000001','ACC_APPROVE',null,null) on conflict (user_id,club_id,permission_code) do nothing;
  insert into user_permissions(user_id,permission_code,club_id,company_id) values ('a0000000-0000-0000-0000-000000000001','CLUB_POST_WRITE','d0000000-0000-0000-0000-000000000001',null) on conflict (user_id,club_id,permission_code) do nothing;
end loop; end $$;
-- 일반 insert(권한 설정 화면의 토글 켜기)도 중복이면 오류 없이 건너뜀
insert into user_permissions(user_id,permission_code,club_id,company_id) values ('a0000000-0000-0000-0000-000000000001','ACC_APPROVE',null,null);
select '재삽입 후 김다영 ACC_APPROVE 줄 수 = ' || count(*) || ' (기대 1)' as 상태 from user_permissions where user_id='a0000000-0000-0000-0000-000000000001' and permission_code='ACC_APPROVE';
-- 새 권한은 정상 추가
insert into user_permissions(user_id,permission_code,club_id,company_id) values ('a0000000-0000-0000-0000-000000000001','ORG_VIEW_ALL',null,null);
select '새 권한 정상 추가 = ' || count(*) || ' (기대 1)' as 상태 from user_permissions where permission_code='ORG_VIEW_ALL';
-- 이제 토글로 끄면(1줄 삭제) 실제로 회수되는지
delete from user_permissions where id = (select id from user_permissions where user_id='a0000000-0000-0000-0000-000000000001' and permission_code='ACC_APPROVE' limit 1);
select '토글 OFF 후 김다영 ACC_APPROVE 줄 수 = ' || count(*) || ' (기대 0 = 회수 성공)' as 상태 from user_permissions where user_id='a0000000-0000-0000-0000-000000000001' and permission_code='ACC_APPROVE';
