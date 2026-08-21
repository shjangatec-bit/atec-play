"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CloseRequestButton({ clubId, userId, alreadyRequested }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!confirm("이 동호회의 폐설을 신청할까요? 통합관리자 승인 후 폐설됩니다.")) return;
    setSaving(true);
    const { error } = await supabase.from("club_lifecycle_requests").insert({
      type: "close",
      club_id: clubId,
      requester_id: userId,
      status: "pending",
    });
    setSaving(false);
    if (error) {
      alert("신청 실패: " + error.message);
      return;
    }
    alert("폐설 신청이 접수되었습니다. 통합관리자 승인을 기다려주세요.");
    router.refresh();
  }

  if (alreadyRequested) {
    return <span className="badge badge-amber">폐설 신청 대기중</span>;
  }

  return (
    <button className="btn-sm btn-outline" onClick={submit} disabled={saving}>
      {saving ? "신청 중..." : "폐설 신청"}
    </button>
  );
}
