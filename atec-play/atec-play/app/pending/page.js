import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import JoinButton from "@/components/JoinButton";
import LogoutButton from "@/components/LogoutButton";

export default async function PendingPage() {
  const { authUser, profile } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status === "approved") redirect("/dashboard");

  const supabase = createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, description, cover_image_url, club_members(count)")
    .eq("status", "active");

  const { data: myApplications } = await supabase
    .from("club_members")
    .select("club_id, status")
    .eq("user_id", authUser.id);
  // 반려/탈회 건은 재신청이 가능해야 하므로, "신청 대기/가입됨" 상태만 이미 신청한 것으로 처리
  const appliedClubIds = new Set(
    (myApplications || []).filter((a) => a.status === "pending" || a.status === "approved").map((a) => a.club_id)
  );

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="side-logo">
          ATEC PLAY
          <span>통합 동호회 관리</span>
        </div>
        <div className="side-link active">
          <span className="side-dot" />
          동호회 둘러보기
        </div>
        <a href="/guide" className="side-link">
          <span className="side-dot" />
          운영지침
        </a>
        <a href="/forms" className="side-link">
          <span className="side-dot" />
          양식함
        </a>
        <div className="side-user">
          <div className="avatar" style={{ background: "var(--gray-bg)", color: "var(--ink-2)" }}>
            {profile?.name?.slice(0, 2) || "게스트"}
          </div>
          <div style={{ flex: 1 }}>
            <div className="name">{profile?.name}</div>
            <div className="role">게스트 · 승인 대기</div>
          </div>
          <LogoutButton />
        </div>
      </div>
      <div className="main">
        <div className="card banner">
          <div className="pending-icon" style={{ margin: 0 }}>i</div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--amber)" }}>
              계정 승인 대기 중입니다
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
              통합관리자 승인 전까지는 동호회 게시판·사진 갤러리 열람과 가입 신청만 가능합니다. 회원현황·활동보고서 등은 계정 승인 후 볼 수 있습니다.
            </div>
          </div>
        </div>
        <div className="topbar">
          <h1>동호회 둘러보기</h1>
        </div>
        <div className="grid-3">
          {(clubs || []).map((club) => (
            <div className="club-card" key={club.id}>
              <a href={`/clubs/${club.id}`}>
                <div
                  className="thumb"
                  style={club.cover_image_url ? { backgroundImage: `url(${club.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
                />
                <div className="body" style={{ paddingBottom: 4 }}>
                  <h3>{club.name}</h3>
                  <div className="desc">{club.description}</div>
                </div>
              </a>
              <div className="body" style={{ paddingTop: 0 }}>
                <div className="meta">
                  <span>회원 {club.club_members?.[0]?.count ?? 0}명</span>
                  <JoinButton
                    clubId={club.id}
                    userId={authUser.id}
                    alreadyApplied={appliedClubIds.has(club.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="empty-note">
          동호회 이름을 클릭하면 게시판과 사진 갤러리를 볼 수 있습니다. 회원현황·활동보고서·지원금 현황은 계정 승인 후 열람 가능합니다.
        </div>
      </div>
    </div>
  );
}
