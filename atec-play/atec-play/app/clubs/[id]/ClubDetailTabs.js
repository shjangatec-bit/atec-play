"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { key: "members", label: "회원 현황" },
  { key: "board", label: "게시판" },
  { key: "gallery", label: "사진 갤러리" },
  { key: "report", label: "활동보고서" },
  { key: "budget", label: "지원금 현황" },
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
}) {
  const [tab, setTab] = useState("board");
  const router = useRouter();
  const supabase = createClient();

  async function processMember(memberId, status) {
    await supabase.from("club_members").update({ status, processed_by: currentUserId, processed_at: new Date().toISOString() }).eq("id", memberId);

    if (status === "approved") {
      const member = members.find((m) => m.id === memberId);
      if (member) {
        const defaultCodes = ["CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_BUDGET_VIEW"];
        const rows = defaultCodes.map((code) => ({
          user_id: member.user.id,
          club_id: club.id,
          permission_code: code,
          granted_by: currentUserId,
        }));
        await supabase.from("user_permissions").upsert(rows, { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true });
      }
    }
    router.refresh();
  }

  const approvedMembers = members.filter((m) => m.status === "approved");
  const pendingMembers = members.filter((m) => m.status === "pending");
  const gallery = boardPosts.filter((p) => p.type === "photo");
  const notices = boardPosts.filter((p) => p.type !== "photo");

  return (
    <div>
      <div className="tabbar">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? " active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "members" && (
        <div className="grid-2">
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
        </div>
      )}

      {tab === "board" && <BoardTab posts={notices} clubId={club.id} currentUserId={currentUserId} canWrite={canWritePost} type="notice" />}
      {tab === "gallery" && <BoardTab posts={gallery} clubId={club.id} currentUserId={currentUserId} canWrite={canWritePost} type="photo" isGallery />}

      {tab === "report" && (
        <ReportTab
          posts={reportPosts}
          clubId={club.id}
          currentUserId={currentUserId}
          canWrite={canWriteReport}
          unitAmount={unitAmount}
          clubMembers={clubMembersForCheck}
        />
      )}

      {tab === "budget" && (
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
    </div>
  );
}

function BoardTab({ posts, clubId, currentUserId, canWrite, type, isGallery }) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { data: post, error } = await supabase
      .from("posts")
      .insert({ club_id: clubId, author_id: currentUserId, type, title, content })
      .select()
      .single();

    if (!error && post && isGallery && file) {
      const path = `${clubId}/${post.id}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
      if (!upErr) {
        const { data: pub } = supabase.storage.from("club-files").getPublicUrl(path);
        await supabase.from("post_attachments").insert({ post_id: post.id, file_url: pub.publicUrl, file_type: "photo" });
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
          {posts.map((p) => (
            <div className="gph" key={p.id} title={p.title} />
          ))}
        </div>
        {posts.length === 0 && <div className="empty-note">등록된 사진이 없습니다.</div>}
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
        {posts.map((p) => (
          <div className="post-item" key={p.id}>
            <div className="ptitle">{p.type === "notice" && <span className="pin">[공지] </span>}{p.title}</div>
            <div className="pmeta"><span>{p.author?.name}</span><span className="mono">{new Date(p.created_at).toLocaleDateString("ko-KR")}</span></div>
            {p.content && <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>{p.content}</div>}
          </div>
        ))}
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
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const checkedCount = Object.values(checked).filter(Boolean).length;

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !activityDate) return;
    setSaving(true);

    const { data: post, error } = await supabase
      .from("posts")
      .insert({ club_id: clubId, author_id: currentUserId, type: "report", title, content, activity_date: activityDate })
      .select()
      .single();

    if (!error && post) {
      const attendeeIds = Object.keys(checked).filter((id) => checked[id]);
      if (attendeeIds.length > 0) {
        await supabase.from("post_attendees").insert(attendeeIds.map((user_id) => ({ post_id: post.id, user_id })));
      }
      if (file) {
        const path = `${clubId}/${post.id}/${file.name}`;
        const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
        if (!upErr) {
          const { data: pub } = supabase.storage.from("club-files").getPublicUrl(path);
          const fileType = /\.(pdf|jpg|jpeg|png)$/i.test(file.name) ? "receipt" : "document";
          await supabase.from("post_attachments").insert({ post_id: post.id, file_url: pub.publicUrl, file_type: fileType });
        }
      }
    }
    setTitle(""); setContent(""); setActivityDate(""); setChecked({}); setFile(null);
    setSaving(false);
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
              <div className="row-flex" style={{ marginTop: 8, flexWrap: "wrap" }}>
                {(p.post_attachments || []).map((a, i) => (
                  <a key={i} href={a.file_url} target="_blank" rel="noreferrer" className={`badge ${a.file_type === "receipt" ? "badge-red" : "badge-gray"}`}>
                    {a.file_type === "receipt" ? "증빙" : "첨부파일"}
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
              <label>첨부파일 (양식파일/증빙)</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <button className="btn btn-primary" disabled={saving}>{saving ? "등록 중..." : "보고서 등록"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
