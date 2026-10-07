import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PER_PERSON_CAP,
  MONTHLY_CLUB_CAP,
  EXPENSE_RATIO,
  calcSubsidy,
  allocateByCompany,
  shareOfCompany,
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

test("자사 몫: 전체 인원 대비 비율, 원 단위 내림, 전체 0명이면 0원", () => {
  assert.equal(shareOfCompany(500000, 3, 10), 150000);
  assert.equal(shareOfCompany(100000, 1, 3), 33333);
  assert.equal(shareOfCompany(100000, 1, 0), 0);
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
const legacyShare = (clubTotal, myCount, totalCount) =>
  totalCount > 0 ? Math.floor((clubTotal * myCount) / totalCount) : 0;

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
    const my = rnd(attendeeCount + 1);
    assert.equal(shareOfCompany(a.amount, my, attendeeCount), legacyShare(a.amount, my, attendeeCount));
  }
});
