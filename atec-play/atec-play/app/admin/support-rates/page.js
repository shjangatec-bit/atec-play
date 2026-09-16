import { redirect } from "next/navigation";
import { getCurrentProfile, hasPermission } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function SupportRatesPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");
  if (profile?.status !== "approved") redirect("/pending");
  if (!hasPermission(permissions, "CLUB_SUPPORT_RATE_EDIT")) redirect("/dashboard");

  return (
    <div className="app-shell">
      <Sidebar profile={profile} permissions={permissions} active="/admin/support-rates" />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">관리자 / 지원금 기준</div>
            <h1>지원금 산정 기준</h1>
          </div>
        </div>

        <div className="card">
          <div className="section-title">현행 기준</div>
          <table>
            <thead>
              <tr><th>구분</th><th>기준</th><th>설명</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>지원 비율</td>
                <td className="mono">비용의 50% 이내</td>
                <td className="co-tag">활동보고서에 입력한 지출 비용의 절반</td>
              </tr>
              <tr>
                <td>인당 월 한도</td>
                <td className="mono">30,000원</td>
                <td className="co-tag">같은 사람이 그 달에 여러 번 참석해도 1명으로 집계</td>
              </tr>
              <tr>
                <td>동호회 월 총액 한도</td>
                <td className="mono">500,000원</td>
                <td className="co-tag">동호회 하나당 매월 최대 금액</td>
              </tr>
              <tr>
                <td>지급 주기·근거</td>
                <td className="mono">월 1회 · 매월 10일</td>
                <td className="co-tag">활동보고서 제출 기준. 한 달에 여러 건이면 합산해 계산</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">계산 방식</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 2 }}>
            매월, 동호회별로 아래 세 금액을 구한 뒤 <b style={{ color: "var(--ink)" }}>가장 작은 금액</b>을 지급합니다.
            <div style={{ background: "var(--bg)", borderRadius: 8, padding: "12px 16px", marginTop: 10 }}>
              ① 그 달 활동비용 합계 × 50%
              <br />
              ② 그 달 참석 인원 × 30,000원
              <br />
              ③ 500,000원
            </div>
            <div style={{ marginTop: 12 }}>
              구해진 금액은 <b style={{ color: "var(--ink)" }}>참석자의 소속회사별 인원 비율</b>로 나뉘어, 각 회사 지원금 담당자에게 지급 대상으로 표시됩니다.
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <b style={{ color: "var(--ink)" }}>예시</b> — 활동비용 80만원, 참석 12명(A사 8명·B사 4명)
              <br />
              ① 40만원 · ② 36만원 · ③ 50만원 → 지급액 <b className="mono" style={{ color: "var(--ink)" }}>360,000원</b>
              <br />
              A사 8/12 → <span className="mono">240,000원</span> · B사 4/12 → <span className="mono">120,000원</span>
            </div>
          </div>
        </div>

        <div className="empty-note" style={{ paddingTop: 12 }}>
          위 기준은 사내 규정에 따라 시스템에 고정되어 있습니다. 기준이 변경되면 시스템 반영이 필요하니 담당자에게 요청해 주세요.
        </div>
      </div>
    </div>
  );
}
