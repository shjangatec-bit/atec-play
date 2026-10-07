-- 사용자 Supabase 의 기존 정책 39개를 그대로 재현 (pg_policies 조회 결과 기준) + 도우미 함수 모의 구현
create function public.has_global_perm(code text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from user_permissions up where up.user_id=auth.uid() and up.permission_code=code and up.club_id is null and up.company_id is null) $$;
create function public.has_club_perm(p_club uuid, code text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from user_permissions up where up.user_id=auth.uid() and up.permission_code=code and (up.club_id=p_club or (up.club_id is null and up.company_id is null))) $$;
create function public.has_company_perm(p_company uuid, code text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from user_permissions up where up.user_id=auth.uid() and up.permission_code=code and (up.company_id=p_company or (up.club_id is null and up.company_id is null))) $$;
create function public.is_approved() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from users u where u.id=auth.uid() and u.status='approved') $$;
grant execute on all functions in schema public to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['club_budget_disbursements','club_lifecycle_requests','club_members','club_support_rates','clubs','companies','permissions','post_attachments','post_attendees','post_comments','post_likes','posts','user_permissions','users'] loop
    execute format('alter table public.%I enable row level security', t); end loop; end $$;

create policy disb_write on club_budget_disbursements for all using (has_company_perm(company_id,'CLUB_BUDGET_DISBURSE')) with check (has_company_perm(company_id,'CLUB_BUDGET_DISBURSE'));
create policy disb_select on club_budget_disbursements for select using (is_approved());
create policy lifecycle_review on club_lifecycle_requests for all using (has_global_perm('CLUB_CREATE_APPROVE') or has_global_perm('CLUB_CLOSE_APPROVE')) with check (has_global_perm('CLUB_CREATE_APPROVE') or has_global_perm('CLUB_CLOSE_APPROVE'));
create policy lifecycle_insert on club_lifecycle_requests for insert with check (requester_id = auth.uid() and is_approved());
create policy lifecycle_select on club_lifecycle_requests for select using (requester_id = auth.uid() or is_approved());
create policy members_manage on club_members for all using (has_club_perm(club_id,'CLUB_MEMBER_APPROVE') or has_global_perm('CLUB_CREATE_APPROVE') or has_global_perm('ACC_MANAGE')) with check (has_club_perm(club_id,'CLUB_MEMBER_APPROVE') or has_global_perm('CLUB_CREATE_APPROVE') or has_global_perm('ACC_MANAGE'));
create policy members_insert_self on club_members for insert with check (user_id = auth.uid());
create policy members_select on club_members for select using (true);
create policy members_update_self on club_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rates_write on club_support_rates for all using (has_global_perm('CLUB_SUPPORT_RATE_EDIT')) with check (has_global_perm('CLUB_SUPPORT_RATE_EDIT'));
create policy rates_select on club_support_rates for select using (is_approved());
create policy clubs_write on clubs for all using (has_global_perm('CLUB_CREATE_APPROVE') or has_global_perm('CLUB_CLOSE_APPROVE')) with check (has_global_perm('CLUB_CREATE_APPROVE') or has_global_perm('CLUB_CLOSE_APPROVE'));
create policy clubs_select on clubs for select using (true);
create policy companies_write on companies for all using (has_global_perm('ACC_MANAGE')) with check (has_global_perm('ACC_MANAGE'));
create policy companies_select on companies for select using (true);
create policy permissions_write on permissions for all using (has_global_perm('PERM_MANAGE')) with check (has_global_perm('PERM_MANAGE'));
create policy permissions_select on permissions for select using (true);
create policy attach_write on post_attachments for all using (exists (select 1 from posts p where p.id = post_attachments.post_id and (p.author_id = auth.uid() or has_club_perm(p.club_id,'CLUB_MEMBER_APPROVE')))) with check (exists (select 1 from posts p where p.id = post_attachments.post_id and (p.author_id = auth.uid() or has_club_perm(p.club_id,'CLUB_MEMBER_APPROVE'))));
create policy attach_select on post_attachments for select using (is_approved());
create policy attendees_write on post_attendees for all using (exists (select 1 from posts p where p.id = post_attendees.post_id and has_club_perm(p.club_id,'CLUB_REPORT_WRITE'))) with check (exists (select 1 from posts p where p.id = post_attendees.post_id and has_club_perm(p.club_id,'CLUB_REPORT_WRITE')));
create policy attendees_select on post_attendees for select using (is_approved());
create policy comments_delete on post_comments for delete using (author_id = auth.uid());
create policy comments_insert on post_comments for insert with check (author_id = auth.uid() and is_approved());
create policy comments_select on post_comments for select using (is_approved());
create policy comments_update on post_comments for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy likes_delete on post_likes for delete using (user_id = auth.uid());
create policy likes_insert on post_likes for insert with check (user_id = auth.uid() and is_approved());
create policy likes_select on post_likes for select using (is_approved());
create policy posts_delete on posts for delete using (author_id = auth.uid() or has_club_perm(club_id,'CLUB_MEMBER_APPROVE'));
create policy posts_insert on posts for insert with check (author_id = auth.uid() and (has_club_perm(club_id,'CLUB_POST_WRITE') or has_club_perm(club_id,'CLUB_REPORT_WRITE')));
create policy posts_select on posts for select using (is_approved());
create policy posts_update on posts for update using (author_id = auth.uid() or has_club_perm(club_id,'CLUB_MEMBER_APPROVE')) with check (author_id = auth.uid() or has_club_perm(club_id,'CLUB_MEMBER_APPROVE'));
create policy user_permissions_write on user_permissions for all using (has_global_perm('PERM_MANAGE')) with check (has_global_perm('PERM_MANAGE'));
create policy user_permissions_select on user_permissions for select using (user_id = auth.uid() or is_approved());
create policy users_delete_admin on users for delete using (has_global_perm('ACC_MANAGE'));
create policy users_insert_self on users for insert with check (id = auth.uid());
create policy users_select on users for select using (id = auth.uid() or is_approved());
create policy users_update_admin on users for update using (has_global_perm('ACC_APPROVE') or has_global_perm('ACC_MANAGE')) with check (has_global_perm('ACC_APPROVE') or has_global_perm('ACC_MANAGE'));
create policy users_update_self on users for update using (id = auth.uid()) with check (id = auth.uid());
