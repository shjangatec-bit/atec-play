"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RequestRow({ req, reviewerId }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function approve() {
    if (saving) return; // 중복 클릭 방지 (연타 시 동호회가 두 번 생성되는 문제 방지)
    setSaving(true);

    if (req.type === "create") {
      const { data: club, error: clubErr } = await supabase
        .from("clubs")
        .insert({ name: req.proposed_name, description: "", status: "active" })
        .select()
        .single();
      if (clubErr || !club) {
        alert("동호회 생성 실패: " + (clubErr?.message || "알 수 없는 오류"));
        setSaving(false);
        return;
      }

      const { error: memberErr } = await supabase.from("club_members").insert({
        club_id: club.id,
        user_id: req.requester_id,
        role_label: "회장",
        status: "approved",
        processed_by: reviewerId,
        processed_at: new Date().toISOString(),
      });
      if (memberErr) {
        alert(
          "동호회는 생성됐지만 신청자를 회장으로 등록하는 데 실패했습니다: " +
            memberErr.message +
            "\n동호회 상세 화면에서 회원현황을 확인하고 수동으로 등록해 주세요."
        );
        setSaving(false);
        router.refresh();
        return;
      }

      const chairmanCodes = ["CLUB_MEMBER_APPROVE", "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW", "CLUB_BUDGET_VIEW"];
      const { error: permErr } = await supabase.from("user_permissions").upsert(
        chairmanCodes.map((code) => ({
          user_id: req.requester_id,
          club_id: club.id,
          permission_code: code,
          granted_by: reviewerId,
        })),
        { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true }
      );
      if (permErr) {
        alert(
          "동호회와 회장 등록은 됐지만 회장 권한 부여에 실패했습니다: " +
            permErr.message +
            "\n권한 설정 화면에서 회장 템플릿을 다시 적용해 주세요."
        );
        setSaving(false);
        router.refresh();
        return;
      }

      const { error: reqErr } = await supabase
        .from("club_lifecycle_requests")
        .update({
          club_id: club.id,
          status: "approved",
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (reqErr) {
        alert(
          "동호회 생성과 권한 부여는 됐지만 신청 상태 갱신에 실패했습니다: " +
            reqErr.message +
            "\n화면을 새로고침한 뒤 신청 상태를 확인해 주세요."
        );
        setSaving(false);
        router.refresh();
        return;
      }
    } else {
      const { error: closeErr } = await supabase.from("clubs").update({ status: "closed" }).eq("id", req.club_id);
      if (closeErr) {
        alert("동호회 폐설 처리 실패: " + closeErr.message);
        setSaving(false);
        return;
      }

      const { error: reqErr } = await supabase
        .from("club_lifecycle_requests")
        .update({
          status: "approved",
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (reqErr) {
        alert(
          "동호회는 폐설됐지만 신청 상태 갱신에 실패했습니다: " +
            reqErr.message +
            "\n화면을 새로고침한 뒤 신청 상태를 확인해 주세요."
        );
        setSaving(false);
        router.refresh();
        return;
      }
    }

    setSaving(false);
    router.refresh();
  }

  async function reject() {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("club_lifecycle_requests")
      .update({
        status: "rejected",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", req.id);
    setSaving(false);
    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <tr>
      <td><span className={`badge ${req.type === "create" ? "badge-brand" : "badge-gray"}`}>{req.type === "create" ? "개설" : "폐설"}</span></td>
      <td>{req.proposed_name || req.club?.name}</td>
      <td>{req.requester?.name}</td>
      <td className="mono">{new Date(req.created_at).toLocaleDateString("ko-KR")}</td>
      <td>
        {req.file_url ? (
          <a href={req.file_url} target="_blank" rel="noreferrer" className="badge badge-red">
            첨부파일 보기
          </a>
        ) : (
          <span className="empty-note" style={{ padding: 0 }}>없음</span>
        )}
      </td>
      <td>
        <span className={`badge ${req.status === "pending" ? "badge-amber" : req.status === "approved" ? "badge-green" : "badge-red"}`}>
          {req.status === "pending" ? "대기" : req.status === "approved" ? "승인" : "반려"}
        </span>
      </td>
      <td className="row-flex" style={{ justifyContent: "flex-end" }}>
        {req.status === "pending" && (
          <>
            <button className="btn-sm btn-approve" onClick={approve} disabled={saving}>{saving ? "처리 중..." : "승인"}</button>
            <button className="btn-sm btn-reject" onClick={reject} disabled={saving}>반려</button>
          </>
        )}
      </td>
    </tr>
  );
}
