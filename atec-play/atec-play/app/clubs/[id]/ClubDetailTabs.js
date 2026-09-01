"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { key: "members", label: "회원 현황" },
  { key: "board", label: "게시판" },
  { key: "gallery", label: "사진 갤러리" },
  { key: "report", label: "활동보고서" },
  { key: "budget", label: "지원금 현황" },
  { key: "permissions", label: "회원 권한" },
];

const CLUB_PERM_LABELS = [
  { code: "CLUB_MEMBER_APPROVE", label: "가입/탈회 승인" },
  { code: "CLUB_VIEW", label: "동호회 정보 조회" },
  { code: "CLUB_POST_WRITE", label: "게시글 작성" },
  { code: "CLUB_REPORT_WRITE", label: "활동보고서/증빙 업로드" },
  { code: "CLUB_REPORT_VIEW", label: "증빙 열람" },
  { code: "CLUB_BUDGET_VIEW", label: "지원금 현황 조회" },
];

export default function ClubDetailTabs({
  club,
  members,
  boardPosts,
  reportPosts,
  unitAmount,
  monthly,
  clubMembersForCheck,
  currentUserId,
  canApprove,
  canWriteReport,
  canWritePost,
  isGuest,
  memberPermissions = {},
}) {
  const [tab, setTab] = useState("board");
  const router = useRouter();
  const supabase = createClient();
  const visibleTabs = isGuest
    ? TABS.filter((t) => t.key === "board" || t.key === "gallery")
    : TABS.filter((t) => t.key !== "permissions" || canApprove);

  async function toggleMemberPermission(userId, code, isOn) {
    const { error } = isOn
      ? await supabase.from("user_permissions").delete().eq("user_id", userId).eq("club_id", club.id).eq("permission_code", code)
      : await supabase.from("user_permissions").insert({ user_id: userId, club_id: club.id, permission_code: code, granted_by: currentUserId });
    if (error) {
      alert("권한 변경 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  async function processMember(memberId, status) {
    const { error } = await supabase.from("club_members").update({ status, processed_by: currentUserId, processed_at: new Date().toISOString() }).eq("id", memberId);
    if (error) {
      alert("처리 실패: " + error.message);
      return;
    }

    if (status === "approved") {
      const member = members.find((m) => m.id === memberId);
      if (member?.user?.id) {
        const defaultCodes = ["CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_BUDGET_VIEW"];
        const rows = defaultCodes.map((code) => ({
          user_id: member.user.id,
          club_id: club.id,
          permission_code: code,
          granted_by: currentUserId,
        }));
        const { error: permErr } = await supabase.from("user_permissions").upsert(rows, { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true });
        if (permErr) {
          alert(
            "가입 승인은 됐지만 기본 권한 부여에 실패했습니다: " +
              permErr.message +
              "\n권한 설정 화면에서 회원 템플릿을 다시 적용해 주세요."
          );
        }
      }
    }
    router.refresh();
  }

  async function processWithdrawal(memberId, approve) {
    if (approve) {
      const member = members.find((m) => m.id === memberId);
      const { error } = await supabase
        .from("club_members")
        .update({ status: "withdrawn", withdrawal_requested: false, processed_by: currentUserId, processed_at: new Date().toISOString() })
        .eq("id", memberId);
      if (error) {
        alert("처리 실패: " + error.message);
        return;
      }
      if (member?.user?.id) {
        const { error: permErr } = await supabase.from("user_permissions").delete().eq("user_id", member.user.id).eq("club_id", club.id);
        if (permErr) {
          alert(
            "탈회 처리는 됐지만 이 동호회 관련 권한 회수에 실패했습니다: " +
              permErr.message +
              "\n권한 설정 화면에서 수동으로 정리해 주세요."
          );
        }
      }
    } else {
      const { error } = await supabase.from("club_members").update({ withdrawal_requested: false }).eq("id", memberId);
      if (error) {
        alert("처리 실패: " + error.message);
        return;
      }
    }
    router.refresh();
  }

  const approvedMembers = members.filter((m) => m.status === "approved" && !m.withdrawal_requested);
  const pendingMembers = members.filter((m) => m.status === "pending");
  const withdrawalMembers = members.filter((m) => m.status === "approved" && m.withdrawal_requested);
  const gallery = boardPosts.filter((p) => p.type === "photo");
  const notices = boardPosts.filter((p) => p.type !== "photo");

  return (
    <div>
      <div className="tabbar">
        {visibleTabs.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? " active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "members" && !isGuest && (
        <div className="grid-3" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
          <div className="card">
            <div className="section-title">회원 현황 ({approvedMembers.length}명)</div>
            <table>
              <tbody>
                {approvedMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.user?.name} <span className="co-tag">{m.user?.company?.name}</span></td>
                    <td style={{ textAlign: "right" }}>
                      <span className={`badge ${m.role_label === "회장" ? "badge-brand" : m.role_label === "총무" ? "badge-gray" : ""}`}>{m.role_label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="section-title">가입 대기</div>
            {pendingMembers.length === 0 && <div className="empty-note">대기 중인 신청이 없습니다.</div>}
            <table>
              <tbody>
                {pendingMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.user?.name} <span className="co-tag">{m.user?.company?.name}</span></td>
                    <td className="row-flex" style={{ justifyContent: "flex-end" }}>
                      {canApprove ? (
                        <>
                          <button className="btn-sm btn-approve" onClick={() => processMember(m.id, "approved")}>승인</button>
                          <button className="btn-sm btn-reject" onClick={() => processMember(m.id, "rejected")}>반려</button>
                        </>
                      ) : (
                        <span className="empty-note" style={{ padding: 0 }}>처리 권한 없음</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="section-title">탈회 신청 대기</div>
            {withdrawalMembers.length === 0 && <div className="empty-note">대기 중인 탈회 신청이 없습니다.</div>}
            <table>
              <tbody>
                {withdrawalMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.user?.name} <span className="co-tag">{m.user?.company?.name}</span></td>
                    <td className="row-flex" style={{ justifyContent: "flex-end" }}>
                      {canApprove ? (
                        <>
                          <button className="btn-sm btn-approve" onClick={() => processWithdrawal(m.id, true)}>승인</button>
                          <button className="btn-sm btn-reject" onClick={() => processWithdrawal(m.id, false)}>반려</button>
                        </>
                      ) : (
                        <span className="empty-note" style={{ padding: 0 }}>처리 권한 없음</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "board" && <BoardTab posts={notices} clubId={club.id} currentUserId={currentUserId} canWrite={canWritePost} canApprove={canApprove} type="notice" isGuest={isGuest} />}
      {tab === "gallery" && <BoardTab posts={gallery} clubId={club.id} currentUserId={currentUserId} canWrite={canWritePost} canApprove={canApprove} type="photo" isGallery isGuest={isGuest} />}

      {tab === "report" && !isGuest && (
        <ReportTab
          posts={reportPosts}
          clubId={club.id}
          currentUserId={currentUserId}
          canWrite={canWriteReport}
          unitAmount={unitAmount}
          clubMembers={clubMembersForCheck}
        />
      )}

      {tab === "budget" && !isGuest && (
        <div className="card">
          <div className="empty-note" style={{ padding: "0 0 12px" }}>
            이 동호회의 지원 단가는 <b style={{ color: "var(--ink-2)" }}>1인당 {unitAmount.toLocaleString()}원</b>이며, 활동보고서에 체크된 참석 인원을 기준으로 매달 자동 집계됩니다.
          </div>
          <table>
            <thead>
              <tr><th>월</th><th style={{ textAlign: "right" }}>참석 인원</th><th style={{ textAlign: "right" }}>지원금액</th></tr>
            </thead>
            <tbody>
              {Object.entries(monthly).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([ym, count]) => (
                <tr key={ym}>
                  <td className="mono">{ym}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{count}명</td>
                  <td className="mono" style={{ textAlign: "right" }}>{(count * unitAmount).toLocaleString()}원</td>
                </tr>
              ))}
              {Object.keys(monthly).length === 0 && (
                <tr><td colSpan={3}><div className="empty-note">등록된 활동보고서가 없습니다.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "permissions" && canApprove && (
        <div className="card">
          <div className="empty-note" style={{ padding: "0 0 10px" }}>
            이 동호회 회원의 개별 권한만 조정할 수 있습니다. (전사 권한이나 다른 동호회 권한은 여기서 바꿀 수 없습니다)
          </div>
          <table className="toggle-table">
            <thead>
              <tr>
                <th>회원</th>
                {CLUB_PERM_LABELS.map((p) => (
                  <th key={p.code} style={{ textAlign: "center", fontSize: 11 }}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.filter((m) => m.status === "approved" && m.user).map((m) => {
                const myPerms = memberPermissions[m.user?.id] || [];
                return (
                  <tr key={m.id}>
                    <td>
                      {m.user?.name} <span className="co-tag">{m.user?.company?.name}</span>
                    </td>
                    {CLUB_PERM_LABELS.map((p) => {
                      const on = myPerms.includes(p.code);
                      return (
                        <td key={p.code} style={{ textAlign: "center" }}>
                          <span
                            className={`switch${on ? " on" : ""}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => toggleMemberPermission(m.user?.id, p.code, on)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {members.filter((m) => m.status === "approved" && m.user).length === 0 && (
                <tr><td colSpan={CLUB_PERM_LABELS.length + 1}><div className="empty-note">승인된 회원이 없습니다.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BoardTab({ posts, clubId, currentUserId, canWrite, canApprove, type, isGallery, isGuest }) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentSaving, setCommentSaving] = useState({});
  const [likeSaving, setLikeSaving] = useState({});
  const [deleting, setDeleting] = useState({});
  const likeLockRef = useRef({});

  function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  // Supabase public URL에서 스토리지 상 실제 경로만 뽑아냅니다. (첨부파일도 같이 지우기 위함)
  function storagePathFromUrl(url) {
    if (!url) return null;
    const marker = "/club-files/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    try {
      return decodeURIComponent(url.slice(idx + marker.length));
    } catch {
      return url.slice(idx + marker.length);
    }
  }

  // 삭제 가능 여부: 글쓴이 본인이거나, 이 동호회의 가입/탈회 승인 권한(회장·총무·통합관리자)이 있으면 가능
  function canDeletePost(post) {
    return post.author_id === currentUserId || canApprove;
  }

  async function deletePost(post) {
    if (!confirm(`"${post.title}"${isGallery ? " 사진을" : " 글을"} 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return;
    setDeleting((d) => ({ ...d, [post.id]: true }));

    const paths = (post.post_attachments || []).map((a) => storagePathFromUrl(a.file_url)).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("club-files").remove(paths);
      // 스토리지 파일 삭제가 실패해도(권한 등) 게시글 삭제는 계속 진행합니다. 최악의 경우 안 쓰는 파일만 남습니다.
    }

    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    setDeleting((d) => ({ ...d, [post.id]: false }));
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  async function toggleLike(postId, alreadyLiked) {
    // useState는 반영이 비동기라 초고속 연타(하트 버튼 습관적 더블클릭 등)를 못 막는 경우가 있어,
    // ref로 즉시(동기적으로) 잠급니다.
    if (isGuest || likeLockRef.current[postId]) return;
    likeLockRef.current[postId] = true;
    setLikeSaving((s) => ({ ...s, [postId]: true }));

    let error;
    if (alreadyLiked) {
      ({ error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId));
    } else {
      ({ error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: currentUserId }));
      // 화면이 최신 상태를 못 따라와서 이미 좋아요된 걸 또 누른 경우, 에러 대신 좋아요 취소로 자동 처리
      if (error && (error.code === "23505" || /duplicate key/i.test(error.message || ""))) {
        ({ error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId));
      }
    }

    likeLockRef.current[postId] = false;
    setLikeSaving((s) => ({ ...s, [postId]: false }));
    if (error) {
      alert("좋아요 처리 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  async function submitComment(postId) {
    const text = (commentDrafts[postId] || "").trim();
    if (!text || commentSaving[postId]) return;
    setCommentSaving((s) => ({ ...s, [postId]: true }));
    const { error } = await supabase.from("post_comments").insert({ post_id: postId, author_id: currentUserId, content: text });
    setCommentSaving((s) => ({ ...s, [postId]: false }));
    if (error) {
      alert("댓글 등록 실패: " + error.message);
      return;
    }
    setCommentDrafts((d) => ({ ...d, [postId]: "" }));
    router.refresh();
  }

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { data: post, error } = await supabase
      .from("posts")
      .insert({ club_id: clubId, author_id: currentUserId, type, title, content })
      .select()
      .single();

    if (error || !post) {
      setSaving(false);
      alert("게시글 등록 실패: " + (error?.message || "알 수 없는 오류"));
      return;
    }

    if (isGallery && file) {
      const path = `${clubId}/${post.id}/${Date.now()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
      if (upErr) {
        alert("사진 업로드 실패: " + upErr.message);
      } else {
        const { data: pub } = supabase.storage.from("club-files").getPublicUrl(path);
        const { error: attachErr } = await supabase.from("post_attachments").insert({ post_id: post.id, file_url: pub.publicUrl, file_type: "photo" });
        if (attachErr) alert("사진 정보 저장 실패: " + attachErr.message);
      }
    }
    setTitle("");
    setContent("");
    setFile(null);
    setSaving(false);
    router.refresh();
  }

  if (isGallery) {
    return (
      <div className="card">
        <div className="section-title">사진 갤러리</div>
        <div className="gallery-grid">
          {posts.map((p) => {
            const photoUrl = p.post_attachments?.[0]?.file_url;
            const canDelete = canDeletePost(p);
            return (
              <div
                className="gph"
                key={p.id}
                title={p.title}
                onClick={() => photoUrl && setLightbox({ url: photoUrl, title: p.title })}
                style={{
                  position: "relative",
                  cursor: photoUrl ? "pointer" : "default",
                  ...(photoUrl ? { backgroundImage: `url(${photoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
                }}
              >
                {canDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePost(p); }}
                    disabled={deleting[p.id]}
                    title="사진 삭제"
                    style={{
                      position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%",
                      border: "none", background: "rgba(20,24,31,0.65)", color: "#fff", fontSize: 12,
                      lineHeight: "22px", textAlign: "center", cursor: "pointer", padding: 0,
                    }}
                  >
                    {deleting[p.id] ? "…" : "✕"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {posts.length === 0 && <div className="empty-note">등록된 사진이 없습니다.</div>}
        {lightbox && (
          <div
            onClick={() => setLightbox(null)}
            style={{
              position: "fixed", inset: 0, background: "rgba(20,24,31,0.85)", zIndex: 1000,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out",
            }}
          >
            <img
              src={lightbox.url}
              alt={lightbox.title}
              style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{ color: "#fff", fontSize: 14, marginTop: 14 }}>{lightbox.title}</div>
            <button
              onClick={() => setLightbox(null)}
              className="btn-sm btn-outline"
              style={{ marginTop: 16, background: "rgba(255,255,255,0.1)", color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
            >
              닫기
            </button>
          </div>
        )}
        {canWrite && (
          <form onSubmit={submit} className="row-flex" style={{ marginTop: 14, flexWrap: "wrap" }}>
            <input placeholder="사진 제목" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 160, height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }} />
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn-sm btn-outline" disabled={saving}>{saving ? "업로드 중..." : "사진 추가"}</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="section-title">게시판</div>
        {posts.map((p) => {
          const likes = p.post_likes || [];
          const likedByMe = likes.some((l) => l.user_id === currentUserId);
          const comments = p.post_comments || [];
          return (
            <div className="post-item" key={p.id}>
              <div className="ptitle">{p.type === "notice" && <span className="pin">[공지] </span>}{p.title}</div>
              <div className="pmeta"><span>{p.author?.name}</span><span className="mono">{new Date(p.created_at).toLocaleDateString("ko-KR")}</span></div>
              {p.content && <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>{p.content}</div>}

              <div className="row-flex" style={{ marginTop: 8, gap: 10, alignItems: "center" }}>
                <button
                  className={`btn-sm ${likedByMe ? "btn-approve" : "btn-outline"}`}
                  onClick={() => toggleLike(p.id, likedByMe)}
                  disabled={isGuest || likeSaving[p.id]}
                  title={isGuest ? "계정 승인 후 이용 가능합니다" : undefined}
                >
                  👍 좋아요{likes.length > 0 ? ` ${likes.length}` : ""}
                </button>
                <span className="co-tag">댓글 {comments.length}개</span>
                {canDeletePost(p) && (
                  <button
                    className="btn-sm btn-outline"
                    style={{ marginLeft: "auto" }}
                    onClick={() => deletePost(p)}
                    disabled={deleting[p.id]}
                  >
                    {deleting[p.id] ? "삭제 중..." : "삭제"}
                  </button>
                )}
              </div>

              {comments.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                  {comments.map((c) => (
                    <div key={c.id} style={{ fontSize: 12.5, padding: "3px 0" }}>
                      <b>{c.author?.name}</b> <span style={{ color: "var(--ink-2)" }}>{c.content}</span>
                    </div>
                  ))}
                </div>
              )}

              {!isGuest && (
                <div className="row-flex" style={{ marginTop: 8, gap: 6 }}>
                  <input
                    placeholder="댓글을 입력하세요"
                    value={commentDrafts[p.id] || ""}
                    onChange={(e) => setCommentDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") submitComment(p.id); }}
                    style={{ flex: 1, height: 32, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 12.5 }}
                  />
                  <button className="btn-sm btn-outline" onClick={() => submitComment(p.id)} disabled={commentSaving[p.id]}>
                    {commentSaving[p.id] ? "등록 중..." : "등록"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {posts.length === 0 && <div className="empty-note">등록된 게시글이 없습니다.</div>}
      </div>
      {canWrite && (
        <div className="card">
          <div className="section-title">게시글 작성</div>
          <form onSubmit={submit}>
            <div className="field"><label>제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
            <div className="field"><label>내용</label><textarea value={content} onChange={(e) => setContent(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={saving}>{saving ? "등록 중..." : "게시글 등록"}</button>
          </form>
        </div>
      )}
    </div>
  );
}

function ReportTab({ posts, clubId, currentUserId, canWrite, unitAmount, clubMembers }) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [checked, setChecked] = useState({});
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const checkedCount = Object.values(checked).filter(Boolean).length;

  function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !activityDate) return;
    setSaving(true);

    const { data: post, error } = await supabase
      .from("posts")
      .insert({ club_id: clubId, author_id: currentUserId, type: "report", title, content, activity_date: activityDate })
      .select()
      .single();

    if (error || !post) {
      setSaving(false);
      alert("보고서 등록 실패: " + (error?.message || "알 수 없는 오류"));
      return;
    }

    const attendeeIds = Object.keys(checked).filter((id) => checked[id]);
    if (attendeeIds.length > 0) {
      const { error: attErr } = await supabase
        .from("post_attendees")
        .insert(attendeeIds.map((user_id) => ({ post_id: post.id, user_id })));
      if (attErr) alert("참석자 저장 중 문제가 발생했습니다: " + attErr.message);
    }

    if (files.length > 0) {
      // 파일마다 확장자로 증빙(pdf/jpg/jpeg/png)/첨부파일(그 외) 자동 구분해서 각각 저장
      // 이름규칙: {동호회id}/{보고서id}/{업로드시각}-{순번}-{원본파일명(특수문자 제거)}
      const failed = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${clubId}/${post.id}/${Date.now()}-${i}-${safeName(f.name)}`;
        const { error: upErr } = await supabase.storage.from("club-files").upload(path, f);
        if (upErr) {
          failed.push(`${f.name} (업로드 실패: ${upErr.message})`);
          continue;
        }
        const { data: pub } = supabase.storage.from("club-files").getPublicUrl(path);
        const fileType = /\.(pdf|jpg|jpeg|png)$/i.test(f.name) ? "receipt" : "document";
        const { error: attachErr } = await supabase
          .from("post_attachments")
          .insert({ post_id: post.id, file_url: pub.publicUrl, file_type: fileType });
        if (attachErr) failed.push(`${f.name} (저장 실패: ${attachErr.message})`);
      }
      if (failed.length > 0) {
        alert("보고서는 등록됐지만 다음 파일은 첨부되지 않았습니다:\n" + failed.join("\n"));
      }
    }

    setTitle(""); setContent(""); setActivityDate(""); setChecked({}); setFiles([]);
    setSaving(false);
    alert("보고서가 등록되었습니다.");
    router.refresh();
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="section-title">활동보고서</div>
        {posts.map((p) => {
          const count = p.post_attendees?.length || 0;
          return (
            <div className="post-item" key={p.id}>
              <div className="ptitle">{p.title}</div>
              <div className="pmeta">
                <span>{p.author?.name}</span>
                <span className="mono">활동일 {p.activity_date}</span>
                <span>참석 {count}명 · 지원금 <span className="mono">{(count * unitAmount).toLocaleString()}</span></span>
              </div>
              {p.content && <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, whiteSpace: "pre-wrap" }}>{p.content}</div>}
              <div className="row-flex" style={{ marginTop: 8, flexWrap: "wrap" }}>
                {(p.post_attachments || []).length === 0 && (
                  <span className="empty-note" style={{ padding: 0 }}>첨부파일 없음</span>
                )}
                {(p.post_attachments || []).map((a, i) => (
                  <a key={i} href={a.file_url} target="_blank" rel="noreferrer" className={`badge ${a.file_type === "receipt" ? "badge-red" : "badge-gray"}`}>
                    {a.file_type === "receipt" ? "증빙 열기" : "첨부파일 열기"}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        {posts.length === 0 && <div className="empty-note">등록된 활동보고서가 없습니다.</div>}
      </div>
      {canWrite && (
        <div className="card">
          <div className="section-title">보고서 작성</div>
          <div className="empty-note" style={{ padding: "0 0 12px" }}>
            <a href="/동호회_보조금_신청양식.pdf" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>
              보조금 신청양식 다운로드
            </a> — 참석자 명단·비용 지출내역을 작성해서 아래 첨부파일에 함께 올려주세요.
          </div>
          <form onSubmit={submit}>
            <div className="field"><label>제목</label><input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
            <div className="field"><label>활동일자</label><input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} required /></div>
            <div className="field"><label>내용</label><textarea value={content} onChange={(e) => setContent(e.target.value)} /></div>
            <div className="field">
              <label>참석자 체크 <span className="co-tag">(1인당 {unitAmount.toLocaleString()}원 자동 계산)</span></label>
              <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                {clubMembers.map((m) => (
                  <label key={m.user_id} className="row-flex" style={{ gap: 8, padding: "4px 0", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      style={{ width: 14, height: 14 }}
                      checked={!!checked[m.user_id]}
                      onChange={(e) => setChecked((c) => ({ ...c, [m.user_id]: e.target.checked }))}
                    />
                    {m.user?.name} <span className="co-tag">{m.user?.company?.name}</span>
                  </label>
                ))}
              </div>
              <div className="empty-note" style={{ textAlign: "right", padding: "6px 0 0" }}>
                현재 체크 {checkedCount}명 → 예상 지원금 <b className="mono" style={{ color: "var(--ink)" }}>{(checkedCount * unitAmount).toLocaleString()}원</b>
              </div>
            </div>
            <div className="field">
              <label>첨부파일 (양식파일/증빙, 여러 개 선택 가능)</label>
              <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              {files.length > 0 && (
                <div className="empty-note" style={{ padding: "4px 0 0" }}>
                  선택된 파일 {files.length}개 — {files.map((f) => f.name).join(", ")}
                </div>
              )}
            </div>
            <button className="btn btn-primary" disabled={saving}>{saving ? "등록 중..." : "보고서 등록"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
