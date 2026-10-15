import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ok } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import NotificationList from "./NotificationList";
import { NOTIFICATION_LIMIT } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");

  const supabase = createClient();
  // RLS 로 본인 알림만 조회됩니다.
  const { data } = ok(
    await supabase
      .from("notifications")
      .select("id, type, title, body, link, created_at, read_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(NOTIFICATION_LIMIT),
    "알림"
  );

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/notifications" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">내 정보</div>
            <h1>알림</h1>
          </div>
        </div>
        <NotificationList initial={data || []} />
      </div>
    </div>
  );
}
