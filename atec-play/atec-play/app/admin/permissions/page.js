import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import PermissionsManager from "./PermissionsManager";

import { ok } from "@/lib/db";
export default async function AdminPermissionsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "PERM_MANAGE")) redirect("/dashboard");

  const supabase = createClient();
  const [{ data: users }, { data: allPerms }, { data: master }] = (await Promise.all([
    supabase
      .from("users")
      .select("id, name, company:company_id(id, name), club_members!user_id(status, role_label, is_staff, club:club_id(id, name))")
      .eq("status", "approved")
      .order("name"),
    supabase.from("user_permissions").select("id, user_id, club_id, company_id, permission_code"),
    supabase.from("permissions").select("code, name, description").order("code"),
  ])).map((r) => ok(r, "권한 설정 데이터"));

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/permissions" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>계정별 권한(기능 토글) 설정</h1>
          </div>
        </div>
        <PermissionsManager
          users={users || []}
          allPerms={allPerms || []}
          master={master || []}
        />
      </div>
    </div>
  );
}
