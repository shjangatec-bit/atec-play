import { createClient } from "./supabase/server";
export { hasPermission } from "./permissions";

// 현재 로그인한 계정의 users 프로필 + 보유 권한(user_permissions) 목록을 함께 가져옵니다.
export async function getCurrentProfile() {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return { authUser: null, profile: null, permissions: [] };

  const { data: profile } = await supabase
    .from("users")
    .select("*, company:company_id(id, name)")
    .eq("id", authUser.id)
    .single();

  const { data: permRows } = await supabase
    .from("user_permissions")
    .select("permission_code, club_id, company_id")
    .eq("user_id", authUser.id);

  return { authUser, profile, permissions: permRows || [] };
}
