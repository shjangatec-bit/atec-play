// 지원금 지급 관리 화면의 계산·엑셀 데이터 조립 (화면과 분리해서 테스트할 수 있게 모았습니다)
import { calcSubsidy, companyShares } from "./subsidy.js";

// 활동보고서를 동호회별로 묶습니다. companyId 는 로그인한 담당자의 소속회사.
export function groupReportsByClub(reportPosts, companyId) {
  const byClub = {};
  (reportPosts || []).forEach((p) => {
    if (!byClub[p.club_id]) {
      byClub[p.club_id] = {
        clubName: p.club?.name,
        allAttendees: new Set(),
        companies: {},          // 회사명 → 참석자 id 집합 (회사별 몫 배분용, 월간 보고서와 같은 기준)
        myAttendees: new Map(),
        ownCompanyName: null,
        expense: 0,
        reports: [],
      };
    }
    const c = byClub[p.club_id];
    c.expense += Number(p.expense_amount) || 0;
    (p.post_attendees || []).forEach((a) => {
      c.allAttendees.add(a.user_id);
      const coName = a.user?.company?.name || "-";
      (c.companies[coName] ||= new Set()).add(a.user_id);
      if (a.user?.company_id === companyId) {
        c.myAttendees.set(a.user_id, a.user.name);
        c.ownCompanyName = coName;
      }
    });
    c.reports.push({
      postId: p.id,
      title: p.title,
      activityDate: p.activity_date,
      expense: Number(p.expense_amount) || 0,
      attendeeNames: (p.post_attendees || []).filter((a) => a.user?.company_id === companyId).map((a) => a.user.name),
      attachments: p.post_attachments || [],
    });
  });
  return byClub;
}

// 자사 소속 참석자가 있는 동호회만 골라 지급 대상 행을 만듭니다.
//  · 회사별 몫은 월간 보고서와 같은 함수(companyShares)로 계산 → 모든 회사 몫의 합 = 동호회 지급액
//  · 지급 완료된 건은 지급 당시 저장된 금액(disbursement.amount)을 보여주고, 현재 계산(calcAmount)은 따로 보관
export function buildRows(byClub, clubIds, disbursementByClub = {}) {
  return clubIds.map((clubId) => {
    const c = byClub[clubId];
    const totalCount = c.allAttendees.size;
    const { byExpense, byHead, amount: clubTotal } = calcSubsidy(c.expense, totalCount);
    const calcAmount = companyShares(clubTotal, c.companies).find((r) => r.company === c.ownCompanyName)?.amount ?? 0;
    const disbursement = disbursementByClub[clubId];
    const paid = disbursement?.status === "paid";
    return {
      clubId,
      clubName: c.clubName,
      expense: c.expense,
      totalCount,
      myCount: c.myAttendees.size,
      attendeeNames: [...c.myAttendees.values()],
      byExpense,
      byHead,
      clubTotal,
      amount: paid && disbursement.amount != null ? Number(disbursement.amount) : calcAmount,
      calcAmount,
      disbursement,
      reports: c.reports,
    };
  });
}

export const clubIdsWithMyAttendees = (byClub) => Object.keys(byClub).filter((id) => byClub[id].myAttendees.size > 0);

// 엑셀 다운로드용 시트 데이터 (화면에 보이는 그대로)
export function buildExportSheets(rows, month) {
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  return [
    {
      name: `${month}월 지원금`,
      columns: [
        { header: "동호회", width: 24 },
        { header: "활동비용 합계", type: "number", width: 16 },
        { header: "비용의 50%", type: "number", width: 14 },
        { header: "전체 참석 실인원", type: "number", width: 16 },
        { header: "인원 × 3만원", type: "number", width: 14 },
        { header: "동호회 지급액", type: "number", width: 16 },
        { header: "자사 참석 인원", type: "number", width: 14 },
        { header: "자사 부담액", type: "number", width: 14 },
        { header: "지급 상태", width: 12 },
        { header: "처리일", width: 14 },
        { header: "처리자", width: 12 },
        { header: "비고", width: 36 },
      ],
      rows: rows.map((r) => {
        const paid = r.disbursement?.status === "paid";
        return [
          r.clubName, r.expense, r.byExpense, r.totalCount, r.byHead, r.clubTotal, r.myCount, r.amount,
          paid ? "지급완료" : "미지급",
          paid ? new Date(r.disbursement.paid_at).toLocaleDateString("ko-KR") : "",
          paid ? r.disbursement.users?.name || "" : "",
          paid && r.amount !== r.calcAmount ? `지급 당시 금액 (현재 계산 ${r.calcAmount.toLocaleString("ko-KR")}원)` : "",
        ];
      }),
      totalRow: ["합계", sum("expense"), "", "", "", sum("clubTotal"), "", sum("amount"), "", "", "", ""],
    },
    {
      name: "활동보고서 내역",
      columns: [
        { header: "동호회", width: 24 },
        { header: "활동일", width: 12 },
        { header: "보고서 제목", width: 36 },
        { header: "비용", type: "number", width: 14 },
        { header: "자사 참석자", width: 40 },
        { header: "첨부파일 수", type: "number", width: 12 },
      ],
      rows: rows.flatMap((r) =>
        r.reports.map((rep) => [r.clubName, rep.activityDate, rep.title, rep.expense, rep.attendeeNames.join(", "), rep.attachments.length])
      ),
    },
  ];
}

export const exportFileName = (companyName, year, month) =>
  `지원금_${String(companyName || "회사").replace(/[\\/:*?"<>|]/g, "")}_${year}-${String(month).padStart(2, "0")}.xlsx`;
