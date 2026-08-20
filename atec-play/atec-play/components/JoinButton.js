"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function JoinButton({ clubId, userId, alreadyApplied }) {
  const [applied, setApplied] = useState(alreadyApplied);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("club_members").insert({
      club_id: clubId,
      user_id: userId,
      role_label: "회원",
      status: "pending",
    });
    setLoading(false);
    if (!error) setApplied(true);
  }

  if (applied) {
    return (
      <button className="btn-sm btn-outline" disabled style={{ opacity: 0.5 }}>
        신청됨
      </button>
    );
  }

  return (
    <button className="btn-sm btn-outline" onClick={handleClick} disabled={loading}>
      {loading ? "처리 중..." : "가입 신청"}
    </button>
  );
}
