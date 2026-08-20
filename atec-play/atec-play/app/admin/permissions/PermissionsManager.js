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
  const [clubId, setClubId] = useState(clubs[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const selectedUser = users.find((u) => u.id === userId);
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

    if (existing) {
      await supabase.from("user_permissions").delete().eq("id", existing.id);
    } else {
      await supabase.from("user_permissions").insert({
        user_id: userId,
        permission_code: code,
        club_id: scope === "club" ? clubId : null,
        company_id: scope === "company" ? selectedUser?.company?.id : null,
        granted_by: userId,
      });
    }
    setSaving(false);
    router.refresh();
  }

  async function applyTemplate(name) {
    setSaving(true);
    const codes = TEMPLATES[name];
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
    await supabase.from("user_permissions").upsert(rows, { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true });
    setSaving(false);
    router.refresh();
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="section-title">대상 계정 선택</div>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: "100%", height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.company?.name})</option>
            ))}
          </select>
          <div className="empty-note">동호회 단위 권한을 조정할 때는 아래에서 대상 동호회도 선택해주세요.</div>
          <select value={clubId} onChange={(e) => setClubId(e.target.value)} style={{ width: "100%", height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="card">
          <div className="section-title">기본 템플릿 적용</div>
          <div className="row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
            {Object.keys(TEMPLATES).map((name) => (
              <button key={name} className="btn-sm btn-outline" disabled={saving} onClick={() => applyTemplate(name)}>
                {name}
              </button>
            ))}
          </div>
          <div className="empty-note">템플릿 선택 시 해당 항목이 자동 체크됩니다. 이후 아래에서 개별로 조정할 수 있습니다.</div>
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
