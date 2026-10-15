import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ok } from "@/lib/db";
import { parseTerms, primaryTerm, likePattern, matchesAllTerms, snippet, uniqueById } from "@/lib/search";
import Sidebar from "@/components/Sidebar";
import SearchBox from "@/components/SearchBox";
import Highlight from "@/components/Highlight";

const BOARD_TYPES = ["notice", "general", "photo"]; // 활동보고서(지원금 근거)는 통합 검색에 포함하지 않음
const TYPE_LABEL = { notice: "공지", general: "게시글", photo: "사진" };
const CANDIDATE_LIMIT = 100;   // DB 1차 조회 상한
const SHOW_CLUBS = 20;
const SHOW_POSTS = 30;

const POST_SELECT = "id, club_id, type, title, content, created_at, author:author_id(name), club:club_id(name, status)";

export default async function SearchPage({ searchParams }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const raw = Array.isArray(searchParams?.q) ? searchParams.q[0] : searchParams?.q;
  const query = typeof raw === "string" ? raw.slice(0, 200) : "";
  const terms = parseTerms(query);

  let clubs = [];
  let posts = [];
  let truncated = false;

  if (terms.length > 0) {
    // DB 에는 가장 긴 검색어 하나로만 1차 조회하고(입력값은 LIKE 패턴 글자로만 쓰임), 나머지 검색어는 아래에서 정확히 걸러냅니다.
    const pattern = likePattern(primaryTerm(terms));
    const supabase = createClient();
    const clubCols = "id, name, description, status";
    const [c1, c2, p1, p2] = (await Promise.all([
      supabase.from("clubs").select(clubCols).ilike("name", pattern).limit(CANDIDATE_LIMIT),
      supabase.from("clubs").select(clubCols).ilike("description", pattern).limit(CANDIDATE_LIMIT),
      supabase.from("posts").select(POST_SELECT).in("type", BOARD_TYPES).ilike("title", pattern).order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT),
      supabase.from("posts").select(POST_SELECT).in("type", BOARD_TYPES).ilike("content", pattern).order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT),
    ])).map((r, i) => ok(r, ["동호회 이름 검색", "동호회 소개 검색", "게시글 제목 검색", "게시글 내용 검색"][i]));

    truncated = [c1, c2, p1, p2].some((r) => (r.data || []).length >= CANDIDATE_LIMIT);

    clubs = uniqueById(c1.data, c2.data)
      .filter((c) => matchesAllTerms([c.name, c.description], terms))
      .sort((a, b) => Number(matchesAllTerms([b.name], terms)) - Number(matchesAllTerms([a.name], terms)) || a.name.localeCompare(b.name, "ko"));
    posts = uniqueById(p1.data, p2.data)
      .filter((p) => matchesAllTerms([p.title, p.content], terms))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/search" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈</div>
            <h1>통합 검색</h1>
          </div>
        </div>

        <SearchBox action="/search" value={query} placeholder="동호회 이름·소개, 게시글 제목·내용 검색" clearHref="/search" />

        {terms.length === 0 ? (
          <div className="card">
            <div className="empty-note" style={{ padding: 0, lineHeight: 1.8 }}>
              동호회(이름·소개)와 게시판 글(공지·게시글·사진 제목·내용)을 한 번에 검색합니다.
              <br />
              띄어쓰기로 여러 단어를 입력하면 <b>모든 단어가 들어간</b> 결과만 보여줍니다. 대소문자는 구분하지 않습니다.
              <br />
              활동보고서는 통합 검색에 포함되지 않습니다. (각 동호회 화면의 활동보고서 탭에서 확인)
            </div>
          </div>
        ) : (
          <>
            <div className="empty-note" style={{ padding: "0 0 12px" }}>
              “{terms.join(" ")}” 검색 결과 — 동호회 {clubs.length}개 · 게시글 {posts.length}건
              {truncated && " (검색 범위가 넓어 일부만 조회했습니다. 검색어를 더 구체적으로 입력해 보세요)"}
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <div className="section-title">동호회 ({clubs.length})</div>
              {clubs.length === 0 && <div className="empty-note">일치하는 동호회가 없습니다.</div>}
              {clubs.slice(0, SHOW_CLUBS).map((c) => (
                <div className="post-item" key={c.id}>
                  <div className="ptitle">
                    <a href={`/clubs/${c.id}`}><Highlight text={c.name} terms={terms} /></a>{" "}
                    {c.status === "closed" && <span className="badge badge-gray">폐설</span>}
                  </div>
                  {c.description && (
                    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>
                      <Highlight text={snippet(c.description, terms)} terms={terms} />
                    </div>
                  )}
                </div>
              ))}
              {clubs.length > SHOW_CLUBS && <div className="empty-note">상위 {SHOW_CLUBS}개만 표시합니다. 검색어를 더 구체적으로 입력해 보세요.</div>}
            </div>

            <div className="card">
              <div className="section-title">게시글 ({posts.length})</div>
              {posts.length === 0 && <div className="empty-note">일치하는 게시글이 없습니다.</div>}
              {posts.slice(0, SHOW_POSTS).map((p) => (
                <div className="post-item" key={p.id}>
                  <div className="ptitle">
                    <span className="badge badge-gray" style={{ marginRight: 6 }}>{TYPE_LABEL[p.type] || p.type}</span>
                    <a href={`/clubs/${p.club_id}?tab=${p.type === "photo" ? "gallery" : "board"}`}>
                      <Highlight text={p.title} terms={terms} />
                    </a>
                  </div>
                  <div className="pmeta">
                    <span>{p.club?.name}</span>
                    <span>{p.author?.name}</span>
                    <span className="mono">{new Date(p.created_at).toLocaleDateString("ko-KR")}</span>
                  </div>
                  {p.content && (
                    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
                      <Highlight text={snippet(p.content, terms)} terms={terms} />
                    </div>
                  )}
                </div>
              ))}
              {posts.length > SHOW_POSTS && <div className="empty-note">최신 {SHOW_POSTS}건만 표시합니다. 검색어를 더 구체적으로 입력해 보세요.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
