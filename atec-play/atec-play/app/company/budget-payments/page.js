import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import DisburseButton from "./DisburseButton";

export default async function BudgetPaymentsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "CLUB_BUDGET_DISBURSE", { companyId: profile.company_id })) redirect("/dashboard");

  const companyId = profile.company_id;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const supabase = createClient();
  const { data: reportPosts } = await supabase
    .from("posts")
    .select("club_id, club:club_id(name), post_attendees(user_id, user:user_id(name, company_id))")
    .eq("type", "report")
    .gte("activity_date", monthStart)
    .lt("activity_date", nextMonth);

  const byClub = {};
  (reportPosts || []).forEach((p) => {
    (p.post_attendees || []).forEach((a) => {
      if (a.user?.company_id !== companyId) return;
      if (!byClub[p.club_id]) byClub[p.club_id] = { clubName: p.club?.name, attendees: new Map() };
      byClub[p.club_id].attendees.set(a.user_id, a.user.name);
    });
  });

  const clubIds = Object.keys(byClub);
  const { data: rates } = clubIds.length
    ? await supabase.from("club_support_rates").select("club_id, unit_amount").in("club_id", clubIds)
    : { data: [] };
  const rateMap = Object.fromEntries((rates || []).map((r) => [r.club_id, r.unit_amount]));

  const { data: existing } = clubIds.length
    ? await supabase
        .from("club_budget_disbursements")
        .select("id, club_id, status, paid_by, paid_at, users:paid_by(name)")
        .eq("company_id", companyId)
        .eq("year", year)
        .eq("month", month)
        .in("club_id", clubIds)
    : { data: [] };
  const existingMap = Object.fromEntries((existing || []).map((e) => [e.club_id, e]));

  const rows = clubIds.map((clubId) => {
    const attendeeCount = byClub[clubId].attendees.size;
    const unitAmount = rateMap[clubId] || 0;
    return {
      clubId,
      clubName: byClub[clubId].clubName,
      attendeeNames: [...byClub[clubId].attendees.values()],
      attendeeCount,
      unitAmount,
      amount: attendeeCount * unitAmount,
      disbursement: existingMap[clubId],
    };
  });

  const monthlyTotal = rows.reduce((s, r) => s + r.amount, 0);
  const paidCount = rows.filter((r) => r.disbursement?.status === "paid").length;

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/company/budget-payments" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">회사 담당 / 지원금 지급 관리</div>
            <h1>지원금 지급 관리</h1>
          </div>
        </div>
        <div className="empty-note" style={{ padding: "0 0 16px" }}>
          로그인한 담당자의 소속회사(<b style={{ color: "var(--ink-2)" }}>{profile.company?.name}</b>) 기준으로, 이번 달 자사 소속 참석자가 있는 동호회만 자동으로 걸러서 보여줍니다.
        </div>
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card"><div className="metric-label">이번 달 지급 대상 동호회</div><div className="metric-value">{rows.length}</div></div>
          <div className="card"><div className="metric-label">이번 달 지원금 합계</div><div className="metric-value">{monthlyTotal.toLocaleString()}</div></div>
          <div className="card"><div className="metric-label">지급완료율</div><div className="metric-value">{rows.length ? Math.round((paidCount / rows.length) * 100) : 0}%</div></div>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr><th>동호회</th><th>자사 소속 참석자</th><th style={{ textAlign: "right" }}>단가</th><th style={{ textAlign: "right" }}>지원금액</th><th>상태</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clubId}>
                  <td>{r.clubName}</td>
                  <td>{r.attendeeNames.map((n) => <span className="badge badge-gray" key={n} style={{ marginRight: 4 }}>{n}</span>)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{r.unitAmount.toLocaleString()}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{r.amount.toLocaleString()}</td>
                  <td>
                    {r.disbursement?.status === "paid" ? (
                      <span className="badge badge-green">지급완료</span>
                    ) : (
                      <span className="badge badge-amber">미지급</span>
                    )}
                  </td>
                  <td>
                    {r.disbursement?.status === "paid" ? (
                      <span className="co-tag">{new Date(r.disbursement.paid_at).toLocaleDateString("ko-KR")} 처리 · {r.disbursement.users?.name}</span>
                    ) : (
                      <DisburseButton
                        clubId={r.clubId}
                        companyId={companyId}
                        year={year}
                        month={month}
                        attendeeCount={r.attendeeCount}
                        amount={r.amount}
                        paidBy={authUser.id}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6}><div className="empty-note">이번 달, 자사 소속 참석자가 있는 동호회가 없습니다.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="empty-note" style={{ paddingTop: 12 }}>
          "지급완료 처리"를 누르면 처리자·처리일시가 기록됩니다. 실제 계좌이체 등 지급 행위는 회계 시스템에서 별도로 진행하며, 이 화면은 지급 여부 확인 용도입니다.
        </div>
      </div>
    </div>
  );
}
