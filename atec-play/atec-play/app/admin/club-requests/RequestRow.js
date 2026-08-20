"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RequestRow({ req, reviewerId }) {
  const router = useRouter();
  const supabase = createClient();

  async function approve() {
    if (req.type === "create") {
      const { data: club } = await supabase
        .from("clubs")
        .insert({ name: req.proposed_name, description: "", status: "active" })
        .select()
        .single();
      if (club) {
        await supabase.from("club_members").insert({
          club_id: club.id,
          user_id: req.requester_id,
          role_label: "회장",
          status: "approved",
          processed_by: reviewerId,
          processed_at: new Date().toISOString(),
        });
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
