"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GLOBAL_CODES = ["ACC_APPROVE", "ACC_MANAGE", "PERM_MANAGE", "ORG_VIEW_ALL", "CLUB_CREATE_APPROVE", "CLUB_CLOSE_APPROVE", "CLUB_SUPPORT_RATE_EDIT"];
const PERSONAL_CODES = ["CLUB_CREATE_REQUEST", "CLUB_CLOSE_REQUEST"]; // 전사(개인) - club_id/company_id 없이 개인에게 부여
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

  const selectedUser = users.find((u) => u.id === userId);
  const myMemberClubs = (selectedUser?.club_members || [])
    .filter((m) => m.status === "approved")
    .map((m) => m.club);

  const [clubId, setClubId] = useState(myMemberClubs[0]?.id || "");

  function handleUserChange(newUserId) {
    setUserId(newUserId);
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

  async function toggle(code) {
    setSaving(true);
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
    const codes = TEMPLATES[name];

    // 템플릿이 다루는 범위의 기존 권한을 먼저 비워서, 이전에 더 많은/다른 권한이 있었어도
    // 이 템플릿이 정의한 구성과 "정확히" 일치하게 맞춥니다. (추가만 되고 안 빠지던 문제 수정)
    let clearErr;
    if (name === "통합관리자") {
      ({ error: clearErr } = await supabase.from("user_permissions").delete().eq("user_id", userId).is("club_id", null).is("company_id", null));
    } else if (name === "지원금담당자") {
      ({ error: clearErr } = await supabase.from("user_permissions").delete().eq("user_id", userId).eq("company_id", selectedUser?.company?.id));
    } else {
      // 회장/총무/회원 - 선택한 "이 동호회"의 동호회 단위 권한만 초기화 (다른 동호회·전사 권한은 안 건드림)
      ({ error: clearErr } = await supabase.from("user_permissions").delete().eq("user_id", userId).eq("club_id", clubId).in("permission_code", CLUB_CODES));
    }
    if (clearErr) {
      alert("템플릿 적용 실패 (기존 권한 초기화 단계): " + clearErr.message);
      setSaving(false);
      return;
    }

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
    const { error: upsertErr } = await supabase.from("user_permissions").upsert(rows, { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true });
    if (upsertErr) {
      alert(
        "기존 권한은 비워졌지만 새 권한 부여에 실패했습니다: " +
          upsertErr.message +
          "\n권한이 빈 상태일 수 있으니 다시 템플릿을 적용해 주세요."
      );
      setSaving(false);
      router.refresh();
      return;
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
          <div className="empty-note">
            동호회 단위 권한은 이 계정이 실제로 가입되어 있는 동호회로만 부여할 수 있습니다.
          </div>
          {myMemberClubs.length > 0 ? (
            <select value={clubId} onChange={(e) => setClubId(e.target.value)} style={{ width: "100%", height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}>
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
              return (
                <button key={name} className="btn-sm btn-outline" disabled={disabled} onClick={() => applyTemplate(name)} title={disabled && needsClub ? "가입된 동호회가 없어 사용할 수 없습니다" : undefined}>
                  {name}
                </button>
              );
            })}
          </div>
          <div className="empty-note">템플릿을 누르면 그 템플릿이 정의한 권한 구성으로 정확히 맞춰집니다(더 많이 켜져 있던 항목은 꺼지고, 부족했던 항목은 켜집니다). 이후 아래에서 개별로 조정할 수 있습니다. (회장·총무·회원 템플릿은 선택한 동호회에 이미 가입되어 있는 계정이면 회원현황의 직책 표시도 함께 바뀝니다)</div>
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
