import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import JoinButton from "@/components/JoinButton";

export default async function PendingPage() {
  const { authUser, profile } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status === "approved") redirect("/dashboard");

  const supabase = createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, description, club_members(count)")
    .eq("status", "active");

  const { data: myApplications } = await supabase
    .from("club_members")
    .select("club_id")
    .eq("user_id", authUser.id);
  const appliedClubIds = new Set((myApplications || []).map((a) => a.club_id));

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
        <div className="side-user">
          <div className="avatar" style={{ background: "var(--gray-bg)", color: "var(--ink-2)" }}>
            {profile?.name?.slice(0, 2) || "게스트"}
          </div>
          <div>
            <div className="name">{profile?.name}</div>
            <div className="role">게스트 · 승인 대기</div>
          </div>
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
              통합관리자 승인 전까지는 동호회 목록 열람과 가입 신청만 가능합니다. 신청한 가입 건은 계정 승인 후 회장/총무가 처리합니다.
            </div>
          </div>
        </div>
        <div className="topbar">
          <h1>동호회 둘러보기</h1>
        </div>
        <div className="grid-3">
          {(clubs || []).map((club) => (
            <div className="club-card" key={club.id}>
              <div className="thumb" />
              <div className="body">
                <h3>{club.name}</h3>
                <div className="desc">{club.description}</div>
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
          게스트에게는 이름·설명·회원 수만 보이며, 회원 현황·게시판·활동보고서 등 상세 탭은 계정 승인 후에 열람할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
