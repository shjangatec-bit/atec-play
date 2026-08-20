import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function StatsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "ORG_VIEW_ALL")) redirect("/dashboard");

  const supabase = createClient();
  const { data: companies } = await supabase.from("companies").select("id, name");
  const { data: users } = await supabase.from("users").select("id, company_id").eq("status", "approved");
  const { count: activeClubs } = await supabase.from("clubs").select("*", { count: "exact", head: true }).eq("status", "active");
  const { data: memberRows } = await supabase.from("club_members").select("user_id").eq("status", "approved");
  const uniqueMembers = new Set((memberRows || []).map((m) => m.user_id)).size;

  const now = new Date();
  const { data: disbursements } = await supabase
    .from("club_budget_disbursements")
    .select("amount")
    .eq("year", now.getFullYear())
    .eq("month", now.getMonth() + 1);
  const monthlyTotal = (disbursements || []).reduce((sum, d) => sum + Number(d.amount), 0);

  const totalUsers = (users || []).length || 1;
  const companyCounts = (companies || []).map((c) => ({
    ...c,
    count: (users || []).filter((u) => u.company_id === c.id).length,
  }));
  const maxCount = Math.max(1, ...companyCounts.map((c) => c.count));
  const barColors = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"];

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/stats" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>전체 통계</h1>
          </div>
        </div>
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div className="card"><div className="metric-label">전체 임직원</div><div className="metric-value">{users?.length ?? 0}</div></div>
          <div className="card"><div className="metric-label">동호회 가입률</div><div className="metric-value">{((uniqueMembers / totalUsers) * 100).toFixed(1)}%</div></div>
          <div className="card"><div className="metric-label">운영중 동호회</div><div className="metric-value">{activeClubs ?? 0}</div></div>
          <div className="card"><div className="metric-label">이번 달 지원금 합계</div><div className="metric-value">{monthlyTotal.toLocaleString()}</div></div>
        </div>
        <div className="card">
          <div className="section-title">회사별 가입 인원</div>
          <table>
            <tbody>
              {companyCounts.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ width: 120 }}><span className="co-bar" style={{ background: `var(${barColors[i % 6]})` }} />{c.name}</td>
                  <td><div className="stat-bar"><span style={{ width: `${(c.count / maxCount) * 100}%`, background: `var(${barColors[i % 6]})` }} /></div></td>
                  <td className="mono" style={{ textAlign: "right", width: 50 }}>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
