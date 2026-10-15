import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_LABELS, actionLabel, describeEntry, kstDayStart, kstDayEndExclusive } from "../lib/audit.js";

test("기록 종류 이름: 알려진 값은 한글, 모르는 값은 그대로, 빈 값은 -", () => {
  assert.equal(actionLabel("member.role_change"), "직책 변경");
  assert.equal(actionLabel("something.new"), "something.new");
  assert.equal(actionLabel(null), "-");
  assert.ok(Object.keys(ACTION_LABELS).length >= 10);
});

test("한 줄 설명: 종류별 내용", () => {
  assert.equal(describeEntry({ action: "member.role_change", detail: { from: "회원", to: "총무" } }), "직책 회원 → 총무");
  assert.equal(describeEntry({ action: "account.status_change", detail: { from: "pending", to: "approved" } }), "상태 대기 → 승인");
  assert.equal(describeEntry({ action: "support_rate.change", detail: { from: null, to: "30000" } }), "단가 신규 → 30,000원");
  assert.equal(describeEntry({ action: "support_rate.change", detail: { from: "30000", to: "25000" } }), "단가 30,000원 → 25,000원");
  assert.equal(describeEntry({ action: "disbursement.paid", detail: { attendee_count: "5", amount: "125000" } }), "5명 · 125,000원");
  assert.equal(
    describeEntry({ action: "disbursement.paid", detail: { attendee_count: "5", amount: "150000", from_status: "paid", from_amount: "125000" } }),
    "5명 · 150,000원 (금액 수정, 이전 125,000원)"
  );
  assert.equal(describeEntry({ action: "club_request.status_change", detail: { type: "close", from: "pending", to: "approved" } }), "폐쇄 대기 → 승인");
  assert.equal(describeEntry({ action: "backup.download", detail: { tables: 14, rows: 320 } }), "전체 백업 (14개 표, 320행)");
});

test("한 줄 설명: 빠진 값·이상한 값에도 오류 없음", () => {
  for (const e of [null, undefined, {}, { action: "member.role_change" }, { action: "x", detail: null }, { action: "disbursement.paid", detail: { amount: "abc" } }, { action: "support_rate.change", detail: "str" }]) {
    assert.doesNotThrow(() => describeEntry(e));
  }
  assert.equal(describeEntry({ action: "unknown", detail: {} }), "");
  assert.equal(describeEntry({ action: "disbursement.paid", detail: { amount: "abc" } }), "-명 · -");
});

test("날짜 범위: 한국 시간 기준, 종료일 포함", () => {
  assert.equal(kstDayStart("2026-10-15"), "2026-10-14T15:00:00.000Z");
  assert.equal(kstDayEndExclusive("2026-10-15"), "2026-10-15T15:00:00.000Z");
  for (const bad of ["", null, undefined, "2026-13-40", "abc", "2026-1-5", "2026-10-15; drop"]) {
    assert.equal(kstDayStart(bad), null);
    assert.equal(kstDayEndExclusive(bad), null);
  }
});
