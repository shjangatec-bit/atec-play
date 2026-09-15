"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CoverImageUploader({ clubId }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `club-covers/${clubId}-${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
    if (upErr) {
      setSaving(false);
      alert("이미지 업로드 실패: " + upErr.message);
      return;
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from("club-files")
      .createSignedUrl(path, 31536000);
    if (signErr || !signed) {
      setSaving(false);
      alert("이미지 주소 생성 실패: " + (signErr?.message || ""));
      return;
    }
    const { error: updErr } = await supabase.from("clubs").update({ cover_image_url: signed.signedUrl }).eq("id", clubId);
    setSaving(false);
    if (updErr) {
      alert("대표사진 정보 저장 실패: " + updErr.message);
      return;
    }
    alert("대표사진이 변경되었습니다.");
    router.refresh();
  }

  return (
    <label className="btn-sm btn-outline" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {saving ? "업로드 중..." : "대표사진 변경"}
      <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} disabled={saving} />
    </label>
  );
}
