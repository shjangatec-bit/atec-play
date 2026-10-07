-- ============================================================
-- 06_revoke_function_execute.sql  —  Security Advisor 경고(0028·0029) 대응
--
-- 문제: SECURITY DEFINER 함수가 /rest/v1/rpc/함수명 주소로 비로그인(anon)·로그인 사용자에게 그대로 노출되어 있습니다.
--
-- 조치:
--  1) 트리거·이벤트 전용 함수 3개 → 누구도(anon, 로그인 사용자 포함) 직접 호출 못 하게 회수
--     (트리거는 실행 시 호출자의 EXECUTE 권한을 확인하지 않으므로 트리거 동작에는 영향이 없습니다.)
--  2) 권한 판단 함수 4개(has_*_perm, is_approved) → 비로그인(anon)만 회수, 로그인 사용자는 유지
--     (RLS 정책이 평가될 때 로그인 사용자 권한으로 이 함수들을 호출하므로 로그인 사용자 권한은 회수하면 안 됩니다.
--      이 함수들은 "호출한 본인"의 권한만 조회하므로 로그인 사용자에게 열려 있어도 정보가 새지 않습니다.)
--
-- 되돌리기(필요 시): 아래 revoke 를 grant 로 바꿔 실행
--   grant execute on function public.has_club_perm(uuid, text) to public;  (나머지 함수도 동일)
-- ============================================================
begin;

-- 1) 트리거·이벤트 전용 함수
revoke execute on function public.guard_users_update()              from public, anon, authenticated;
revoke execute on function public.skip_duplicate_user_permission()  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                 from public, anon, authenticated;

-- 2) 권한 판단 함수: 비로그인 차단, 로그인 사용자는 정책 평가를 위해 유지
revoke execute on function public.has_club_perm(uuid, text)    from public, anon;
revoke execute on function public.has_company_perm(uuid, text) from public, anon;
revoke execute on function public.has_global_perm(text)        from public, anon;
revoke execute on function public.is_approved()                from public, anon;

grant execute on function public.has_club_perm(uuid, text)    to authenticated;
grant execute on function public.has_company_perm(uuid, text) to authenticated;
grant execute on function public.has_global_perm(text)        to authenticated;
grant execute on function public.is_approved()                to authenticated;

commit;
