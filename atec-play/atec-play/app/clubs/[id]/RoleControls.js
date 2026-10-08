"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 직책은 직접 값을 쓰지 않고 DB 의 전용 함수(set_member_role / change_club_chair)로만 바꿉니다.
// 함수 안에서 권한(회장·통합관리자)을 다시 검사하고, 직책에 맞는 운영진 권한도 자동으로 켜고 끕니다.

const SELECT_STYLE = { height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px", fontSize: 12.5 };

// 총무 ↔ 회원 변경 (회장은 아래 '회장 교체'로만 바꿀 수 있어 선택지에 없음)
export function RoleSelect({ member }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const known = member.role_label === "총무" || member.role_label === "회원";

  async function change(e) {
    const role = e.target.value;
    if (role === member.role_label) return;
    const name = member.user?.name || "회원";
    const effect =
      role === "총무"
        ? "운영진 권한(가입·탈회 승인, 활동보고서 작성 등)이 함께 부여됩니다."
        : "운영진 권한이 함께 해제됩니다.";
    if (!confirm(`${name} 님의 직책을 "${role}"(으)로 변경할까요?\n${effect}`)) {
      e.target.value = member.role_label;
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_member_role", { p_member_id: member.id, p_role: role });
    setSaving(false);
    if (error) {
      alert("직책 변경 실패: " + error.message);
      e.target.value = member.role_label;
      return;
    }
    router.refresh();
  }

  return (
    <select defaultValue={member.role_label} onChange={change} disabled={saving} style={SELECT_STYLE} aria-label="직책">
      {!known && <option value={member.role_label || ""} disabled>{member.role_label || "(직책 없음)"}</option>}
      <option value="회원">회원</option>
      <option value="총무">총무</option>
    </select>
  );
}

// 회장 교체(또는 공석인 동호회의 회장 지정): 새 회장 + 기존 회장이 내려갈 직책을 함께 정하고 한 번에 처리
export function ChairChangePanel({ clubId, members }) {
  const router = useRouter();
  const approved = members.filter((m) => m.status === "approved" && !m.withdrawal_requested);
  const currentChair = approved.find((m) => m.role_label === "회장");
  const candidates = approved.filter((m) => m.role_label !== "회장");

  const [open, setOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [oldRole, setOldRole] = useState("총무");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const target = candidates.find((m) => m.id === newId);
    if (!target) {
      alert("새 회장으로 지정할 회원을 선택해 주세요.");
      return;
    }
    const msg = currentChair
      ? `새 회장: ${target.user?.name}\n기존 회장 ${currentChair.user?.name} 님은 "${oldRole}"(으)로 변경됩니다.\n\n진행할까요?`
      : `${target.user?.name} 님을 회장으로 지정할까요?`;
    if (!confirm(msg)) return;

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("change_club_chair", {
      p_club: clubId,
      p_new_member_id: newId,
      p_old_chair_new_role: currentChair ? oldRole : null,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      alert("회장 교체 실패: " + error.message);
      return;
    }
    setOpen(false);
    setNewId("");
    setNote("");
    router.refresh();
  }

  return (
    <div style={{ marginTop: 12 }}>
      {!currentChair && (
        <div className="error-text" style={{ marginBottom: 8 }}>
          이 동호회는 회장이 없습니다. 회장을 지정해 주세요.
        </div>
      )}
      {!open ? (
        <button className="btn-sm btn-outline" onClick={() => setOpen(true)} disabled={candidates.length === 0}>
          {currentChair ? "회장 교체" : "회장 지정"}
        </button>
      ) : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
          <div className="co-tag" style={{ marginBottom: 6 }}>새 회장</div>
          <select value={newId} onChange={(e) => setNewId(e.target.value)} style={{ ...SELECT_STYLE, width: "100%", marginBottom: 10 }}>
            <option value="">회원을 선택하세요</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.user?.name} ({m.role_label})
              </option>
            ))}
          </select>
          {currentChair && (
            <>
              <div className="co-tag" style={{ marginBottom: 6 }}>기존 회장 {currentChair.user?.name} 님의 새 직책</div>
              <select value={oldRole} onChange={(e) => setOldRole(e.target.value)} style={{ ...SELECT_STYLE, width: "100%", marginBottom: 10 }}>
                <option value="총무">총무 (운영진 유지)</option>
                <option value="회원">회원 (운영진 해제)</option>
              </select>
            </>
          )}
          <div className="co-tag" style={{ marginBottom: 6 }}>메모 (선택)</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={100}
            placeholder="예: 임기 만료"
            style={{ ...SELECT_STYLE, width: "100%", marginBottom: 10 }}
          />
          <div className="row-flex" style={{ gap: 6 }}>
            <button className="btn-sm btn-approve" onClick={submit} disabled={saving}>
              {saving ? "처리 중..." : "확인"}
            </button>
            <button className="btn-sm btn-outline" onClick={() => setOpen(false)} disabled={saving}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 회장 교체 이력: 누가, 언제, 누구로
export function ChairHistory({ history }) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="section-title">회장 교체 이력</div>
      {history.length === 0 ? (
        <div className="empty-note">회장 교체 이력이 없습니다.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>일시</th>
              <th>기존 회장</th>
              <th>새 회장</th>
              <th>기존 회장의 새 직책</th>
              <th>변경한 사람</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(h.changed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                <td>{h.old_chair?.name || "(공석)"}</td>
                <td>{h.new_chair?.name || "-"}</td>
                <td>{h.old_chair_new_role || "-"}</td>
                <td>{h.changer?.name || "-"}</td>
                <td className="co-tag">{h.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
