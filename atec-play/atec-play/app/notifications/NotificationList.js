"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeLink, timeAgo, NOTIFICATION_LIMIT } from "@/lib/notifications";

export default function NotificationList({ initial }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(ids) {
    const supabase = createClient();
    const now = new Date().toISOString();
    // 읽음 표시(read_at)만 바꿀 수 있고, 내용은 DB 권한으로 수정할 수 없습니다.
    const { error } = await supabase.from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
    if (error) return false;
    setItems((cur) => cur.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)));
    return true;
  }

  async function open(n) {
    if (!n.read_at) await markRead([n.id]);
    const link = safeLink(n.link);
    if (link) router.push(link);
    else router.refresh();
  }

  async function readAll() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    setBusy(true);
    const okAll = await markRead(ids);
    setBusy(false);
    if (!okAll) alert("읽음 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    router.refresh();
  }

  async function remove(n) {
    const supabase = createClient();
    const { error } = await supabase.from("notifications").delete().eq("id", n.id);
    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }
    setItems((cur) => cur.filter((x) => x.id !== n.id));
    router.refresh();
  }

  return (
    <div className="card">
      <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>
          {unread > 0 ? `읽지 않은 알림 ${unread}건` : "모든 알림을 읽었습니다"}
        </div>
        <button className="btn-sm btn-outline" disabled={busy || unread === 0} onClick={readAll}>모두 읽음</button>
      </div>

      {items.length === 0 ? (
        <div className="empty-note">받은 알림이 없습니다. 가입 승인·반려 등 처리 결과가 여기에 표시됩니다.</div>
      ) : (
        <div>
          {items.map((n) => (
            <div key={n.id} className="row-flex"
              style={{ gap: 10, alignItems: "flex-start", padding: "10px 4px", borderBottom: "1px solid var(--line)", opacity: n.read_at ? 0.6 : 1 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, flex: "none", background: n.read_at ? "transparent" : "var(--brand, #2b6cb0)" }} />
              <button onClick={() => open(n)} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.read_at ? 400 : 600 }}>{n.title}</div>
                {n.body && <div className="co-tag" style={{ marginTop: 2 }}>{n.body}</div>}
                <div className="co-tag" style={{ marginTop: 2 }}>{timeAgo(n.created_at)}</div>
              </button>
              <button className="btn-sm btn-outline" onClick={() => remove(n)} title="삭제" aria-label="알림 삭제">삭제</button>
            </div>
          ))}
        </div>
      )}
      {items.length >= NOTIFICATION_LIMIT && (
        <div className="empty-note" style={{ paddingTop: 10 }}>최근 {NOTIFICATION_LIMIT}건까지 표시됩니다.</div>
      )}
    </div>
  );
}
