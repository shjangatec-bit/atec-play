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
  const isBudgetOfficer = hasPermission(permissions, "CLUB_BUDGET_DISBURSE", { companyId: profile.company_id });

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

  // 내가 가입한 동호회 (역할 포함)
  const { data: myClubs } = await supabase
    .from("club_members")
    .select("status, role_label, club:club_id(id, name)")
    .eq("user_id", authUser.id)
    .eq("status", "approved");

  // 내가 회장/총무인 동호회 각각의 가입 대기 인원, 최근 게시글
  const leaderClubIds = (myClubs || [])
    .filter((m) => m.role_label === "회장" || m.role_label === "총무")
    .map((m) => m.club.id);

  let pendingByClub = {};
  let recentPostsByClub = {};
  if (leaderClubIds.length > 0) {
    const { data: pendingMembers } = await supabase
      .from("club_members")
      .select("club_id")
      .in("club_id", leaderClubIds)
      .eq("status", "pending");
    (pendingMembers || []).forEach((m) => {
      pendingByClub[m.club_id] = (pendingByClub[m.club_id] || 0) + 1;
    });

    const { data: recentPosts } = await supabase
      .from("posts")
      .select("club_id, title, type, created_at")
      .in("club_id", leaderClubIds)
      .order("created_at", { ascending: false })
      .limit(20);
    (recentPosts || []).forEach((p) => {
      if (!recentPostsByClub[p.club_id]) recentPostsByClub[p.club_id] = [];
      if (recentPostsByClub[p.club_id].length < 3) recentPostsByClub[p.club_id].push(p);
    });
  }

  let budgetPendingCount = 0;
  if (isBudgetOfficer) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { count } = await supabase
      .from("club_budget_disbursements")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .eq("year", year)
      .eq("month", month)
      .eq("status", "unpaid");
    budgetPendingCount = count || 0;
  }

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

        {isAdmin && (
          <div className="grid-4" style={{ marginBottom: 16 }}>
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
        )}

        {isBudgetOfficer && (
          <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="metric-label">이번 달 지원금 미지급 건</div>
              <div className="metric-value">{budgetPendingCount}</div>
            </div>
            <a className="btn-sm btn-outline" href="/company/budget-payments">지원금 지급 관리로 이동</a>
          </div>
        )}

        {leaderClubIds.length > 0 && (
          <div className="grid-2" style={{ marginBottom: 16 }}>
            {(myClubs || [])
              .filter((m) => leaderClubIds.includes(m.club.id))
              .map((m) => (
                <div className="card" key={m.club.id}>
                  <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>
                      {m.club.name} <span className="badge badge-brand" style={{ marginLeft: 6 }}>{m.role_label}</span>
                    </span>
                    <a className="btn-sm btn-outline" href={`/clubs/${m.club.id}`}>동호회 관리</a>
                  </div>
                  <div className="row-flex" style={{ gap: 10, marginBottom: 10 }}>
                    {pendingByClub[m.club.id] > 0 ? (
                      <span className="badge badge-amber">가입 대기 {pendingByClub[m.club.id]}명 — 처리 필요</span>
                    ) : (
                      <span className="badge badge-gray">가입 대기 없음</span>
                    )}
                  </div>
                  <div className="co-tag" style={{ marginBottom: 6 }}>최근 게시글</div>
                  {(recentPostsByClub[m.club.id] || []).length === 0 && (
                    <div className="empty-note" style={{ padding: 0 }}>최근 등록된 게시글이 없습니다.</div>
                  )}
                  {(recentPostsByClub[m.club.id] || []).map((p, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: "var(--ink-2)", padding: "3px 0" }}>
                      {p.type === "report" ? "[보고서] " : p.type === "notice" ? "[공지] " : ""}
                      {p.title}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        <div className="card">
          <div className="section-title">내 동호회</div>
          {myClubs && myClubs.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>동호회</th>
                  <th>직책</th>
                </tr>
              </thead>
              <tbody>
                {myClubs.map((m) => (
                  <tr key={m.club.id}>
                    <td>
                      <a href={`/clubs/${m.club.id}`}>{m.club.name}</a>
                    </td>
                    <td>
                      <span className={`badge ${m.role_label === "회장" ? "badge-brand" : m.role_label === "총무" ? "badge-gray" : ""}`}>
                        {m.role_label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-note">아직 가입한 동호회가 없습니다. 동호회 목록에서 가입 신청해보세요.</div>
          )}
        </div>
      </div>
    </div>
  );
}
