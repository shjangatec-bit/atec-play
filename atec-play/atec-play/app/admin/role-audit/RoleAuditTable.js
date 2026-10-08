"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 점검 항목 종류와 설명. 이 화면은 목록만 보여주고, 각 항목은 관리자가 확인한 뒤 버튼을 눌러야 수정됩니다.
const SECTIONS = [
  { key: "NO_CHAIR", title: "회장이 없는 동호회", help: "운영 중인 동호회인데 회장이 없습니다. 이 동호회의 승인된 회원 중에서 회장을 지정해 주세요." },
  { key: "MULTI_CHAIR", title: "회장이 2명 이상인 동호회", help: "한 동호회의 회장은 1명이어야 합니다. 한 명만 남기고 나머지는 총무 또는 회원으로 바꿔 주세요." },
  { key: "BAD_ROLE", title: "직책 값이 올바르지 않은 회원", help: "직책은 회장·총무·회원 중 하나여야 합니다. 올바른 직책으로 지정해 주세요." },
  { key: "PERM_MISMATCH", title: "직책과 동호회 권한이 맞지 않는 회원", help: "직책에서 정해지는 권한(운영진/일반)과 실제 저장된 권한이 다릅니다. '권한 맞추기'를 누르면 직책에 맞게 부족한 권한을 부여하고 불필요한 권한을 회수합니다." },
  { key: "ORPHAN_PERMS", title: "회원이 아닌데 동호회 권한이 남은 경우", help: "이 동호회의 승인된 회원이 아닌데 동호회 권한이 남아 있습니다. '권한 회수'를 누르면 해당 동호회 권한이 삭제됩니다." },
];

export default function RoleAuditTable({ issues }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [chairPick, setChairPick] = useState({}); // club_id -> { loading, members, selected }

  async function run(label, fn, confirmText) {
    if (!confirm(confirmText)) return;
    setBusy(label);
    const { error } = await fn(createClient());
    setBusy("");
    if (error) {
      alert("처리 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  const setRole = (row, role) =>
    run(
      `role-${row.i_member_id}`,
      (sb) => sb.rpc("set_member_role", { p_member_id: row.i_member_id, p_role: role }),
      `[${row.i_club_name}] ${row.i_user_name} 님의 직책을 "${role}"(으)로 바꿀까요?`
    );

  const resync = (row) =>
    run(
      `sync-${row.i_member_id}`,
      (sb) => sb.rpc("resync_member_permissions", { p_member_id: row.i_member_id }),
      `[${row.i_club_name}] ${row.i_user_name} 님(직책: ${row.i_role})의 동호회 권한을 직책에 맞게 바꿀까요?\n\n${row.i_detail}`
    );

  const revokeOrphan = (row) =>
    run(
      `orphan-${row.i_user_id}-${row.i_club_id}`,
      (sb) => sb.rpc("revoke_orphan_permissions", { p_user: row.i_user_id, p_club: row.i_club_id }),
      `[${row.i_club_name}] ${row.i_user_name} 님에게 남은 동호회 권한을 모두 회수할까요?\n\n${row.i_detail}`
    );

  async function openChairPicker(row) {
    setChairPick((p) => ({ ...p, [row.i_club_id]: { loading: true, members: [], selected: "" } }));
    const sb = createClient();
    const { data, error } = await sb
      .from("club_members")
      .select("id, role_label, user:user_id(name)")
      .eq("club_id", row.i_club_id)
      .eq("status", "approved");
    if (error) {
      alert("회원 목록을 불러오지 못했습니다: " + error.message);
      setChairPick((p) => ({ ...p, [row.i_club_id]: undefined }));
      return;
    }
    setChairPick((p) => ({ ...p, [row.i_club_id]: { loading: false, members: data || [], selected: "" } }));
  }

  function assignChair(row) {
    const pick = chairPick[row.i_club_id];
    const target = pick?.members.find((m) => m.id === pick.selected);
    if (!target) {
      alert("회장으로 지정할 회원을 선택해 주세요.");
      return;
    }
    run(
      `chair-${row.i_club_id}`,
      (sb) => sb.rpc("change_club_chair", { p_club: row.i_club_id, p_new_member_id: target.id, p_old_chair_new_role: null, p_note: "점검 화면에서 지정" }),
      `[${row.i_club_name}] ${target.user?.name} 님을 회장으로 지정할까요?`
    );
  }

  const total = issues.length;

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="empty-note" style={{ padding: 0 }}>
          직책과 권한이 어긋난 기존 데이터를 찾아 보여줍니다. <b>자동으로 바꾸지 않으며</b>, 각 항목을 확인한 뒤 버튼을 눌러야 수정됩니다.
          {" "}
          {total === 0 ? "현재 이상이 있는 항목이 없습니다." : `점검 결과 ${total}건`}
        </div>
      </div>

      {SECTIONS.map((sec) => {
        const rows = issues.filter((r) => r.i_issue === sec.key);
        if (rows.length === 0) return null;
        return (
          <div className="card" key={sec.key} style={{ marginBottom: 14 }}>
            <div className="section-title">
              {sec.title} <span className="badge badge-amber" style={{ marginLeft: 6 }}>{rows.length}건</span>
            </div>
            <div className="empty-note" style={{ padding: "0 0 10px" }}>{sec.help}</div>
            <table>
              <thead>
                <tr>
                  <th>동호회</th>
                  <th>회원</th>
                  <th>현재 직책</th>
                  <th>내용</th>
                  <th style={{ textAlign: "right" }}>조치</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const k = `${sec.key}-${row.i_club_id}-${row.i_member_id || row.i_user_id || idx}`;
                  const pick = chairPick[row.i_club_id];
                  return (
                    <tr key={k}>
                      <td>{row.i_club_name}</td>
                      <td>{row.i_user_name || "-"}</td>
                      <td>{row.i_role || "-"}</td>
                      <td className="co-tag" style={{ maxWidth: 360 }}>{row.i_detail}</td>
                      <td style={{ textAlign: "right" }}>
                        {sec.key === "NO_CHAIR" && (
                          pick ? (
                            <div className="row-flex" style={{ justifyContent: "flex-end", gap: 6 }}>
                              <select
                                value={pick.selected}
                                disabled={pick.loading}
                                onChange={(e) => setChairPick((p) => ({ ...p, [row.i_club_id]: { ...pick, selected: e.target.value } }))}
                                style={{ height: 30, border: "1px solid var(--line)", borderRadius: 6, padding: "0 6px" }}
                              >
                                <option value="">{pick.loading ? "불러오는 중..." : "회원 선택"}</option>
                                {pick.members.map((m) => (
                                  <option key={m.id} value={m.id}>{m.user?.name} ({m.role_label})</option>
                                ))}
                              </select>
                              <button className="btn-sm btn-approve" disabled={!!busy} onClick={() => assignChair(row)}>지정</button>
                            </div>
                          ) : (
                            <button className="btn-sm btn-outline" disabled={!!busy} onClick={() => openChairPicker(row)}>회장 지정</button>
                          )
                        )}
                        {(sec.key === "MULTI_CHAIR" || sec.key === "BAD_ROLE") && (
                          <div className="row-flex" style={{ justifyContent: "flex-end", gap: 6 }}>
                            <button className="btn-sm btn-outline" disabled={!!busy} onClick={() => setRole(row, "총무")}>총무로</button>
                            <button className="btn-sm btn-outline" disabled={!!busy} onClick={() => setRole(row, "회원")}>회원으로</button>
                          </div>
                        )}
                        {sec.key === "PERM_MISMATCH" && (
                          <button className="btn-sm btn-outline" disabled={!!busy} onClick={() => resync(row)}>권한 맞추기</button>
                        )}
                        {sec.key === "ORPHAN_PERMS" && (
                          <button className="btn-sm btn-reject" disabled={!!busy} onClick={() => revokeOrphan(row)}>권한 회수</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
