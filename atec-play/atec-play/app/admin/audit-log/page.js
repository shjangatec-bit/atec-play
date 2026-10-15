import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import Highlight from "@/components/Highlight";
import { parseTerms, matchesAllTerms } from "@/lib/search";
import { ACTION_LABELS, SOURCE_LABELS, actionLabel, describeEntry, kstDayStart, kstDayEndExclusive, AUDIT_PAGE_LIMIT } from "@/lib/audit";

export const dynamic = "force-dynamic";

const one = (v) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AuditLogPage({ searchParams }) {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "PERM_MANAGE") && !hasPermission(permissions, "ACC_MANAGE")) redirect("/dashboard");

  const action = ACTION_LABELS[one(searchParams?.action)] ? one(searchParams.action) : "";
  const from = kstDayStart(one(searchParams?.from)) ? one(searchParams.from) : "";
  const to = kstDayStart(one(searchParams?.to)) ? one(searchParams.to) : "";
  const q = one(searchParams?.q).slice(0, 100);
  const terms = parseTerms(q);

  const supabase = createClient();
  let query = supabase
    .from("audit_log")
    .select("id, at, actor_id, actor_name, action, target_label, detail, source")
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_LIMIT);
  if (action) query = query.eq("action", action);
  if (from) query = query.gte("at", kstDayStart(from));
  if (to) query = query.lt("at", kstDayEndExclusive(to));
  const { data, error } = await query;

  // 08 SQL 을 아직 적용하지 않았다면 안내만 보여줍니다.
  const notReady = error && (error.code === "42P01" || error.code === "PGRST205");
  if (error && !notReady) {
    console.error("[DB 오류] 작업 기록:", error.code, error.message);
    throw new Error("작업 기록을 불러오지 못했습니다.");
  }

  const all = data || [];
  const rows = terms.length
    ? all.filter((e) => matchesAllTerms([e.actor_name, e.target_label, actionLabel(e.action), describeEntry(e)], terms))
    : all;

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/audit-log" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자</div>
            <h1>작업 기록</h1>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <form method="get" className="row-flex" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select name="action" defaultValue={action} style={{ height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }}>
              <option value="">전체 종류</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input type="date" name="from" defaultValue={from} aria-label="시작일" style={{ height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 8px" }} />
            <span className="co-tag">~</span>
            <input type="date" name="to" defaultValue={to} aria-label="종료일" style={{ height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 8px" }} />
            <input type="search" name="q" defaultValue={q} placeholder="작업자·대상 검색" maxLength={100}
              style={{ height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", minWidth: 180 }} />
            <button className="btn-sm btn-approve" type="submit">조회</button>
            <a className="btn-sm btn-outline" href="/admin/audit-log">초기화</a>
          </form>
          <div className="empty-note" style={{ padding: "10px 0 0" }}>
            누가·언제·무엇을 바꿨는지 자동으로 남는 기록입니다. 기록은 수정하거나 삭제할 수 없습니다.
            최근 {AUDIT_PAGE_LIMIT}건까지 보여주며, 날짜·종류로 범위를 좁힐 수 있습니다. 시각은 한국 시간입니다.
          </div>
        </div>

        {notReady ? (
          <div className="card"><div className="empty-note">작업 기록 기능이 아직 켜지지 않았습니다. 관리자에게 DB 설정(08_audit_log.sql) 적용을 요청해 주세요.</div></div>
        ) : (
          <div className="card">
            <div className="section-title">
              기록 {rows.length}건{all.length >= AUDIT_PAGE_LIMIT ? ` (최근 ${AUDIT_PAGE_LIMIT}건 중)` : ""}
            </div>
            {rows.length === 0 ? (
              <div className="empty-note">조건에 맞는 기록이 없습니다.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>일시</th><th>작업자</th><th>종류</th><th>대상</th><th>내용</th><th>출처</th></tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                      <td><Highlight text={e.actor_name || (e.actor_id ? "(알 수 없음)" : "-")} terms={terms} /></td>
                      <td><span className="badge badge-gray">{actionLabel(e.action)}</span></td>
                      <td><Highlight text={e.target_label || "-"} terms={terms} /></td>
                      <td className="co-tag" style={{ maxWidth: 320 }}><Highlight text={describeEntry(e)} terms={terms} /></td>
                      <td className="co-tag">{SOURCE_LABELS[e.source] || e.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
