"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DisburseButton({ clubId, companyId, year, month, attendeeCount, amount, paidBy }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function markPaid() {
    setSaving(true);
    await supabase.from("club_budget_disbursements").upsert(
      {
        club_id: clubId,
        company_id: companyId,
        year,
        month,
        attendee_count: attendeeCount,
        amount,
        status: "paid",
        paid_by: paidBy,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "club_id,company_id,year,month" }
    );
    setSaving(false);
    router.refresh();
  }

  return (
    <button className="btn-sm btn-approve" onClick={markPaid} disabled={saving}>
      {saving ? "처리 중..." : "지급완료 처리"}
    </button>
  );
}
