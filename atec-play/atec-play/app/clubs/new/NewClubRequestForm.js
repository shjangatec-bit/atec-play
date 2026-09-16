"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewClubRequestForm({ userId }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    let fileUrl = null;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `club-requests/${userId}-${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
      if (upErr) {
        setError("파일 업로드 중 문제가 발생했습니다: " + upErr.message);
        setSaving(false);
        return;
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from("club-files")
        .createSignedUrl(path, 31536000);
      if (signErr || !signed) {
        setError("파일 주소 생성에 실패했습니다: " + (signErr?.message || ""));
        setSaving(false);
        return;
      }
      fileUrl = signed.signedUrl;
    }

    const { error: insErr } = await supabase.from("club_lifecycle_requests").insert({
      type: "create",
      proposed_name: name,
      proposed_description: description,
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
    <div className="card">
      <div className="section-title">동호회 개설 신청</div>
      {error && <div className="error-text">{error}</div>}
      <form onSubmit={submit}>
        <div className="field"><label>동호회명</label><input required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field">
          <label>동호회 소개</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="어떤 활동을 하는 동호회인지 간단히 소개해 주세요. 동호회 목록에 표시됩니다."
            rows={3}
          />
        </div>
        <div className="field">
          <label>신청서 파일</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <button className="btn btn-primary" disabled={saving}>{saving ? "제출 중..." : "신청 제출"}</button>
      </form>
      <div className="empty-note">신청 후 통합관리자 승인이 완료되면 동호회 목록에 반영됩니다.</div>
    </div>
  );
}
