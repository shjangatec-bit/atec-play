import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import { ok } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import RoleAuditTable from "./RoleAuditTable";

export default async function RoleAuditPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "PERM_MANAGE") && !hasPermission(permissions, "ACC_MANAGE")) redirect("/dashboard");

  const supabase = createClient();
  // 점검 목록은 조회만 합니다. 자동으로 고치지 않으며, 아래 화면에서 확인 후 버튼을 눌러야 수정됩니다.
  const { data: issues } = ok(await supabase.rpc("club_role_audit"), "직책·권한 점검");
  const { data: history } = ok(await supabase
    .from("club_chair_history")
    .select("id, changed_at, old_chair_new_role, note, club:club_id(name), old_chair:old_chair_user_id(name), new_chair:new_chair_user_id(name), changer:changed_by(name)")
    .order("changed_at", { ascending: false })
    .limit(50), "회장 교체 이력");

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/role-audit" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>직책·권한 점검</h1>
          </div>
        </div>

        <RoleAuditTable issues={issues || []} />

        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">회장 교체 이력 (전체 동호회, 최근 50건)</div>
          {(history || []).length === 0 ? (
            <div className="empty-note">회장 교체 이력이 없습니다.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>일시</th>
                  <th>동호회</th>
                  <th>기존 회장</th>
                  <th>새 회장</th>
                  <th>기존 회장의 새 직책</th>
                  <th>변경한 사람</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(h.changed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                    <td>{h.club?.name || "-"}</td>
                    <td>{h.old_chair?.name || "(공석)"}</td>
                    <td>{h.new_chair?.name || "-"}</td>
                    <td>{h.old_chair_new_role || "-"}</td>
                    <td>{h.changer?.name || "-"}</td>
                    <td className="co-tag">{h.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
