"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABEL = { pending: "대기", approved: "승인됨", rejected: "반려됨", suspended: "정지됨" };
const STATUS_CLASS = { pending: "badge-amber", approved: "badge-green", rejected: "badge-red", suspended: "badge-gray" };

// 계정 승인 시 자동으로 부여되는 "회원" 기본 권한 (전사/개인 단위 — 특정 동호회 가입 전에도 적용 가능한 것들)
const DEFAULT_MEMBER_PERMISSIONS = ["CLUB_CREATE_REQUEST", "CLUB_CLOSE_REQUEST"];

export default function AccountRow({ user, approverId }) {
  const router = useRouter();
  const supabase = createClient();

  async function resetPassword() {
    if (!confirm(`${user.name}(${user.email})님의 비밀번호를 초기화할까요?\n초기화하면 이 계정의 기존 비밀번호는 더 이상 쓸 수 없습니다.`)) return;

    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert("비밀번호 초기화 실패: " + (data.error || "알 수 없는 오류"));
      return;
    }

    // 이메일 발송 기능이 없으므로, 관리자가 이 화면에서 임시 비밀번호를 직접 확인해 본인에게 전달합니다.
    alert(
      `${user.name}(${user.email})님의 임시 비밀번호가 발급되었습니다.\n\n임시 비밀번호: ${data.newPassword}\n\n이 비밀번호를 본인에게 안전하게 전달해 주세요.\n(문자메시지 등에 그대로 남기지 말고, 로그인 후 바로 변경하시라고 안내해 주세요.)`
    );
  }

  async function updateStatus(status) {
    const { error } = await supabase
      .from("users")
      .update({ status, approved_by: approverId, approved_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      alert("처리 실패: " + error.message);
      return;
    }

    if (status === "approved") {
      const rows = DEFAULT_MEMBER_PERMISSIONS.map((code) => ({
        user_id: user.id,
        permission_code: code,
        club_id: null,
        company_id: null,
        granted_by: approverId,
      }));
      const { error: permErr } = await supabase
        .from("user_permissions")
        .upsert(rows, { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true });
      if (permErr) {
        alert(
          "계정은 승인됐지만 기본 권한(동호회 개설/폐설 신청) 부여에 실패했습니다: " +
            permErr.message +
            "\n권한 설정 화면에서 수동으로 부여해 주세요."
        );
      }
    }
    router.refresh();
  }

  return (
    <tr>
      <td>{user.name}</td>
      <td className="mono" style={{ fontSize: 12 }}>{user.email}</td>
      <td>{user.company?.name}</td>
      <td className="mono">{new Date(user.created_at).toLocaleDateString("ko-KR")}</td>
      <td><span className={`badge ${STATUS_CLASS[user.status]}`}>{STATUS_LABEL[user.status]}</span></td>
      <td className="row-flex" style={{ justifyContent: "flex-end" }}>
        {user.status === "pending" && (
          <>
            <button className="btn-sm btn-approve" onClick={() => updateStatus("approved")}>승인</button>
            <button className="btn-sm btn-reject" onClick={() => updateStatus("rejected")}>반려</button>
          </>
        )}
        {user.status === "approved" && (
          <button className="btn-sm btn-outline" onClick={() => updateStatus("suspended")}>계정 정지</button>
        )}
        {user.status === "suspended" && (
          <button className="btn-sm btn-outline" onClick={() => updateStatus("approved")}>정지 해제</button>
        )}
        {(user.status === "approved" || user.status === "suspended") && (
          <button className="btn-sm btn-outline" onClick={resetPassword}>비밀번호 초기화</button>
        )}
      </td>
    </tr>
  );
}
