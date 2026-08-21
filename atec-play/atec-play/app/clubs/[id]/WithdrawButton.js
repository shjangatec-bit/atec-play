"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function WithdrawButton({ memberId, alreadyRequested }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!confirm("이 동호회에서 탈회를 신청할까요? 회장/총무 승인 후 탈회 처리됩니다.")) return;
    setSaving(true);
    const { error } = await supabase.from("club_members").update({ withdrawal_requested: true }).eq("id", memberId);
    setSaving(false);
    if (error) {
      alert("신청 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  if (alreadyRequested) {
    return <span className="badge badge-amber">탈회 신청 대기중</span>;
  }

  return (
    <button className="btn-sm btn-outline" onClick={submit} disabled={saving}>
      {saving ? "신청 중..." : "탈회 신청"}
    </button>
  );
}
