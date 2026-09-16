"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DescriptionEditor({ clubId, current }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("clubs").update({ description: text }).eq("id", clubId);
    setSaving(false);
    if (error) {
      alert("소개글 저장 실패: " + error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-sm btn-outline" onClick={() => setOpen(true)}>
        소개글 수정
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(20,24,31,0.5)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={() => !saving && setOpen(false)}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 480, margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">동호회 소개글</div>
        <div className="field">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="어떤 활동을 하는 동호회인지 간단히 소개해 주세요. 동호회 목록에 표시됩니다."
            autoFocus
          />
        </div>
        <div className="row-flex" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-sm btn-outline" onClick={() => setOpen(false)} disabled={saving}>취소</button>
          <button className="btn-sm btn-approve" onClick={save} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
