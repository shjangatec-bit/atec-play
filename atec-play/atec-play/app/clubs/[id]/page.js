import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import LogoutButton from "@/components/LogoutButton";
import CoverImageUploader from "./CoverImageUploader";
import CloseRequestButton from "./CloseRequestButton";
import WithdrawButton from "./WithdrawButton";
import ClubDetailTabs from "./ClubDetailTabs";

export const PER_PERSON_CAP = 30000;
export const MONTHLY_CLUB_CAP = 500000;
export const EXPENSE_RATIO = 0.5;

export default async function ClubDetailPage({ params }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (!profile || (profile.status !== "approved" && profile.status !== "pending")) redirect("/pending");

  const isGuest = profile.status !== "approved";

  const supabase = createClient();
  const clubId = params.id;

  const { data: club } = await supabase.from("clubs").select("*").eq("id", clubId).single();
  if (!club) redirect("/clubs");

  const { data: boardPosts } = await supabase
    .from("posts")
    .select(
      "id, type, title, content, created_at, author_id, author:author_id(name), post_attachments(id, file_url, file_type), post_comments(id, content, created_at, author:author_id(name)), post_likes(user_id)"
    )
    .eq("club_id", clubId)
    .in("type", ["notice", "general", "photo"])
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "post_comments", ascending: true });

  // 회원현황/활동보고서/지원금 — 게스트에게는 아예 조회하지 않음 (열람 자체를 막기 위함)
  let members = [];
  let reportPosts = [];
  let clubMembersForCheck = [];

  if (!isGuest) {
    const { data: m } = await supabase
      .from("club_members")
      .select("id, role_label, status, applied_at, withdrawal_requested, user:user_id(id, name, company:company_id(name))")
      .eq("club_id", clubId)
      .order("applied_at");
    members = m || [];

    const { data: r } = await supabase
      .from("posts")
      .select(
        "id, title, activity_date, expense_amount, created_at, author:author_id(name), post_attendees(user_id, user:user_id(name, company:company_id(name))), post_attachments(file_url, file_type)"
      )
      .eq("club_id", clubId)
      .eq("type", "report")
      .order("activity_date", { ascending: false });
    reportPosts = r || [];

    const { data: cm } = await supabase
      .from("club_members")
      .select("user_id, user:user_id(name, company:company_id(name))")
      .eq("club_id", clubId)
      .eq("status", "approved");
    clubMembersForCheck = cm || [];
  }

  const canApprove = !isGuest && hasPermission(permissions, "CLUB_MEMBER_APPROVE", { clubId });
  const canWriteReport = !isGuest && hasPermission(permissions, "CLUB_REPORT_WRITE", { clubId });
  const canWritePost = !isGuest && hasPermission(permissions, "CLUB_POST_WRITE", { clubId });

  // 이 동호회의 승인된 회원인지 (회장/총무/회원 누구나 폐설 신청 가능)
  const myMembership = members.find((m) => m.status === "approved" && m.user?.id === authUser.id);
  const isMemberOfThisClub = !isGuest && !!myMembership;
  let alreadyRequestedClose = false;
  if (isMemberOfThisClub && club.status === "active") {
    const { data: existingCloseReq } = await supabase
      .from("club_lifecycle_requests")
      .select("id")
      .eq("club_id", clubId)
      .eq("type", "close")
      .eq("status", "pending")
      .maybeSingle();
    alreadyRequestedClose = !!existingCloseReq;
  }

  // 회원 권한 관리 탭용 데이터 (회장/총무만)
  let memberPermissions = {};
  if (canApprove) {
    const { data: cp } = await supabase
      .from("user_permissions")
      .select("user_id, permission_code")
      .eq("club_id", clubId);
    (cp || []).forEach((row) => {
      if (!memberPermissions[row.user_id]) memberPermissions[row.user_id] = [];
      memberPermissions[row.user_id].push(row.permission_code);
    });
  }

  // 월별 자동 집계
  // 지급액 = ① 비용합계×50%  ② 참석인원×3만원  ③ 50만원  중 가장 작은 금액
  // 같은 사람이 그 달에 여러 번 참석해도 1명으로만 집계합니다.
  const monthlyRaw = {};
  reportPosts.forEach((p) => {
    if (!p.activity_date) return;
    const ym = p.activity_date.slice(0, 7);
    if (!monthlyRaw[ym]) monthlyRaw[ym] = { attendees: new Set(), expense: 0 };
    (p.post_attendees || []).forEach((a) => monthlyRaw[ym].attendees.add(a.user_id));
    monthlyRaw[ym].expense += Number(p.expense_amount) || 0;
  });

  const monthly = Object.fromEntries(
    Object.entries(monthlyRaw).map(([ym, v]) => {
      const attendeeCount = v.attendees.size;
      const byExpense = Math.floor(v.expense * EXPENSE_RATIO);
      const byHead = attendeeCount * PER_PERSON_CAP;
      const amount = Math.min(byExpense, byHead, MONTHLY_CLUB_CAP);
      return [ym, { attendeeCount, expense: v.expense, byExpense, byHead, amount }];
    })
  );

  return (
    <div className="app-shell">
      {isGuest ? (
        <div className="sidebar">
          <div className="side-logo">ATEC PLAY<span>통합 동호회 관리</span></div>
          <a href="/pending" className="side-link active"><span className="side-dot" />동호회 둘러보기</a>
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
      ) : (
        <Sidebar profile={profile} permissions={permissions} active="/clubs" />
      )}
      <div className="main">
        {isGuest && (
          <div className="card banner">
            <div className="pending-icon" style={{ margin: 0 }}>i</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
              게스트로 보는 화면입니다. 게시판·사진 갤러리만 열람 가능하며, 회원현황·활동보고서·지원금 현황은 계정 승인 후 볼 수 있습니다.
            </div>
          </div>
        )}
        <div className="crumb">동호회 / {club.name}</div>
        <div className="detail-head">
          <div
            className="thumb-lg"
            style={club.cover_image_url ? { backgroundImage: `url(${club.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div style={{ flex: 1 }}>
            <h1>{club.name}</h1>
            <div className="sub">
              {club.description} · {club.status === "active" ? "운영중" : "폐설"}
            </div>
          </div>
          {canApprove && <CoverImageUploader clubId={club.id} />}
          {isMemberOfThisClub && club.status === "active" && (
            <CloseRequestButton clubId={club.id} userId={authUser.id} alreadyRequested={alreadyRequestedClose} />
          )}
          {isMemberOfThisClub && (
            <WithdrawButton memberId={myMembership.id} alreadyRequested={myMembership.withdrawal_requested} />
          )}
        </div>

        <ClubDetailTabs
          club={club}
          members={members}
          boardPosts={boardPosts || []}
          reportPosts={reportPosts}
          monthly={monthly}
          clubMembersForCheck={clubMembersForCheck}
          currentUserId={authUser.id}
          canApprove={canApprove}
          canWriteReport={canWriteReport}
          canWritePost={canWritePost}
          isGuest={isGuest}
          memberPermissions={memberPermissions}
        />
      </div>
    </div>
  );
}
