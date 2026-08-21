"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RequestRow({ req, reviewerId }) {
  const router = useRouter();
  const supabase = createClient();

  async function approve() {
    if (req.type === "create") {
      const { data: club, error: clubErr } = await supabase
        .from("clubs")
        .insert({ name: req.proposed_name, description: "", status: "active" })
        .select()
        .single();
      if (clubErr || !club) {
        alert("동호회 생성 실패: " + (clubErr?.message || "알 수 없는 오류"));
        return;
      }
      {
        await supabase.from("club_members").insert({
          club_id: club.id,
          user_id: req.requester_id,
          role_label: "회장",
          status: "approved",
          processed_by: reviewerId,
          processed_at: new Date().toISOString(),
        });

        const chairmanCodes = ["CLUB_MEMBER_APPROVE", "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW", "CLUB_BUDGET_VIEW"];
        await supabase.from("user_permissions").upsert(
          chairmanCodes.map((code) => ({
            user_id: req.requester_id,
            club_id: club.id,
            permission_code: code,
            granted_by: reviewerId,
          })),
          { onConflict: "user_id,club_id,permission_code", ignoreDuplicates: true }
        );

        await supabase.from("club_lifecycle_requests").update({
          club_id: club.id,
          status: "approved",
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        }).eq("id", req.id);
      }
    } else {
      await supabase.from("clubs").update({ status: "closed" }).eq("id", req.club_id);
      await supabase.from("club_lifecycle_requests").update({
        status: "approved",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      }).eq("id", req.id);
    }
    router.refresh();
  }

  async function reject() {
    await supabase.from("club_lifecycle_requests").update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", req.id);
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
            <button className="btn-sm btn-approve" onClick={approve}>승인</button>
            <button className="btn-sm btn-reject" onClick={reject}>반려</button>
          </>
        )}
      </td>
    </tr>
  );
}
