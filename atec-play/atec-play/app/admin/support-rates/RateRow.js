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
  const [justSaved, setJustSaved] = useState(false);

  async function save() {
    setSaving(true);
    setJustSaved(false);
    const { error } = existing
      ? await supabase.from("club_support_rates").update({ unit_amount: amount, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("club_support_rates").insert({ club_id: club.id, unit_amount: amount, updated_by: userId });

    setSaving(false);
    if (error) {
      alert("저장 실패: " + error.message);
      return;
    }
    setJustSaved(true);
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
          onChange={(e) => { setAmount(Number(e.target.value)); setJustSaved(false); }}
          style={{ width: 110, height: 30, textAlign: "right", border: "1px solid var(--line)", borderRadius: 7, padding: "0 8px" }}
        />
      </td>
      <td className="row-flex" style={{ justifyContent: "flex-end" }}>
        <button className="btn-sm btn-outline" onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</button>
        {justSaved && <span className="badge badge-green">저장됨</span>}
      </td>
    </tr>
  );
}
