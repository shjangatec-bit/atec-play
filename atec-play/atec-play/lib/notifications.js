// 알림 화면용 도우미. 알림 내용은 DB 트리거(supabase/09_notifications.sql)가 만듭니다.

// 앱 안 경로만 허용합니다. ("//evil.com", "https://…", "javascript:" 등은 모두 거부)
export function safeLink(link) {
  if (typeof link !== "string") return null;
  if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(link)) return null;
  return link;
}

// "방금 전 / 5분 전 / 3시간 전 / 2일 전 / 2026. 10. 1."
export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((now - t) / 1000);
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
  return new Date(t).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

// 사이드바 뱃지용: 99 를 넘으면 "99+"
export function badgeText(n) {
  const c = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return c > 99 ? "99+" : String(c);
}

export const NOTIFICATION_LIMIT = 100;
