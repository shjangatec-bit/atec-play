import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import RequestRow from "./RequestRow";

export default async function ClubRequestsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "CLUB_CREATE_APPROVE") && !hasPermission(permissions, "CLUB_CLOSE_APPROVE")) redirect("/dashboard");

  const supabase = createClient();
  const { data: requests } = await supabase
    .from("club_lifecycle_requests")
    .select("id, type, proposed_name, club_id, requester_id, file_url, status, created_at, requester:requester_id(name), club:club_id(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/club-requests" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>동호회 개설 승인</h1>
          </div>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr><th>구분</th><th>동호회명</th><th>신청자</th><th>신청일</th><th>상태</th><th></th></tr>
            </thead>
            <tbody>
              {(requests || []).map((r) => (
                <RequestRow key={r.id} req={r} reviewerId={authUser.id} />
              ))}
              {(requests || []).length === 0 && (
                <tr><td colSpan={6}><div className="empty-note">신청 내역이 없습니다.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
