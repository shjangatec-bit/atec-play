"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RateRow({ club, userId }) {
  const router = useRouter();
  const supabase = createClient();
  const existing = club.club_support_rates?.[0];
  const [amount, setAmount] = useState(existing?.unit_amount ?? 0);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    if (existing) {
      await supabase.from("club_support_rates").update({ unit_amount: amount, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("club_support_rates").insert({ club_id: club.id, unit_amount: amount, updated_by: userId });
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <tr>
      <td>{club.name}</td>
      <td style={{ textAlign: "right" }}>
        <input
          type="number"
          className="mono"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          style={{ width: 110, height: 30, textAlign: "right", border: "1px solid var(--line)", borderRadius: 7, padding: "0 8px" }}
        />
      </td>
      <td><button className="btn-sm btn-outline" onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</button></td>
    </tr>
  );
}
