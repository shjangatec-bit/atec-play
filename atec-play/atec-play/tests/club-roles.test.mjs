import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CLUB_PERM_LABELS, STAFF_CODES, BASE_CODES, expectedClubCodes, compareClubCodes } from "../lib/club-roles.js";

// DB 의 club_perm_codes(...) 함수에서 운영진/일반 권한 목록을 읽어 화면 상수와 같은지 확인합니다.
function sqlCodes() {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../supabase/07_roles_separation.sql"), "utf8");
  const body = sql.slice(sql.indexOf("function public.club_perm_codes"), sql.indexOf("function public.sync_member_club_permissions"));
  const arrays = [...body.matchAll(/array\[([^\]]+)\]/g)].map((m) => m[1].match(/'([A-Z_]+)'/g).map((s) => s.replace(/'/g, "")));
  return { staff: arrays[0], base: arrays[1] };
}

test("화면의 직책별 권한 목록이 DB(07)의 목록과 같다", () => {
  const { staff, base } = sqlCodes();
  assert.deepEqual([...STAFF_CODES].sort(), [...staff].sort());
  assert.deepEqual([...BASE_CODES].sort(), [...base].sort());
});

test("모든 권한 코드에 한글 이름이 있다", () => {
  for (const c of STAFF_CODES) assert.ok(CLUB_PERM_LABELS[c], c);
});

test("일반 권한은 운영진 권한의 부분집합", () => {
  for (const c of BASE_CODES) assert.ok(STAFF_CODES.includes(c));
  assert.equal(expectedClubCodes(true), STAFF_CODES);
  assert.equal(expectedClubCodes(false), BASE_CODES);
});

test("직책과 권한 비교: 일치 / 부족 / 불필요", () => {
  assert.deepEqual(compareClubCodes(BASE_CODES, false), { missing: [], extra: [] });
  assert.deepEqual(compareClubCodes(STAFF_CODES, true), { missing: [], extra: [] });
  // 총무인데 일반 권한만 있음 → 운영진 권한 3개 부족
  assert.deepEqual(compareClubCodes(BASE_CODES, true).missing, ["CLUB_MEMBER_APPROVE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW"]);
  // 회원인데 운영진 권한이 남아 있음 → 3개 불필요
  assert.deepEqual(compareClubCodes(STAFF_CODES, false).extra, ["CLUB_MEMBER_APPROVE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW"]);
  // 권한이 전혀 없음
  assert.equal(compareClubCodes([], false).missing.length, 3);
});
