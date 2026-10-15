// 작업 기록(audit_log) 화면용 도우미: 기록 종류 이름, 한 줄 설명, 날짜 범위 해석.
// DB 가 남기는 action 값과 detail 구조는 supabase/08_audit_log.sql 과 서버 API 에서 정합니다.

export const ACTION_LABELS = {
  "member.role_change": "직책 변경",
  "permission.grant": "권한 부여",
  "permission.revoke": "권한 회수",
  "account.status_change": "계정 상태 변경",
  "support_rate.change": "지원 단가 변경",
  "disbursement.paid": "지원금 지급",
  "disbursement.revert": "지원금 지급 취소",
  "club_request.status_change": "동호회 신청 처리",
  "user.password_reset": "비밀번호 초기화",
  "backup.download": "전체 백업 내려받기",
};

export const SOURCE_LABELS = { db: "화면", api: "서버", sql: "DB 직접" };

const STATUS_LABELS = { pending: "대기", approved: "승인", rejected: "반려", paid: "지급", suspended: "정지", withdrawn: "탈퇴" };
const st = (v) => (v == null || v === "" ? "-" : STATUS_LABELS[v] || String(v));
const won = (v) => (v == null || v === "" || isNaN(Number(v)) ? "-" : `${Number(v).toLocaleString("ko-KR")}원`);

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || "-";
}

// 기록 한 건을 사람이 읽는 한 줄로 바꿉니다. 알 수 없는 종류·빠진 값에도 오류 없이 동작합니다.
export function describeEntry(e) {
  const d = e?.detail && typeof e.detail === "object" ? e.detail : {};
  switch (e?.action) {
    case "member.role_change":
      return `직책 ${d.from ?? "-"} → ${d.to ?? "-"}`;
    case "permission.grant":
      return "권한 부여";
    case "permission.revoke":
      return "권한 회수";
    case "account.status_change":
      return `상태 ${st(d.from)} → ${st(d.to)}`;
    case "support_rate.change":
      return `단가 ${d.from == null ? "신규" : won(d.from)} → ${won(d.to)}`;
    case "disbursement.paid": {
      const base = `${d.attendee_count ?? "-"}명 · ${won(d.amount)}`;
      return d.from_status === "paid" ? `${base} (금액 수정, 이전 ${won(d.from_amount)})` : base;
    }
    case "disbursement.revert":
      return `지급 취소 (기록된 금액 ${won(d.amount)})`;
    case "club_request.status_change":
      return `${d.type === "close" ? "폐쇄" : d.type === "create" ? "개설" : d.type || "신청"} ${st(d.from)} → ${st(d.to)}`;
    case "user.password_reset":
      return "비밀번호를 임시 비밀번호로 초기화";
    case "backup.download":
      return d.tables != null ? `전체 백업 (${d.tables}개 표, ${d.rows ?? "-"}행)` : "전체 백업";
    default:
      return "";
  }
}

// 'YYYY-MM-DD' (한국 날짜) 를 조회용 UTC 시각으로 바꿉니다. 잘못된 값은 null.
export function kstDayStart(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const t = Date.parse(`${s}T00:00:00+09:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
// 종료일은 그날 끝까지 포함(다음 날 0시 미만)
export function kstDayEndExclusive(s) {
  const start = kstDayStart(s);
  if (!start) return null;
  return new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
}

export const AUDIT_PAGE_LIMIT = 300;
