import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import RateRow from "./RateRow";

export default async function SupportRatesPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "CLUB_SUPPORT_RATE_EDIT")) redirect("/dashboard");

  const supabase = createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, status, club_support_rates(id, unit_amount)")
    .eq("status", "active")
    .order("name");

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/support-rates" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>동호회별 지원 단가 설정</h1>
          </div>
        </div>
        <div className="card">
          <div className="empty-note" style={{ padding: "0 0 10px" }}>
            활동보고서의 참석 체크 인원 × 단가로 지원금이 자동 계산됩니다.
          </div>
          <table>
            <thead>
              <tr><th>동호회</th><th style={{ textAlign: "right" }}>1인당 단가</th><th></th></tr>
            </thead>
            <tbody>
              {(clubs || []).map((c) => (
                <RateRow key={c.id} club={c} userId={authUser.id} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
