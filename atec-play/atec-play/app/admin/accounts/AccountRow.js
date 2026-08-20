"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUS_LABEL = { pending: "대기", approved: "승인됨", rejected: "반려됨", suspended: "정지됨" };
const STATUS_CLASS = { pending: "badge-amber", approved: "badge-green", rejected: "badge-red", suspended: "badge-gray" };

export default function AccountRow({ user, approverId }) {
  const router = useRouter();
  const supabase = createClient();

  async function updateStatus(status) {
    await supabase
      .from("users")
      .update({ status, approved_by: approverId, approved_at: new Date().toISOString() })
      .eq("id", user.id);
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
      </td>
    </tr>
  );
}
