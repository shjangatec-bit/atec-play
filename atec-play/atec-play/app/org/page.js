import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function OrgPage({ searchParams }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const supabase = createClient();

  const viewAll = hasPermission(permissions, "ORG_VIEW_ALL");
  const viewCompanyOnly = hasPermission(permissions, "ORG_VIEW_COMPANY", { companyId: profile.company_id });

  // 회장/총무/일반 회원 모두: 본인이 가입(승인)된 동호회 목록
  const { data: memberRows } = await supabase
    .from("club_members")
    .select("club_id, role_label, club:club_id(id, name)")
    .eq("user_id", authUser.id)
    .eq("status", "approved");
  const myClubs = (memberRows || []).map((m) => m.club);
  const myClubIds = myClubs.map((c) => c.id);
  const viewMyClubsOnly = !viewAll && !viewCompanyOnly;

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: allClubs } = await supabase.from("clubs").select("id, name").order("name");
  const { data: permMaster } = await supabase.from("permissions").select("code, name");
  const permNameMap = Object.fromEntries((permMaster || []).map((p) => [p.code, p.name]));

  // 회장/총무/일반 회원 모드에서는 동호회 필터 선택지를 본인이 가입한 동호회로 제한
  const clubOptions = viewMyClubsOnly ? myClubs : allClubs;

  let query = supabase
    .from("users")
    .select(
      "id, name, status, company:company_id(id, name), club_members!user_id(status, role_label, club:club_id(id, name)), user_permissions!user_id(permission_code, club_id, company_id)"
    )
    .eq("status", "approved")
    .order("name");

  const companyFilter = viewAll ? searchParams?.company : viewCompanyOnly ? profile.company_id : null;
  if (companyFilter) query = query.eq("company_id", companyFilter);

  const { data: users } = await query;

  let clubFilter = searchParams?.club || "";
  if (viewMyClubsOnly && clubFilter && !myClubIds.includes(clubFilter)) clubFilter = ""; // 본인 가입 동호회 외 접근 차단

  let filteredUsers = users || [];
  if (viewMyClubsOnly) {
    // 본인이 가입한 동호회(들)의 회원만
    const targetClubIds = clubFilter ? [clubFilter] : myClubIds;
    filteredUsers = filteredUsers.filter((u) =>
      u.club_members?.some((m) => m.status === "approved" && targetClubIds.includes(m.club?.id))
    );
  } else if (clubFilter) {
    filteredUsers = filteredUsers.filter((u) =>
      u.club_members?.some((m) => m.status === "approved" && m.club?.id === clubFilter)
    );
  }

  const heading = viewAll ? "전체 인원" : viewCompanyOnly ? "소속회사 인원" : "내 동호회 인원";
  const noClubJoined = viewMyClubsOnly && myClubIds.length === 0;

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/org" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 동호회원 명단</div>
            <h1>동호회원 명단</h1>
          </div>
        </div>
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="metric-label">{heading}</div>
            <div className="metric-value">{filteredUsers.length}</div>
          </div>
        </div>
        {noClubJoined ? (
          <div className="card">
            <div className="empty-note">
              아직 가입한 동호회가 없습니다. 동호회에 가입하면 그 동호회 회원 명단을 여기서 볼 수 있어요.
              <br />
              <a href="/clubs" style={{ color: "var(--brand)" }}>동호회 목록 보러가기 →</a>
            </div>
          </div>
        ) : (
        <div className="card">
          <form className="filter-row" method="get">
            {viewAll ? (
              <select name="company" defaultValue={searchParams?.company || ""}>
                <option value="">전체 소속회사</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : viewCompanyOnly ? (
              <span className="badge badge-brand">{profile.company?.name} 소속만 표시 중</span>
            ) : (
              <span className="badge badge-brand">내가 가입한 동호회만 표시 중</span>
            )}
            <select name="club" defaultValue={clubFilter}>
              <option value="">{viewMyClubsOnly ? "전체 (가입한 동호회 모두)" : "전체 동호회"}</option>
              {clubOptions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn-sm btn-outline" type="submit">
              필터 적용
            </button>
          </form>
          <table style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "38%" }} />
              <col style={{ width: "42%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>이름</th>
                <th>소속회사</th>
                <th>가입 동호회 · 직책</th>
                <th>보유 권한</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const approvedClubs = (u.club_members || []).filter((m) => m.status === "approved");
                const perms = u.user_permissions || [];
                const uniqueCodes = [...new Set(perms.map((p) => p.permission_code))];
                return (
                  <tr key={u.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{u.name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{u.company?.name}</td>
                    <td>
                      {approvedClubs.length === 0 && (
                        <span className="empty-note" style={{ padding: 0, display: "inline" }}>
                          가입 동호회 없음
                        </span>
                      )}
                      {approvedClubs.map((m) => (
                        <span
                          className={`badge ${m.role_label === "회장" ? "badge-brand" : m.role_label === "총무" ? "badge-gray" : "badge-gray"}`}
                          key={m.club.id}
                          style={{ marginRight: 4, marginBottom: 3, display: "inline-block" }}
                        >
                          {m.club.name} · {m.role_label}
                        </span>
                      ))}
                    </td>
                    <td>
                      {uniqueCodes.length === 0 && (
                        <span className="empty-note" style={{ padding: 0, display: "inline" }}>
                          부여된 권한 없음
                        </span>
                      )}
                      {uniqueCodes.map((code) => (
                        <span className="badge badge-amber" key={code} style={{ marginRight: 4, marginBottom: 3, display: "inline-block" }}>
                          {permNameMap[code] || code}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
