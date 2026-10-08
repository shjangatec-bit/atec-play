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

// 참석한 사람들을 회사별로 묶어 동호회 지원금을 배분합니다. (월간 보고서와 지원금 지급 관리 화면이 같은 결과를 내도록 이 함수 하나만 사용)
//  · companyUsers: { [회사명]: Set(참석자 id) } 또는 Map — 같은 사람은 1명으로 센 실인원
//  · 정렬: 인원 많은 순, 같으면 회사명 가나다순 (화면·입력 순서와 상관없이 항상 같은 결과)
//  · 끝자리 오차는 마지막 회사에 몰아서 모든 회사 몫의 합이 amount 와 정확히 같음
export function companyShares(amount, companyUsers) {
  const entries = companyUsers instanceof Map ? [...companyUsers] : Object.entries(companyUsers || {});
  const rows = entries
    .map(([company, users]) => ({ company, count: users.size }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company, "ko"));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return allocateByCompany(amount, rows, total);
}

// 보고서를 새로 등록하기 전에 "같은 달 누적 기준"으로 지원금이 어떻게 달라지는지 미리 계산하고 한도 안내 문구를 만듭니다.
//  · existing: 이미 등록된 같은 달 보고서 [{ expense, attendeeIds }]
//  · add: 지금 작성 중인 보고서 { expense, attendeeIds }
export function projectMonthly(existing, add) {
  const total = (reports) => {
    const ids = new Set();
    let expense = 0;
    reports.forEach((r) => {
      expense += Number(r.expense) || 0;
      (r.attendeeIds || []).forEach((id) => ids.add(id));
    });
    return { expense, ids };
  };
  const b = total(existing);
  const a = total([...existing, add]);
  const before = calcSubsidy(b.expense, b.ids.size);
  const after = calcSubsidy(a.expense, a.ids.size);
  const delta = after.amount - before.amount;
  const newHeads = a.ids.size - b.ids.size;                       // 이번 보고서로 새로 집계되는 인원
  const alreadyCounted = (add.attendeeIds || []).filter((id) => b.ids.has(id)).length; // 이달 이미 집계된 사람

  let binding; // 지금 지원금을 정하는 기준
  if (after.amount === MONTHLY_CLUB_CAP) binding = "cap";
  else if (after.byHead < after.byExpense) binding = "head";
  else if (after.byExpense < after.byHead) binding = "expense";
  else binding = "equal";

  const won = (n) => n.toLocaleString("ko-KR") + "원";
  const warnings = [];
  const addExpense = Number(add.expense) || 0;

  if ((add.attendeeIds || []).length === 0 && addExpense > 0) {
    warnings.push({ level: "warn", text: "참석자를 한 명도 체크하지 않았습니다. 참석 인원이 없으면 지원금이 늘지 않습니다." });
  }
  if (binding === "cap") {
    if (before.amount >= MONTHLY_CLUB_CAP) {
      warnings.push({ level: "warn", text: `이 달 지원금이 이미 월 한도(${won(MONTHLY_CLUB_CAP)})에 도달했습니다. 이 보고서를 등록해도 지원금은 늘지 않습니다.` });
    } else {
      warnings.push({ level: "warn", text: `이 보고서를 등록하면 월 한도(${won(MONTHLY_CLUB_CAP)})에 도달합니다. 이달에 추가되는 비용·인원은 지원되지 않습니다. (등록 전 남은 한도 ${won(MONTHLY_CLUB_CAP - before.amount)})` });
    }
  } else if (binding === "head" || binding === "equal") {
    warnings.push({ level: delta === 0 && addExpense > 0 ? "warn" : "info", text: `참석 실인원 ${a.ids.size}명 × ${won(PER_PERSON_CAP)} = ${won(after.byHead)}가 한도입니다. 비용을 더 쓰거나 늘려도 지원금은 늘지 않고, 참석 인원이 늘어야 합니다. (최대 ${won(MONTHLY_CLUB_CAP)})` });
  } else if (after.byHead > after.byExpense) {
    warnings.push({ level: "info", text: `비용의 50%(${won(after.byExpense)})가 한도입니다. 참석 인원 기준으로는 ${won(Math.min(after.byHead, MONTHLY_CLUB_CAP))}까지 가능합니다.` });
  }
  if (alreadyCounted > 0) {
    warnings.push({ level: "info", text: `이번 보고서 참석자 중 ${alreadyCounted}명은 이달 다른 활동에 이미 집계되어 인원이 중복으로 늘지 않습니다. (같은 달에 몇 번 참석해도 1인 ${won(PER_PERSON_CAP)}, 1명으로 계산)` });
  }
  return { before, after, delta, newHeads, alreadyCounted, headcount: a.ids.size, expense: a.expense, binding, warnings };
}
