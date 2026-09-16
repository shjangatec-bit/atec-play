"use client";
import { useState } from "react";

export default function MonthlyReportPrint({ clubName, ym, data }) {
  const [open, setOpen] = useState(false);
  const [y, m] = ym.split("-");

  function printIt() {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      alert("팝업이 차단되었습니다. 주소창 오른쪽의 팝업 허용을 눌러주세요.");
      return;
    }
    w.document.write(buildHtml({ clubName, y, m, data }));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <button className="btn-sm btn-outline" onClick={printIt}>
      양식 출력
    </button>
  );
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function won(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function buildHtml({ clubName, y, m, data }) {
  const activityRows = data.reports
    .map((r) => {
      const co = Object.entries(r.companyBreakdown || {})
        .map(([k, v]) => `${esc(k)} ${v}`)
        .join(" · ");
      return `<tr>
        <td class="c">${esc(r.date)}</td>
        <td>${esc(r.title)}</td>
        <td class="c">${r.headcount}명</td>
        <td>${co}</td>
        <td class="r">${won(r.expense)}</td>
      </tr>`;
    })
    .join("");

  const attendeeBlocks = data.reports
    .map((r) => {
      const list = r.attendees.map((a) => `${esc(a.name)}<span class="co">(${esc(a.company)})</span>`).join(", ");
      return `<div class="ablock">
        <div class="ahead">${esc(r.date)} · ${esc(r.title)} <span class="co">${r.headcount}명</span></div>
        <div class="alist">${list || "-"}</div>
      </div>`;
    })
    .join("");

  const companyRows = data.companyRows
    .map((c) => `<tr><td>${esc(c.company)}</td><td class="c">${c.count}명</td><td class="r">${won(c.amount)}</td></tr>`)
    .join("");

  const basis =
    data.amount === data.byExpense ? "지출비용의 50%"
    : data.amount === data.byHead ? "참석 인원 기준"
    : "동호회 월 한도";

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<title>${esc(y)}년 ${esc(m)}월 ${esc(clubName)} 운영 결과보고</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Malgun Gothic","맑은 고딕",system-ui,sans-serif; color:#14181f; margin:0; padding:28px 32px; font-size:12px; line-height:1.55; }
  h1 { font-size:19px; text-align:center; margin:0 0 4px; letter-spacing:-0.3px; }
  .sub { text-align:center; color:#6b7280; font-size:11px; margin-bottom:20px; }
  h2 { font-size:13px; margin:22px 0 7px; padding-bottom:5px; border-bottom:1.5px solid #14181f; }
  table { width:100%; border-collapse:collapse; }
  th,td { border:1px solid #d5d9e0; padding:6px 8px; }
  th { background:#f3f5f8; font-weight:600; font-size:11.5px; }
  td.c { text-align:center; } td.r { text-align:right; }
  tr.total td { background:#f8f9fb; font-weight:700; }
  .ablock { padding:7px 0; border-bottom:1px dashed #dfe3e9; }
  .ablock:last-child { border-bottom:none; }
  .ahead { font-weight:600; margin-bottom:3px; }
  .alist { color:#374151; }
  .co { color:#8a919c; font-size:10.5px; margin-left:2px; }
  .calc { border:1px solid #d5d9e0; }
  .calc td { border:none; border-bottom:1px solid #eceff3; padding:7px 10px; }
  .calc tr:last-child td { border-bottom:none; background:#f3f5f8; font-weight:700; font-size:13px; }
  .note { margin-top:20px; padding:10px 12px; background:#f8f9fb; border:1px solid #e5e8ed; font-size:10.5px; color:#4b5563; line-height:1.8; }
  @page { size:A4; margin:14mm; }
  @media print { body { padding:0; } }
</style></head><body>

<h1>${esc(y)}년 ${esc(m)}월 ${esc(clubName)} 운영 결과보고</h1>
<div class="sub">활동 ${data.reports.length}회 · 참석 연인원 ${data.grossHeadcount}명 · 지원 대상 ${data.attendeeCount}명</div>

<h2>1. 활동 내역</h2>
<table>
  <thead><tr>
    <th style="width:88px">활동일</th><th>활동내용</th>
    <th style="width:60px">참석인원</th><th style="width:190px">회사별 인원</th>
    <th style="width:100px">지출비용</th>
  </tr></thead>
  <tbody>
    ${activityRows}
    <tr class="total"><td colspan="2" class="c">합계</td><td class="c">${data.grossHeadcount}명</td><td></td><td class="r">${won(data.expense)}</td></tr>
  </tbody>
</table>

<h2>2. 활동일별 참석자</h2>
${attendeeBlocks}

<h2>3. 지원금 산정</h2>
<table class="calc">
  <tr><td>지출비용 합계의 50%</td><td class="r">${won(data.expense)} × 50% = ${won(data.byExpense)}원</td></tr>
  <tr><td>참석 인원 기준 (중복 제외 ${data.attendeeCount}명 × 30,000원)</td><td class="r">${won(data.byHead)}원</td></tr>
  <tr><td>동호회 월 한도</td><td class="r">500,000원</td></tr>
  <tr><td>지급액 (위 셋 중 최소 · ${basis} 적용)</td><td class="r">${won(data.amount)}원</td></tr>
</table>

<h2>4. 회사별 지원금 배분</h2>
<table>
  <thead><tr><th>회사</th><th style="width:90px">참석인원</th><th style="width:130px">지원금액</th></tr></thead>
  <tbody>
    ${companyRows}
    <tr class="total"><td>합계</td><td class="c">${data.attendeeCount}명</td><td class="r">${won(data.amount)}원</td></tr>
  </tbody>
</table>

<div class="note">
  <b>지원 기준</b><br>
  · 활동비용의 50% 이내 지원 · 참석 1인당 월 30,000원 한도 · 동호회 월 총액 500,000원 한도<br>
  · 위 세 기준 중 가장 작은 금액을 지급하며, 같은 사람이 여러 번 참석해도 지원금 산정 시에는 1명으로 집계합니다.<br>
  · 활동보고서는 매월 1회(익월 10일까지) 제출하며, 지출 증빙은 시스템에 첨부합니다.
</div>

</body></html>`;
}
