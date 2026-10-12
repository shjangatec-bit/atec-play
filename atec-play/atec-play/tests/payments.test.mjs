import { test } from "node:test";
import assert from "node:assert/strict";
import { groupReportsByClub, clubIdsWithMyAttendees, buildRows, buildExportSheets, exportFileName } from "../lib/payments.js";
import { calcSubsidy, companyShares } from "../lib/subsidy.js";

const CO = { A: { id: "co-a", name: "에이텍" }, B: { id: "co-b", name: "에이텍컴퓨터" }, C: { id: "co-c", name: "에이텍씨앤" } };
const person = (id, co) => ({ user_id: id, user: { name: `이름${id}`, company_id: CO[co].id, company: { name: CO[co].name } } });
const post = (id, club, date, expense, attendees, files = 0) => ({
  id, club_id: club, club: { name: `동호회-${club}` }, title: `활동 ${id}`, activity_date: date, expense_amount: expense,
  post_attendees: attendees, post_attachments: Array.from({ length: files }, () => ({ file_url: "x", file_type: "receipt" })),
});

// 한 동호회, 한 달 3건의 보고서. A사 3명(1·2·3), B사 3명(4·5·6), C사 1명(7). 4번은 두 번 참석(1명으로 계산)
const posts = [
  post("p1", "club1", "2026-10-03", 300000, [person("u1", "A"), person("u2", "A"), person("u4", "B")], 2),
  post("p2", "club1", "2026-10-10", 200000, [person("u3", "A"), person("u4", "B"), person("u5", "B"), person("u6", "B"), person("u7", "C")], 0),
];

test("세 회사 담당자가 각자 보는 금액을 모두 더하면 동호회 지급액과 정확히 같다", () => {
  const total = calcSubsidy(500000, 7).amount; // 비용 50만×50% = 25만 / 7명×3만 = 21만 → 21만
  assert.equal(total, 210000);
  const mine = ["A", "B", "C"].map((k) => {
    const byClub = groupReportsByClub(posts, CO[k].id);
    const rows = buildRows(byClub, clubIdsWithMyAttendees(byClub));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].clubTotal, total);
    return rows[0].amount;
  });
  assert.equal(mine.reduce((s, n) => s + n, 0), total);   // 예전 방식(각자 내림)에서는 몇 원 모자랄 수 있던 부분
  // 3·3·1명 → 인원 많은 순, 같으면 가나다순: 에이텍(3) / 에이텍컴퓨터(3) / 에이텍씨앤(1, 마지막이 끝자리 흡수)
  assert.deepEqual(mine, [Math.floor((210000 * 3) / 7), Math.floor((210000 * 3) / 7), 210000 - 2 * Math.floor((210000 * 3) / 7)]);
});

test("지급 관리 금액 = 월간 보고서(회사별 배분)와 같은 함수·같은 결과", () => {
  const byClub = groupReportsByClub(posts, CO.C.id);
  const c = byClub.club1;
  const reportStyle = companyShares(210000, c.companies); // 월간 보고서가 쓰는 호출 방식
  const row = buildRows(byClub, ["club1"])[0];
  assert.equal(row.amount, reportStyle.find((r) => r.company === "에이텍씨앤").amount);
});

test("같은 사람이 여러 번 참석해도 1명, 자사 참석자가 없는 동호회는 제외", () => {
  const byClub = groupReportsByClub(posts, CO.B.id);
  assert.equal(byClub.club1.allAttendees.size, 7);
  assert.equal(byClub.club1.myAttendees.size, 3);
  const withOther = [...posts, post("p3", "club2", "2026-10-20", 100000, [person("u9", "A")])];
  const g = groupReportsByClub(withOther, CO.B.id);
  assert.deepEqual(clubIdsWithMyAttendees(g), ["club1"]); // club2 는 B사 참석자 없음
});

test("지급 완료된 건은 지급 당시 저장된 금액을 보여주고, 현재 계산은 따로 보관", () => {
  const byClub = groupReportsByClub(posts, CO.C.id);
  const paid = buildRows(byClub, ["club1"], { club1: { status: "paid", amount: 12345, paid_at: "2026-11-01T00:00:00Z", users: { name: "담당자" } } })[0];
  assert.equal(paid.amount, 12345);
  assert.notEqual(paid.calcAmount, 12345);
  const unpaid = buildRows(byClub, ["club1"], { club1: { status: "unpaid", amount: 999 } })[0];
  assert.equal(unpaid.amount, unpaid.calcAmount);
  const noRecord = buildRows(byClub, ["club1"])[0];
  assert.equal(noRecord.amount, noRecord.calcAmount);
});

test("무작위: 어떤 데이터에서도 모든 회사 담당자 금액의 합 = 동호회 지급액", () => {
  let seed = 99;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const keys = ["A", "B", "C"];
  for (let i = 0; i < 4000; i++) {
    const nReports = 1 + rnd(4);
    const ps = Array.from({ length: nReports }, (_, r) =>
      post(`p${r}`, "club1", "2026-10-01", rnd(2_000_000), Array.from({ length: rnd(8) }, () => { const id = rnd(14); return person(`u${id}`, keys[id % 3]); }))
    );
    // 같은 사람이 보고서마다 다른 회사로 나오지 않도록 id→회사 고정(id % 3)
    const attendeeIds = new Set(ps.flatMap((p) => p.post_attendees.map((a) => a.user_id)));
    if (attendeeIds.size === 0) continue;
    const expense = ps.reduce((s, p) => s + p.expense_amount, 0);
    const clubTotal = calcSubsidy(expense, attendeeIds.size).amount;
    let sum = 0;
    for (const k of keys) {
      const g = groupReportsByClub(ps, CO[k].id);
      const rows = buildRows(g, clubIdsWithMyAttendees(g));
      if (rows.length) { assert.equal(rows[0].clubTotal, clubTotal); sum += rows[0].amount; }
    }
    assert.equal(sum, clubTotal);
  }
});

test("엑셀 데이터: 행 수·합계·지급 당시 금액 비고·보고서 시트", () => {
  const byClub = groupReportsByClub(posts, CO.C.id);
  const rows = buildRows(byClub, ["club1"], { club1: { status: "paid", amount: 12345, paid_at: "2026-11-01T00:00:00Z", users: { name: "담당자" } } });
  const [sheet1, sheet2] = buildExportSheets(rows, 10);
  assert.equal(sheet1.name, "10월 지원금");
  assert.equal(sheet1.rows.length, 1);
  assert.equal(sheet1.rows[0][7], 12345);                         // 자사 부담액 = 저장된 지급 금액
  assert.equal(sheet1.rows[0][8], "지급완료");
  assert.match(sheet1.rows[0][11], /지급 당시 금액 \(현재 계산 [\d,]+원\)/);
  assert.equal(sheet1.totalRow[5], rows[0].clubTotal);            // 동호회 지급액 합계
  assert.equal(sheet1.totalRow[7], 12345);                        // 자사 부담액 합계
  assert.equal(sheet1.rows[0].length, sheet1.columns.length);
  assert.equal(sheet2.rows.length, 2);                            // 보고서 2건
  assert.equal(sheet2.rows[0][5], 2);                             // 첨부파일 수
  assert.equal(sheet2.rows[0].length, sheet2.columns.length);
});

test("엑셀 파일 이름: 금지 문자 제거", () => {
  assert.equal(exportFileName("에이텍/컴퓨터:\\*", 2026, 3), "지원금_에이텍컴퓨터_2026-03.xlsx");
  assert.equal(exportFileName(undefined, 2026, 11), "지원금_회사_2026-11.xlsx");
});
