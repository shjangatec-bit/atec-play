-- 09 되돌리기: 알림을 만드는 트리거·함수를 제거합니다.
-- notifications 표는 이미 쌓인 알림을 보존하기 위해 남겨 둡니다. (완전 삭제는 맨 아래 주석)
begin;

drop trigger if exists trg_notify_user_status on public.users;
drop trigger if exists trg_notify_club_member on public.club_members;
drop trigger if exists trg_notify_lifecycle   on public.club_lifecycle_requests;

drop function if exists public.trg_notify_user_status();
drop function if exists public.trg_notify_club_member();
drop function if exists public.trg_notify_lifecycle();
drop function if exists public.notify_club_staff(uuid, text, text, text, text, uuid);
drop function if exists public.notify_user(uuid, text, text, text, text);

notify pgrst, 'reload schema';
commit;

-- 알림 데이터까지 완전히 삭제하려면(되돌릴 수 없음):
-- drop table public.notifications;
