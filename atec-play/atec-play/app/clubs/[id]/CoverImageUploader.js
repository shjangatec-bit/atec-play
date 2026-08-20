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
    const path = `club-covers/${clubId}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("club-files").upload(path, file);
    if (!upErr) {
      const { data: pub } = supabase.storage.from("club-files").getPublicUrl(path);
      await supabase.from("clubs").update({ cover_image_url: pub.publicUrl }).eq("id", clubId);
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <label className="btn-sm btn-outline" style={{ cursor: "pointer", display: "inline-block" }}>
      {saving ? "업로드 중..." : "대표사진 변경"}
      <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} disabled={saving} />
    </label>
  );
}
