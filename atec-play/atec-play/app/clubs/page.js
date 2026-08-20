import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import JoinButton from "@/components/JoinButton";

export default async function ClubsPage({ searchParams }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const supabase = createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, description, status, cover_image_url, club_members(status)")
    .order("name");

  const { data: myMemberships } = await supabase
    .from("club_members")
    .select("club_id, status")
    .eq("user_id", authUser.id);
  const myStatusByClub = Object.fromEntries((myMemberships || []).map((m) => [m.club_id, m.status]));

  let visible = clubs || [];
  if (searchParams?.mine) {
    visible = visible.filter((c) => myStatusByClub[c.id] === "approved");
  }

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/clubs" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 동호회</div>
            <h1>{searchParams?.mine ? "내 동호회" : "동호회 목록"}</h1>
          </div>
          {!searchParams?.mine && (
            <div className="top-actions">
              <a className="btn-sm btn-outline" href="/clubs/new">+ 동호회 개설 신청</a>
            </div>
          )}
        </div>
        <div className="grid-3">
          {visible.map((club) => {
            const memberCount = (club.club_members || []).filter((m) => m.status === "approved").length;
            const myStatus = myStatusByClub[club.id];
            return (
              <div className="club-card" key={club.id}>
                <a href={`/clubs/${club.id}`}>
                  <div
                    className="thumb"
                    style={
                      club.status === "closed"
                        ? { background: "var(--gray-bg)" }
                        : club.cover_image_url
                        ? { backgroundImage: `url(${club.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : {}
                    }
                  />
                  <div className="body" style={{ paddingBottom: 4 }}>
                    <h3 style={club.status === "closed" ? { color: "var(--ink-3)" } : {}}>{club.name}</h3>
                    <div className="desc">{club.description}</div>
                  </div>
                </a>
                <div className="body" style={{ paddingTop: 0 }}>
                  <div className="meta">
                    {club.status === "closed" ? (
                      <span className="badge badge-gray">폐설</span>
                    ) : (
                      <span>회원 {memberCount}명</span>
                    )}
                    {club.status === "active" && (
                      myStatus === "approved" ? (
                        <span className="badge badge-green">가입됨</span>
                      ) : (
                        <JoinButton clubId={club.id} userId={authUser.id} alreadyApplied={myStatus === "pending"} />
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
