import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import AccountRow from "./AccountRow";

export default async function AdminAccountsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "ACC_APPROVE")) redirect("/dashboard");

  const supabase = createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, status, created_at, company:company_id(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/accounts" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>계정 가입 승인</h1>
          </div>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>이름</th><th>이메일</th><th>소속회사</th><th>신청일</th><th>상태</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <AccountRow key={u.id} user={u} approverId={authUser.id} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
