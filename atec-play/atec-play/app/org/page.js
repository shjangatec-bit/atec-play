import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function OrgPage({ searchParams }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const viewAll = hasPermission(permissions, "ORG_VIEW_ALL");
  const viewCompanyOnly = hasPermission(permissions, "ORG_VIEW_COMPANY", { companyId: profile.company_id });
  if (!viewAll && !viewCompanyOnly) redirect("/dashboard");

  const supabase = createClient();
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: clubs } = await supabase.from("clubs").select("id, name").order("name");
  const { data: permMaster } = await supabase.from("permissions").select("code, name");
  const permNameMap = Object.fromEntries((permMaster || []).map((p) => [p.code, p.name]));

  let query = supabase
    .from("users")
    .select(
      "id, name, status, company:company_id(id, name), club_members!user_id(status, role_label, club:club_id(id, name)), user_permissions!user_id(permission_code, club_id, company_id)"
    )
    .eq("status", "approved")
    .order("name");

  const companyFilter = viewAll ? searchParams?.company : profile.company_id;
  if (companyFilter) query = query.eq("company_id", companyFilter);

  const { data: users } = await query;

  const clubFilter = searchParams?.club;
  const filteredUsers = clubFilter
    ? (users || []).filter((u) =>
        u.club_members?.some((m) => m.status === "approved" && m.club?.id === clubFilter)
      )
    : users || [];

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/org" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 조직·인원</div>
            <h1>조직/인원 조회</h1>
          </div>
        </div>
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="metric-label">{viewAll ? "전체 인원" : "소속회사 인원"}</div>
            <div className="metric-value">{filteredUsers.length}</div>
          </div>
        </div>
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
            ) : (
              <span className="badge badge-brand">{profile.company?.name} 소속만 표시 중</span>
            )}
            <select name="club" defaultValue={searchParams?.club || ""}>
              <option value="">전체 동호회</option>
              {clubs?.map((c) => (
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
      </div>
    </div>
  );
}
