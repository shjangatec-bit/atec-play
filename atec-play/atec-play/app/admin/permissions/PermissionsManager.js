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
