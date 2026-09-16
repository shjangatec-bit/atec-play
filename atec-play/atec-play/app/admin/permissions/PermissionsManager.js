"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GLOBAL_CODES = ["ACC_APPROVE", "ACC_MANAGE", "PERM_MANAGE", "ORG_VIEW_ALL", "CLUB_CREATE_APPROVE", "CLUB_CLOSE_APPROVE", "CLUB_SUPPORT_RATE_EDIT"];
const PERSONAL_CODES = ["CLUB_CREATE_REQUEST", "CLUB_CLOSE_REQUEST"];
const COMPANY_CODES = ["ORG_VIEW_COMPANY", "CLUB_BUDGET_DISBURSE"];
const CLUB_CODES = ["CLUB_MEMBER_APPROVE", "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW", "CLUB_BUDGET_VIEW"];

const TEMPLATES = {
  통합관리자: [...GLOBAL_CODES, ...PERSONAL_CODES],
  회장: [...PERSONAL_CODES, "CLUB_MEMBER_APPROVE", "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW", "CLUB_BUDGET_VIEW"],
  총무: [...PERSONAL_CODES, "CLUB_MEMBER_APPROVE", "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW", "CLUB_BUDGET_VIEW"],
  회원: [...PERSONAL_CODES, "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_BUDGET_VIEW"],
  지원금담당자: ["ORG_VIEW_COMPANY", "CLUB_BUDGET_DISBURSE"],
};

export default function PermissionsManager({ users, clubs, allPerms, master }) {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState(users[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const selectedUser = users.find((u) => u.id === userId);
  const myMemberClubs = (selectedUser?.club_members || [])
    .filter((m) => m.status === "approved")
    .map((m) => m.club);

  const [clubId, setClubId] = useState(myMemberClubs[0]?.id || "");

  function handleUserChange(newUserId) {
    setUserId(newUserId);
    setFlash("");
    const newUser = users.find((u) => u.id === newUserId);
    const newUserClubs = (newUser?.club_members || []).filter((m) => m.status === "approved").map((m) => m.club);
    setClubId(newUserClubs[0]?.id || "");
  }

  const myPerms = useMemo(() => allPerms.filter((p) => p.user_id === userId), [allPerms, userId]);

  function scopeOf(code) {
    if (GLOBAL_CODES.includes(code) || PERSONAL_CODES.includes(code)) return "global";
    if (COMPANY_CODES.includes(code)) return "company";
    return "club";
  }

  function hasRow(code) {
    return myPerms.some((p) => {
      if (p.permission_code !== code) return false;
      const scope = scopeOf(code);
      if (scope === "club") return p.club_id === clubId;
      if (scope === "company") return p.company_id === selectedUser?.company?.id;
      return true;
    });
  }

  // 현재 권한 구성이 각 템플릿과 정확히 일치하는지 판정합니다.
  // (템플릿이 다루는 범위의 권한만 비교 — 예: 회장 템플릿은 이 동호회의 동호회 단위 권한만 확인)
  const matchedTemplates = useMemo(() => {
    const result = {};
    Object.entries(TEMPLATES).forEach(([name, codes]) => {
      let scopeCodes;
      if (name === "통합관리자") scopeCodes = [...GLOBAL_CODES, ...PERSONAL_CODES];
      else if (name === "지원금담당자") scopeCodes = COMPANY_CODES;
      else scopeCodes = CLUB_CODES;

      const onCodes = scopeCodes.filter((c) => hasRow(c));
      const wantCodes = scopeCodes.filter((c) => codes.includes(c));
      result[name] =
        onCodes.length > 0 &&
        onCodes.length === wantCodes.length &&
        wantCodes.every((c) => onCodes.includes(c));
    });
    return result;
  }, [myPerms, clubId, selectedUser]);

  const activeNames = Object.keys(matchedTemplates).filter((n) => matchedTemplates[n]);

  async function toggle(code) {
    setSaving(true);
    setFlash("");
    const scope = scopeOf(code);
    const existing = myPerms.find((p) => {
      if (p.permission_code !== code) return false;
      if (scope === "club") return p.club_id === clubId;
      if (scope === "company") return p.company_id === selectedUser?.company?.id;
      return true;
    });

    const { error } = existing
      ? await supabase.from("user_permissions").delete().eq("id", existing.id)
      : await supabase.from("user_permissions").insert({
          user_id: userId,
          permission_code: code,
          club_id: scope === "club" ? clubId : null,
          company_id: scope === "company" ? selectedUser?.company?.id : null,
          granted_by: userId,
        });
    setSaving(false);
    if (error) {
      alert("권한 변경 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  const ROLE_LABEL_BY_TEMPLATE = { 회장: "회장", 총무: "총무", 회원: "회원" };

  async function applyTemplate(name) {
    setSaving(true);
    setFlash("");
    const codes = TEMPLATES[name];

    // 순서가 중요합니다: 먼저 "넣고" 그 다음에 "필요 없는 것만" 지웁니다.
    // (먼저 지우면, 관리자가 자기 자신에게 적용할 때 권한 관리 권한이 순간적으로 사라져
    //  다시 넣지 못하고 권한이 빈 상태로 잠기는 문제가 생깁니다)
    const rows = codes.map((code) => {
      const scope = scopeOf(code);
      return {
        user_id: userId,
        permission_code: code,
        club_id: scope === "club" ? clubId : null,
        company_id: scope === "company" ? selectedUser?.company?.id : null,
        granted_by: userId,
      };
    });

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
    } else if (name === "지원금담당자") {
      clearQuery = clearQuery.eq("company_id", selectedUser?.company?.id);
    } else {
      clearQuery = clearQuery.eq("club_id", clubId).in("permission_code", CLUB_CODES);
    }
    const { error: clearErr } = await clearQuery.not("permission_code", "in", `(${codes.join(",")})`);
    if (clearErr) {
      alert(
        "템플릿 권한은 부여됐지만, 템플릿에 없는 기존 권한 정리에는 실패했습니다: " +
          clearErr.message +
          "\n아래 개별 토글에서 직접 꺼주세요."
      );
    }

    const roleLabel = ROLE_LABEL_BY_TEMPLATE[name];
    if (roleLabel) {
      const { error: roleErr } = await supabase
        .from("club_members")
        .update({ role_label: roleLabel })
        .eq("club_id", clubId)
        .eq("user_id", userId)
        .eq("status", "approved");
      if (roleErr) {
        alert("권한은 적용됐지만 회원현황의 직책 표시 갱신에는 실패했습니다: " + roleErr.message);
      }
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
          <select value={userId} onChange={(e) => handleUserChange(e.target.value)} style={{ width: "100%", height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}>
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

          <div className="empty-note" style={{ padding: "8px 0 0" }}>
            동호회 단위 권한은 이 계정이 실제로 가입되어 있는 동호회로만 부여할 수 있습니다.
          </div>
          {myMemberClubs.length > 0 ? (
            <select value={clubId} onChange={(e) => { setClubId(e.target.value); setFlash(""); }} style={{ width: "100%", height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}>
              {myMemberClubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <div className="empty-note" style={{ padding: "8px 0 0" }}>
              {selectedUser?.name} 님은 가입된 동호회가 없어 동호회 단위 권한(회장/총무/회원)을 부여할 수 없습니다. 먼저 동호회 가입 승인이 필요합니다.
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">기본 템플릿 적용</div>
          <div className="row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            {Object.keys(TEMPLATES).map((name) => {
              const needsClub = ["회장", "총무", "회원"].includes(name);
              const disabled = saving || (needsClub && myMemberClubs.length === 0);
              const active = matchedTemplates[name];
              return (
                <button
                  key={name}
                  className={`btn-sm ${active ? "btn-approve" : "btn-outline"}`}
                  disabled={disabled}
                  onClick={() => applyTemplate(name)}
                  title={disabled && needsClub ? "가입된 동호회가 없어 사용할 수 없습니다" : undefined}
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
            체크 표시된 버튼이 현재 적용된 권한 구성입니다. 템플릿을 누르면 그 구성으로 정확히 맞춰집니다(더 많이 켜져 있던 항목은 꺼지고, 부족했던 항목은 켜집니다). 이후 아래에서 개별로 조정하면 "사용자 지정"으로 표시됩니다.
            <br />
            회장·총무·회원 템플릿은 위에서 선택한 동호회에 적용되며, 회원현황의 직책 표시도 함께 바뀝니다.
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
            {master.map((p) => {
              const scope = scopeOf(p.code);
              const on = hasRow(p.code);
              return (
                <tr key={p.code}>
                  <td>{p.name}</td>
                  <td className="co-tag">{p.description}</td>
                  <td>
                    <span className={`badge ${scope === "club" ? "badge-gray" : scope === "company" ? "badge-brand" : "badge-amber"}`}>
                      {scope === "club" ? "동호회 단위" : scope === "company" ? "회사 단위" : "전사"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {scope === "club" && myMemberClubs.length === 0 ? (
                      <span className="empty-note" style={{ padding: 0 }}>가입 동호회 없음</span>
                    ) : (
                      <span className={`switch${on ? " on" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggle(p.code)} />
                    )}
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
