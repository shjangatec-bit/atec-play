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

  let query = supabase
    .from("users")
    .select("id, name, status, company:company_id(id, name), club_members!user_id(status, club:club_id(id, name))")
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
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>소속회사</th>
                <th>가입 동호회</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.company?.name}</td>
                  <td>
                    {(u.club_members || [])
                      .filter((m) => m.status === "approved")
                      .map((m) => (
                        <span className="badge badge-gray" key={m.club.id} style={{ marginRight: 4 }}>
                          {m.club.name}
                        </span>
                      ))}
                    {(u.club_members || []).filter((m) => m.status === "approved").length === 0 && (
                      <span className="empty-note" style={{ padding: 0, display: "inline" }}>
                        가입 동호회 없음
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
