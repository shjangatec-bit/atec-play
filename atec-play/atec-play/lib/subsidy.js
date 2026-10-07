// 동호회 지원금 산정 규칙 — 화면마다 따로 복사해 쓰던 상수와 계산을 한곳에 모았습니다.
// (한 곳만 고쳐서 화면마다 지급액이 달라지는 사고를 막기 위함입니다.)
//
// 지급액 = ① 비용합계 × 50%  ② 참석 실인원 × 3만원  ③ 50만원  중 가장 작은 금액
export const PER_PERSON_CAP = 30000;
export const MONTHLY_CLUB_CAP = 500000;
export const EXPENSE_RATIO = 0.5;

// 동호회의 한 달 지원금 산정. attendeeCount 는 같은 사람을 1명으로 센 실인원입니다.
export function calcSubsidy(expense, attendeeCount) {
  const byExpense = Math.floor(expense * EXPENSE_RATIO);
  const byHead = attendeeCount * PER_PERSON_CAP;
  return { byExpense, byHead, amount: Math.min(byExpense, byHead, MONTHLY_CLUB_CAP) };
}

// 회사별 실인원 비율로 지원금을 배분합니다. companyRows 는 [{ company, count }] (인원 많은 순으로 정렬해서 전달).
// 끝자리 오차는 마지막 회사에 몰아서 합계가 amount 와 정확히 같아집니다.
export function allocateByCompany(amount, companyRows, attendeeCount) {
  let assigned = 0;
  return companyRows.map((r, i) => {
    let share;
    if (i === companyRows.length - 1) {
      share = amount - assigned;
    } else {
      share = attendeeCount > 0 ? Math.floor((amount * r.count) / attendeeCount) : 0;
      assigned += share;
    }
    return { ...r, amount: share };
  });
}

// 한 회사(자사 참석자 myCount) 몫: 동호회 총액을 전체 인원 대비 비율로 계산하고 원 단위는 내림합니다.
export function shareOfCompany(clubTotal, myCount, totalCount) {
  return totalCount > 0 ? Math.floor((clubTotal * myCount) / totalCount) : 0;
}
