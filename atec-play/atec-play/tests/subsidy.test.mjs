import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PER_PERSON_CAP,
  MONTHLY_CLUB_CAP,
  EXPENSE_RATIO,
  calcSubsidy,
  allocateByCompany,
  companyShares,
  projectMonthly,
} from "../lib/subsidy.js";

test("규칙 상수: 1인 3만원, 월 50만원, 비용의 50%", () => {
  assert.equal(PER_PERSON_CAP, 30000);
  assert.equal(MONTHLY_CLUB_CAP, 500000);
  assert.equal(EXPENSE_RATIO, 0.5);
});

test("지급액 = 비용×50% / 인원×3만원 / 50만원 중 최솟값", () => {
  // 비용 기준이 가장 작은 경우: 20만원 × 50% = 10만원 (인원 10명 = 30만원, 상한 50만원)
  assert.deepEqual(calcSubsidy(200000, 10), { byExpense: 100000, byHead: 300000, amount: 100000 });
  // 인원 기준이 가장 작은 경우: 2명 = 6만원 (비용 100만원 × 50% = 50만원)
  assert.deepEqual(calcSubsidy(1000000, 2), { byExpense: 500000, byHead: 60000, amount: 60000 });
  // 월 상한(50만원)이 적용되는 경우
  assert.deepEqual(calcSubsidy(5000000, 30), { byExpense: 2500000, byHead: 900000, amount: 500000 });
  // 경계: 정확히 상한과 같은 경우
  assert.equal(calcSubsidy(1000000, 17).amount, 500000);
  // 원 단위 내림: 12,345원 × 50% = 6,172.5 → 6,172원
  assert.equal(calcSubsidy(12345, 10).byExpense, 6172);
  // 참석자 0명이면 지원금 0원
  assert.equal(calcSubsidy(100000, 0).amount, 0);
  // 비용 0원이면 지원금 0원
  assert.equal(calcSubsidy(0, 5).amount, 0);
});

test("회사별 배분: 합계는 항상 총액과 정확히 일치(끝자리는 마지막 회사에)", () => {
  const rows = allocateByCompany(100000, [
    { company: "A사", count: 3 },
    { company: "B사", count: 3 },
    { company: "C사", count: 1 },
  ], 7);
  // 100000×3/7 = 42857.14 → 42857, 두 번째도 42857, 마지막이 나머지 14286
  assert.deepEqual(rows.map((r) => r.amount), [42857, 42857, 14286]);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 100000);
});

test("회사별 배분: 한 회사만 있으면 총액 전부", () => {
  assert.deepEqual(allocateByCompany(90000, [{ company: "A사", count: 3 }], 3).map((r) => r.amount), [90000]);
});

test("회사별 배분: 입력 배열을 변경하지 않음", () => {
  const input = [{ company: "A사", count: 1 }];
  allocateByCompany(1000, input, 1);
  assert.equal(input[0].amount, undefined);
});

// ── 기존 화면에 복사돼 있던 인라인 계산식과 결과가 완전히 같은지 대량 비교 (리팩터링 안전장치) ──
const legacyClub = (expense, headcount) => {
  const byExpense = Math.floor(expense * 0.5);
  const byHead = headcount * 30000;
  return { byExpense, byHead, amount: Math.min(byExpense, byHead, 500000) };
};
const legacyAllocate = (amount, rows, attendeeCount) => {
  const out = rows.map((r) => ({ ...r }));
  let assigned = 0;
  out.forEach((r, i) => {
    if (i === out.length - 1) r.amount = amount - assigned;
    else {
      r.amount = attendeeCount > 0 ? Math.floor((amount * r.count) / attendeeCount) : 0;
      assigned += r.amount;
    }
  });
  return out;
};

test("기존 인라인 계산식과 결과 동일 (무작위 5만 건)", () => {
  let seed = 12345; // 재현 가능한 난수
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 50000; i++) {
    const expense = rnd(3_000_000);
    const companies = 1 + rnd(5);
    const rows = Array.from({ length: companies }, (_, k) => ({ company: `C${k}`, count: 1 + rnd(8) }))
      .sort((a, b) => b.count - a.count);
    const attendeeCount = rows.reduce((s, r) => s + r.count, 0);

    const a = calcSubsidy(expense, attendeeCount);
    assert.deepEqual(a, legacyClub(expense, attendeeCount));
    assert.deepEqual(allocateByCompany(a.amount, rows, attendeeCount), legacyAllocate(a.amount, rows, attendeeCount));
  }
});

// ── 회사별 몫: 월간 보고서와 지급 관리 화면이 같은 함수를 쓰므로 항상 같은 결과여야 함 ──
const users = (n, prefix) => new Set(Array.from({ length: n }, (_, i) => `${prefix}${i}`));

test("회사별 몫: 모든 회사 몫의 합 = 동호회 지급액 (끝자리는 마지막 회사)", () => {
  // 3개 회사 3·3·1명, 총액 100,000원
  const rows = companyShares(100000, { 에이텍: users(3, "a"), 에이텍컴퓨터: users(3, "b"), 에이텍씨앤: users(1, "c") });
  assert.deepEqual(rows.map((r) => [r.company, r.amount]), [["에이텍", 42857], ["에이텍컴퓨터", 42857], ["에이텍씨앤", 14286]]);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 100000);
});

test("회사별 몫: 인원이 같으면 회사명 가나다순으로 고정, 입력 순서가 달라도 결과 동일", () => {
  const a = companyShares(100000, { 나사: users(1, "n"), 가사: users(1, "g"), 다사: users(1, "d") });
  const b = companyShares(100000, new Map([["다사", users(1, "d")], ["가사", users(1, "g")], ["나사", users(1, "n")]]));
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((r) => r.company), ["가사", "나사", "다사"]);
  assert.equal(a.at(-1).amount, 100000 - 33333 * 2); // 끝자리는 마지막(다사)에
});

test("회사별 몫: 무작위 3만 건 — 합계 항상 일치, 입력 순서 무관, 음수 없음", () => {
  let seed = 777;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 30000; i++) {
    const companies = 1 + rnd(6);
    const entries = Array.from({ length: companies }, (_, k) => [`회사${k}`, users(1 + rnd(9), `c${k}-`)]);
    const total = entries.reduce((s, [, u]) => s + u.size, 0);
    const { amount } = calcSubsidy(rnd(3_000_000), total);
    const rows = companyShares(amount, Object.fromEntries(entries));
    assert.equal(rows.reduce((s, r) => s + r.amount, 0), amount);
    assert.ok(rows.every((r) => r.amount >= 0));
    const shuffled = companyShares(amount, new Map([...entries].reverse()));
    assert.deepEqual(shuffled, rows);
  }
});

// ── 한도 사전 경고 ──
const ids = (...n) => n.map((x) => `u${x}`);

test("한도 경고: 월 상한(50만원)에 이미 도달한 달에는 늘지 않는다고 경고", () => {
  const existing = [{ expense: 3_000_000, attendeeIds: ids(...Array.from({ length: 20 }, (_, i) => i)) }];
  const p = projectMonthly(existing, { expense: 100000, attendeeIds: ids(1, 2) });
  assert.equal(p.before.amount, 500000);
  assert.equal(p.delta, 0);
  assert.equal(p.binding, "cap");
  assert.ok(p.warnings.some((w) => w.level === "warn" && /이미 월 한도/.test(w.text)));
});

test("한도 경고: 이번 보고서로 상한에 도달하면 남은 한도를 알려줌", () => {
  const existing = [{ expense: 800000, attendeeIds: ids(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) }]; // 40만 vs 30만 → 30만
  const p = projectMonthly(existing, { expense: 3_000_000, attendeeIds: ids(11, 12, 13, 14, 15, 16, 17, 18, 19, 20) });
  assert.equal(p.before.amount, 300000);
  assert.equal(p.after.amount, 500000);
  assert.equal(p.delta, 200000);
  assert.ok(p.warnings.some((w) => /월 한도.*도달합니다/.test(w.text) && /남은 한도 200,000원/.test(w.text)));
});

test("한도 경고: 인원이 한도인데 비용만 늘리면 경고, 같은 달 중복 참석자는 인원에 안 늘어난다고 안내", () => {
  const existing = [{ expense: 1_000_000, attendeeIds: ids(1, 2, 3) }]; // 인원 9만원이 한도
  const p = projectMonthly(existing, { expense: 500000, attendeeIds: ids(1, 2, 3) });
  assert.equal(p.binding, "head");
  assert.equal(p.delta, 0);
  assert.equal(p.newHeads, 0);
  assert.equal(p.alreadyCounted, 3);
  assert.ok(p.warnings.some((w) => w.level === "warn" && /참석 실인원 3명/.test(w.text)));
  assert.ok(p.warnings.some((w) => /이미 집계되어 인원이 중복으로 늘지 않습니다/.test(w.text)));
});

test("한도 경고: 참석자 0명이면 경고, 비용이 한도면 정보 안내", () => {
  const none = projectMonthly([], { expense: 100000, attendeeIds: [] });
  assert.equal(none.after.amount, 0);
  assert.ok(none.warnings.some((w) => /한 명도 체크하지 않았습니다/.test(w.text)));
  const costBound = projectMonthly([], { expense: 100000, attendeeIds: ids(1, 2, 3, 4) }); // 비용 5만 < 인원 12만
  assert.equal(costBound.binding, "expense");
  assert.ok(costBound.warnings.some((w) => w.level === "info" && /비용의 50%\(50,000원\)가 한도/.test(w.text)));
});

test("한도 경고: 계산 결과는 calcSubsidy(합산 비용, 합산 실인원)와 항상 같다", () => {
  let seed = 4242;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 20000; i++) {
    const existing = Array.from({ length: rnd(4) }, () => ({ expense: rnd(800000), attendeeIds: ids(...Array.from({ length: rnd(8) }, () => rnd(15))) }));
    const add = { expense: rnd(800000), attendeeIds: ids(...Array.from({ length: rnd(8) }, () => rnd(15))) };
    const all = [...existing, add];
    const heads = new Set(all.flatMap((r) => r.attendeeIds)).size;
    const exp = all.reduce((s, r) => s + r.expense, 0);
    const p = projectMonthly(existing, add);
    assert.deepEqual(p.after, calcSubsidy(exp, heads));
    assert.ok(p.delta >= 0);
  }
});
