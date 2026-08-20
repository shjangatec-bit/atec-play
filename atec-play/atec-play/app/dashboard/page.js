import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function DashboardPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status === "pending") redirect("/pending");

  const supabase = createClient();
  const isAdmin = hasPermission(permissions, "ACC_APPROVE");

  const [{ count: pendingAccounts }, { count: activeClubs }, { count: totalUsers }, { count: pendingClubRequests }] =
    await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("clubs").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabase
        .from("club_lifecycle_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  const { data: myClubs } = await supabase
    .from("club_members")
    .select("status, club:club_id(id, name)")
    .eq("user_id", authUser.id)
    .eq("status", "approved");

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/dashboard" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈</div>
            <h1>대시보드</h1>
          </div>
        </div>

        {isAdmin ? (
          <div className="grid-4">
            <div className="card">
              <div className="metric-label">가입 승인 대기</div>
              <div className="metric-value">{pendingAccounts ?? 0}</div>
              <div className="metric-delta">건 처리 필요</div>
            </div>
            <div className="card">
              <div className="metric-label">동호회 개설/폐설 신청</div>
              <div className="metric-value">{pendingClubRequests ?? 0}</div>
              <div className="metric-delta">건 대기중</div>
            </div>
            <div className="card">
              <div className="metric-label">운영중 동호회</div>
              <div className="metric-value">{activeClubs ?? 0}</div>
              <div className="metric-delta">6개사 전체</div>
            </div>
            <div className="card">
              <div className="metric-label">전체 임직원</div>
              <div className="metric-value">{totalUsers ?? 0}</div>
              <div className="metric-delta">명 가입 승인 완료</div>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="section-title">내 동호회</div>
            {myClubs && myClubs.length > 0 ? (
              <table>
                <tbody>
                  {myClubs.map((m) => (
                    <tr key={m.club.id}>
                      <td>
                        <a href={`/clubs/${m.club.id}`}>{m.club.name}</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-note">아직 가입한 동호회가 없습니다. 동호회 목록에서 가입 신청해보세요.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
