import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import LogoutButton from "@/components/LogoutButton";
import CoverImageUploader from "./CoverImageUploader";
import DescriptionEditor from "./DescriptionEditor";
import CloseRequestButton from "./CloseRequestButton";
import WithdrawButton from "./WithdrawButton";
import ClubDetailTabs from "./ClubDetailTabs";

import { ok } from "@/lib/db";
import { calcSubsidy, allocateByCompany } from "@/lib/subsidy";
export default async function ClubDetailPage({ params }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (!profile || (profile.status !== "approved" && profile.status !== "pending")) redirect("/pending");

  const isGuest = profile.status !== "approved";

  const supabase = createClient();
  const clubId = params.id;

  const { data: club } = await supabase.from("clubs").select("*").eq("id", clubId).single();
  if (!club) redirect("/clubs");

  const { data: boardPosts } = ok(await supabase
    .from("posts")
    .select(
      "id, type, title, content, created_at, author_id, author:author_id(name), post_attachments(id, file_url, file_type), post_comments(id, content, created_at, author:author_id(name)), post_likes(user_id)"
    )
    .eq("club_id", clubId)
    .in("type", ["notice", "general", "photo"])
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "post_comments", ascending: true }), "게시글");

  // 회원현황/활동보고서/지원금 — 게스트에게는 아예 조회하지 않음 (열람 자체를 막기 위함)
  let members = [];
  let reportPosts = [];
  let clubMembersForCheck = [];

  if (!isGuest) {
    const { data: m } = ok(await supabase
      .from("club_members")
      .select("id, role_label, is_staff, status, applied_at, withdrawal_requested, user:user_id(id, name, company:company_id(name))")
      .eq("club_id", clubId)
      .order("applied_at"), "회원 현황");
    members = m || [];

    const { data: r } = ok(await supabase
      .from("posts")
      .select(
        "id, title, activity_date, expense_amount, created_at, author:author_id(name), post_attendees(user_id, user:user_id(name, company:company_id(name))), post_attachments(file_url, file_type)"
      )
      .eq("club_id", clubId)
      .eq("type", "report")
      .order("activity_date", { ascending: false }), "활동보고서");
    reportPosts = r || [];

    // 참석자 체크 목록 — 현재 회원 + 탈회한 이력이 있는 사람까지 포함합니다.
    // (지난달 활동에 참석했는데 이번 달에 탈회·퇴사한 경우에도 보고서에 체크할 수 있어야 하기 때문)
    const { data: cm } = ok(await supabase
      .from("club_members")
      .select("user_id, status, user:user_id(name, company:company_id(name))")
      .eq("club_id", clubId)
      .in("status", ["approved", "withdrawn"]), "참석자 목록");
    clubMembersForCheck = (cm || []).sort((a, b) => {
      if (a.status !== b.status) return a.status === "approved" ? -1 : 1;
      return (a.user?.name || "").localeCompare(b.user?.name || "");
    });
  }

  // 권한은 "운영진 / 일반" 두 가지뿐입니다.
  //  · 운영진(isStaff): 직책이 회장·총무인 승인 회원. DB(club_members.is_staff)가 직책에서 자동 계산합니다.
  //  · 일반: 승인된 모든 회원 (열람, 게시글 작성)
  const myMembership = members.find((m) => m.status === "approved" && m.user?.id === authUser.id);
  const isMemberOfThisClub = !isGuest && !!myMembership;
  const isStaff = isMemberOfThisClub && !!myMembership.is_staff;
  const canWritePost = isMemberOfThisClub;
  const canWriteReport = isStaff;

  // 직책 변경(총무↔회원)·회장 교체는 그 동호회 회장 또는 통합관리자만 할 수 있습니다.
  // (직책에 따라 달라지는 유일한 기능이며, 서버(DB)에서도 같은 규칙으로 막고 있습니다.)
  const isChair = isMemberOfThisClub && myMembership.role_label === "회장";
  const isRoleAdmin = hasPermission(permissions, "PERM_MANAGE") || hasPermission(permissions, "ACC_MANAGE");
  const canManageRoles = !isGuest && (isChair || isRoleAdmin);

  // 폐설 신청은 운영진(회장·총무)만 가능합니다. 회원이 모두 빠진 동호회도 정리할 수 있도록
  // 폐설 승인 권한자(통합관리자)는 회원이 아니어도 신청할 수 있습니다.
  const canRequestClose = !isGuest && (isStaff || hasPermission(permissions, "CLUB_CLOSE_APPROVE"));
  let alreadyRequestedClose = false;
  if (canRequestClose && club.status === "active") {
    const { data: existingCloseReq } = ok(await supabase
      .from("club_lifecycle_requests")
      .select("id")
      .eq("club_id", clubId)
      .eq("type", "close")
      .eq("status", "pending")
      .maybeSingle(), "폐설 신청 내역");
    alreadyRequestedClose = !!existingCloseReq;
  }

  // 회장 교체 이력 (이 동호회 승인 회원과 통합관리자에게만 보임)
  let chairHistory = [];
  if (!isGuest) {
    const { data: hist } = ok(await supabase
      .from("club_chair_history")
      .select("id, changed_at, old_chair_new_role, note, old_chair:old_chair_user_id(name), new_chair:new_chair_user_id(name), changer:changed_by(name)")
      .eq("club_id", clubId)
      .order("changed_at", { ascending: false })
      .limit(20), "회장 교체 이력");
    chairHistory = hist || [];
  }

  // 월별 자동 집계
  // 지급액 = ① 비용합계×50%  ② 참석인원×3만원  ③ 50만원  중 가장 작은 금액
  // 같은 사람이 그 달에 여러 번 참석해도 1명으로만 집계합니다.
    const monthlyRaw = {};
  reportPosts.forEach((p) => {
    if (!p.activity_date) return;
    const ym = p.activity_date.slice(0, 7);
    if (!monthlyRaw[ym]) monthlyRaw[ym] = { attendees: new Set(), expense: 0, reports: [], companyCount: {} };
    const bucket = monthlyRaw[ym];
    bucket.expense += Number(p.expense_amount) || 0;

    const names = [];
    const perReportCompany = {};
    (p.post_attendees || []).forEach((a) => {
      bucket.attendees.add(a.user_id);
      const co = a.user?.company?.name || "-";
      names.push({ name: a.user?.name || "-", company: co });
      perReportCompany[co] = (perReportCompany[co] || 0) + 1;
      // 회사별 실인원(중복 제외)은 아래에서 따로 집계
      if (!bucket.companyCount[co]) bucket.companyCount[co] = new Set();
      bucket.companyCount[co].add(a.user_id);
    });

    bucket.reports.push({
      date: p.activity_date,
      title: p.title,
      content: p.content || "",
      expense: Number(p.expense_amount) || 0,
      headcount: names.length,
      companyBreakdown: perReportCompany,
      attendees: names,
    });
  });

  const monthly = Object.fromEntries(
    Object.entries(monthlyRaw).map(([ym, v]) => {
      const attendeeCount = v.attendees.size;
      const { byExpense, byHead, amount } = calcSubsidy(v.expense, attendeeCount);

      // 회사별 실인원(중복 제외)과 그 비율에 따른 지원금 배분
      const companyRows = allocateByCompany(
        amount,
        Object.entries(v.companyCount)
          .map(([co, set]) => ({ company: co, count: set.size }))
          .sort((a, b) => b.count - a.count),
        attendeeCount
      );

      const grossHeadcount = v.reports.reduce((s, r) => s + r.headcount, 0);

      return [ym, {
        attendeeCount,
        grossHeadcount,
        expense: v.expense,
        byExpense,
        byHead,
        amount,
        reports: v.reports.sort((a, b) => (a.date < b.date ? -1 : 1)),
        companyRows,
      }];
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
          {isStaff && <DescriptionEditor clubId={club.id} current={club.description} />}
          {isStaff && <CoverImageUploader clubId={club.id} />}
                    {canRequestClose && club.status === "active" && (
            <CloseRequestButton clubId={club.id} userId={authUser.id} alreadyRequested={alreadyRequestedClose} />
          )}
          {isMemberOfThisClub && !isChair && (
            <WithdrawButton memberId={myMembership.id} alreadyRequested={myMembership.withdrawal_requested} />
          )}
          {isChair && (
            <span className="co-tag" title="회장은 회장 교체 후에 탈회할 수 있습니다.">회장은 회장 교체 후 탈회할 수 있습니다</span>
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
          isStaff={isStaff}
          canWriteReport={canWriteReport}
          canWritePost={canWritePost}
          canManageRoles={canManageRoles}
          chairHistory={chairHistory}
          isGuest={isGuest}
        />
      </div>
    </div>
  );
}
