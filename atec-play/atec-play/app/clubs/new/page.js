"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewClubRequestPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !userId) return;
    setSaving(true);
    setError("");

    let fileUrl = null;
    if (file) {
      const path = `club-requests/${userId}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
      if (upErr) {
        setError("파일 업로드 중 문제가 발생했습니다: " + upErr.message);
        setSaving(false);
        return;
      }
      const { data: pub } = supabase.storage.from("club-files").getPublicUrl(path);
      fileUrl = pub.publicUrl;
    }

    const { error: insErr } = await supabase.from("club_lifecycle_requests").insert({
      type: "create",
      proposed_name: name,
      requester_id: userId,
      file_url: fileUrl,
      status: "pending",
    });

    if (insErr) {
      setError("신청 처리 중 문제가 발생했습니다: " + insErr.message);
      setSaving(false);
      return;
    }
    router.push("/clubs");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <div className="main" style={{ gridColumn: "1 / -1", maxWidth: 480, margin: "60px auto" }}>
        <div className="card">
          <div className="section-title">동호회 개설 신청</div>
          {error && <div className="error-text">{error}</div>}
          <form onSubmit={submit}>
            <div className="field"><label>동호회명</label><input required value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field">
              <label>신청서 파일</label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <button className="btn btn-primary" disabled={saving}>{saving ? "제출 중..." : "신청 제출"}</button>
          </form>
          <div className="empty-note">신청 후 통합관리자 승인이 완료되면 동호회 목록에 반영됩니다.</div>
        </div>
      </div>
    </div>
  );
}
