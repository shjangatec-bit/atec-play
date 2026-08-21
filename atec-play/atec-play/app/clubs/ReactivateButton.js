"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ReactivateButton({ clubId }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function reactivate() {
    if (!confirm("이 동호회를 다시 운영중 상태로 되돌릴까요?")) return;
    setSaving(true);
    const { error } = await supabase.from("clubs").update({ status: "active" }).eq("id", clubId);
    setSaving(false);
    if (error) {
      alert("처리 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button className="btn-sm btn-approve" onClick={reactivate} disabled={saving}>
      {saving ? "처리 중..." : "다시 열기"}
    </button>
  );
}
