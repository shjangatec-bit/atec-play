import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import JoinButton from "@/components/JoinButton";
import ReactivateButton from "./ReactivateButton";
import SearchBox from "@/components/SearchBox";
import Highlight from "@/components/Highlight";
import { parseTerms, matchesAllTerms } from "@/lib/search";

import { ok } from "@/lib/db";
export default async function ClubsPage({ searchParams }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const canReactivate = hasPermission(permissions, "CLUB_CLOSE_APPROVE");
  const canCreateClub = hasPermission(permissions, "CLUB_CREATE_REQUEST");

  const supabase = createClient();
  const { data: clubs } = ok(await supabase
    .from("clubs")
    .select("id, name, description, status, cover_image_url, club_members(status)")
    .order("name"), "동호회 목록");

  const { data: myMemberships } = ok(await supabase
    .from("club_members")
    .select("club_id, status")
    .eq("user_id", authUser.id), "내 가입 현황");
  const myStatusByClub = Object.fromEntries((myMemberships || []).map((m) => [m.club_id, m.status]));

  let visible = clubs || [];
  if (searchParams?.mine) {
    visible = visible.filter((c) => myStatusByClub[c.id] === "approved");
  }
  // 이름·소개 검색 (띄어쓰기로 나눈 단어가 모두 들어간 동호회만)
  const rawQ = Array.isArray(searchParams?.q) ? searchParams.q[0] : searchParams?.q;
  const query = typeof rawQ === "string" ? rawQ.slice(0, 200) : "";
  const terms = parseTerms(query);
  if (terms.length > 0) {
    visible = visible.filter((c) => matchesAllTerms([c.name, c.description], terms));
  }

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/clubs" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 동호회</div>
            <h1>{searchParams?.mine ? "내 동호회" : "동호회 현황"}</h1>
          </div>
          {!searchParams?.mine && canCreateClub && (
            <div className="top-actions">
              <a className="btn-sm btn-outline" href="/clubs/new">+ 동호회 개설 신청</a>
            </div>
          )}
        </div>
        <SearchBox
          action="/clubs"
          value={query}
          placeholder="동호회 이름·소개 검색"
          hidden={searchParams?.mine ? { mine: "1" } : {}}
          clearHref={searchParams?.mine ? "/clubs?mine=1" : "/clubs"}
        />
        {terms.length > 0 && (
          <div className="empty-note" style={{ padding: "0 0 12px" }}>
            “{terms.join(" ")}” 검색 결과 {visible.length}개 · 게시글까지 찾으려면 <a href={`/search?q=${encodeURIComponent(terms.join(" "))}`}>통합 검색</a>을 이용하세요.
          </div>
        )}
        {terms.length > 0 && visible.length === 0 && <div className="card"><div className="empty-note">일치하는 동호회가 없습니다.</div></div>}
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
                    <h3 style={club.status === "closed" ? { color: "var(--ink-3)" } : {}}><Highlight text={club.name} terms={terms} /></h3>
                    <div className="desc"><Highlight text={club.description} terms={terms} /></div>
                  </div>
                </a>
                <div className="body" style={{ paddingTop: 0 }}>
                  <div className="meta">
                    {club.status === "closed" ? (
                      <span className="row-flex" style={{ gap: 6 }}>
                        <span className="badge badge-gray">폐설</span>
                        {canReactivate && <ReactivateButton clubId={club.id} />}
                      </span>
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
