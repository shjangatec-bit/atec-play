"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 이 화면은 "전사 권한(통합관리자)"과 "회사 권한(지원금담당자)"만 다룹니다.
// 동호회 직책(회장·총무·회원)과 그에 따른 운영진 권한은 각 동호회 화면의 '직책 관리'에서 정하며,
// 직책에서 자동으로 켜지고 꺼지므로 여기서 따로 설정하지 않습니다.
const GLOBAL_CODES = ["ACC_APPROVE", "ACC_MANAGE", "PERM_MANAGE", "ORG_VIEW_ALL", "CLUB_CREATE_APPROVE", "CLUB_CLOSE_APPROVE", "CLUB_SUPPORT_RATE_EDIT"];
const PERSONAL_CODES = ["CLUB_CREATE_REQUEST", "CLUB_CLOSE_REQUEST"];
const COMPANY_CODES = ["ORG_VIEW_COMPANY", "CLUB_BUDGET_DISBURSE"];

const TEMPLATES = {
  통합관리자: [...GLOBAL_CODES, ...PERSONAL_CODES],
  지원금담당자: ["ORG_VIEW_COMPANY", "CLUB_BUDGET_DISBURSE"],
};

function scopeOf(code) {
  if (GLOBAL_CODES.includes(code) || PERSONAL_CODES.includes(code)) return "global";
  if (COMPANY_CODES.includes(code)) return "company";
  return "club"; // 동호회 단위 코드 — 이 화면에서는 다루지 않음
}

export default function PermissionsManager({ users, allPerms, master }) {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState(users[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const selectedUser = users.find((u) => u.id === userId);
  const companyId = selectedUser?.company?.id;
  const myPerms = useMemo(() => allPerms.filter((p) => p.user_id === userId), [allPerms, userId]);
  const manualMaster = master.filter((p) => scopeOf(p.code) !== "club");

  function hasRow(code) {
    return myPerms.some((p) => {
      if (p.permission_code !== code) return false;
      if (scopeOf(code) === "company") return p.company_id === companyId;
      return true;
    });
  }

  // 현재 권한 구성이 각 템플릿과 정확히 일치하는지 판정합니다.
  const activeNames = useMemo(
    () =>
      Object.entries(TEMPLATES)
        .filter(([name, codes]) => {
          const scopeCodes = name === "통합관리자" ? [...GLOBAL_CODES, ...PERSONAL_CODES] : COMPANY_CODES;
          const onCodes = scopeCodes.filter((c) => hasRow(c));
          const wantCodes = scopeCodes.filter((c) => codes.includes(c));
          return onCodes.length > 0 && onCodes.length === wantCodes.length && wantCodes.every((c) => onCodes.includes(c));
        })
        .map(([name]) => name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myPerms, selectedUser]
  );

  async function toggle(code) {
    setSaving(true);
    setFlash("");
    const scope = scopeOf(code);
    const existing = hasRow(code);

    // 끌 때는 같은 권한의 중복 행까지 모두 지웁니다. (id 하나만 지우면 중복 행이 남아 권한이 회수되지 않습니다)
    let revokeQuery = supabase.from("user_permissions").delete().eq("user_id", userId).eq("permission_code", code);
    if (scope === "company") revokeQuery = revokeQuery.is("club_id", null).eq("company_id", companyId);
    else revokeQuery = revokeQuery.is("club_id", null).is("company_id", null);

    const { error } = existing
      ? await revokeQuery
      : await supabase.from("user_permissions").insert({
          user_id: userId,
          permission_code: code,
          club_id: null,
          company_id: scope === "company" ? companyId : null,
          granted_by: userId,
        });
    setSaving(false);
    if (error) {
      alert("권한 변경 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  async function applyTemplate(name) {
    setSaving(true);
    setFlash("");
    const codes = TEMPLATES[name];

    // 순서가 중요합니다: 먼저 "넣고" 그 다음에 "필요 없는 것만" 지웁니다.
    // (먼저 지우면, 관리자가 자기 자신에게 적용할 때 권한 관리 권한이 순간적으로 사라져
    //  다시 넣지 못하고 권한이 빈 상태로 잠기는 문제가 생깁니다)
    const rows = codes.map((code) => ({
      user_id: userId,
      permission_code: code,
      club_id: null,
      company_id: scopeOf(code) === "company" ? companyId : null,
      granted_by: userId,
    }));

    const { error: upsertErr } = await supabase
      .from("user_permissions")
      .upsert(rows, { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true });
    if (upsertErr) {
      alert("템플릿 적용 실패: " + upsertErr.message + "\n기존 권한은 그대로 유지됩니다.");
      setSaving(false);
      return;
    }

    let clearQuery = supabase.from("user_permissions").delete().eq("user_id", userId);
    if (name === "통합관리자") {
      clearQuery = clearQuery.is("club_id", null).is("company_id", null);
    } else {
      clearQuery = clearQuery.eq("company_id", companyId);
    }
    const { error: clearErr } = await clearQuery.not("permission_code", "in", `(${codes.join(",")})`);
    if (clearErr) {
      alert(
        "템플릿 권한은 부여됐지만, 템플릿에 없는 기존 권한 정리에는 실패했습니다: " +
          clearErr.message +
          "\n아래 개별 토글에서 직접 꺼주세요."
      );
    }

    setSaving(false);
    setFlash(`${selectedUser?.name} 님에게 "${name}" 권한이 적용되었습니다.`);
    router.refresh();
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="section-title">대상 계정 선택</div>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setFlash("");
            }}
            style={{ width: "100%", height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.company?.name})</option>
            ))}
          </select>

          <div className="row-flex" style={{ gap: 6, margin: "10px 0 0", flexWrap: "wrap", alignItems: "center" }}>
            <span className="co-tag">현재 권한 구성</span>
            {activeNames.length > 0 ? (
              activeNames.map((n) => (
                <span key={n} className="badge badge-green">{n}</span>
              ))
            ) : (
              <span className="badge badge-gray">사용자 지정</span>
            )}
          </div>

          <div className="empty-note" style={{ padding: "10px 0 0" }}>
            동호회 직책(회장·총무·회원)과 운영진 권한은 이 화면에서 설정하지 않습니다.
            각 동호회 화면의 회원 현황에서 직책을 바꾸면 운영진 권한이 자동으로 켜지고 꺼집니다.
          </div>
        </div>

        <div className="card">
          <div className="section-title">기본 템플릿 적용</div>
          <div className="row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            {Object.keys(TEMPLATES).map((name) => {
              const active = activeNames.includes(name);
              return (
                <button
                  key={name}
                  className={`btn-sm ${active ? "btn-approve" : "btn-outline"}`}
                  disabled={saving}
                  onClick={() => applyTemplate(name)}
                >
                  {active ? `✓ ${name}` : name}
                </button>
              );
            })}
          </div>

          {flash && (
            <div
              style={{
                marginTop: 12, padding: "9px 12px", borderRadius: 8,
                background: "rgba(34,150,94,0.10)", border: "1px solid rgba(34,150,94,0.30)",
                fontSize: 12.5, color: "var(--ink-2)",
              }}
            >
              {flash}
            </div>
          )}

          <div className="empty-note" style={{ paddingTop: 10 }}>
            체크 표시된 버튼이 현재 적용된 권한 구성입니다. 템플릿을 누르면 그 구성으로 정확히 맞춰집니다(더 많이 켜져 있던 항목은 꺼지고, 부족했던 항목은 켜집니다).
            이후 아래에서 개별로 조정하면 "사용자 지정"으로 표시됩니다.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">{selectedUser?.name} 님의 기능 권한</div>
        <table className="toggle-table">
          <thead>
            <tr><th>기능</th><th>설명</th><th>범위</th><th style={{ textAlign: "right" }}>사용</th></tr>
          </thead>
          <tbody>
            {manualMaster.map((p) => {
              const scope = scopeOf(p.code);
              const on = hasRow(p.code);
              return (
                <tr key={p.code}>
                  <td>{p.name}</td>
                  <td className="co-tag">{p.description}</td>
                  <td>
                    <span className={`badge ${scope === "company" ? "badge-brand" : "badge-amber"}`}>
                      {scope === "company" ? "회사 단위" : "전사"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`switch${on ? " on" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggle(p.code)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
