import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ClubDetailTabs from "./ClubDetailTabs";

export default async function ClubDetailPage({ params }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const supabase = createClient();
  const clubId = params.id;

  const { data: club } = await supabase.from("clubs").select("*").eq("id", clubId).single();
  if (!club) redirect("/clubs");

  const { data: members } = await supabase
    .from("club_members")
    .select("id, role_label, status, applied_at, user:user_id(id, name, company:company_id(name))")
    .eq("club_id", clubId)
    .order("applied_at");

  const { data: boardPosts } = await supabase
    .from("posts")
    .select("id, type, title, content, created_at, author:author_id(name)")
    .eq("club_id", clubId)
    .in("type", ["notice", "general"])
    .order("created_at", { ascending: false });

  const { data: reportPosts } = await supabase
    .from("posts")
    .select(
      "id, title, activity_date, created_at, author:author_id(name), post_attendees(user_id, user:user_id(name, company:company_id(name))), post_attachments(file_url, file_type)"
    )
    .eq("club_id", clubId)
    .eq("type", "report")
    .order("activity_date", { ascending: false });

  const { data: rate } = await supabase
    .from("club_support_rates")
    .select("unit_amount")
    .eq("club_id", clubId)
    .maybeSingle();
  const unitAmount = rate?.unit_amount || 0;

  const { data: clubMembersForCheck } = await supabase
    .from("club_members")
    .select("user_id, user:user_id(name, company:company_id(name))")
    .eq("club_id", clubId)
    .eq("status", "approved");

  const canApprove = hasPermission(permissions, "CLUB_MEMBER_APPROVE", { clubId });
  const canWriteReport = hasPermission(permissions, "CLUB_REPORT_WRITE", { clubId });
  const canWritePost = hasPermission(permissions, "CLUB_POST_WRITE", { clubId });

  // 월별 자동 집계
  const monthly = {};
  (reportPosts || []).forEach((p) => {
    if (!p.activity_date) return;
    const ym = p.activity_date.slice(0, 7);
    monthly[ym] = (monthly[ym] || 0) + (p.post_attendees?.length || 0);
  });

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/clubs" />
      <div className="main">
        <div className="crumb">동호회 / {club.name}</div>
        <div className="detail-head">
          <div className="thumb-lg" />
          <div>
            <h1>{club.name}</h1>
            <div className="sub">
              {club.description} · {club.status === "active" ? "운영중" : "폐설"}
            </div>
          </div>
        </div>

        <ClubDetailTabs
          club={club}
          members={members || []}
          boardPosts={boardPosts || []}
          reportPosts={reportPosts || []}
          unitAmount={unitAmount}
          monthly={monthly}
          clubMembersForCheck={clubMembersForCheck || []}
          currentUserId={authUser.id}
          canApprove={canApprove}
          canWriteReport={canWriteReport}
          canWritePost={canWritePost}
        />
      </div>
    </div>
  );
}
