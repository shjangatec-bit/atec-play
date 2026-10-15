import { test } from "node:test";
import assert from "node:assert/strict";
import { safeLink, timeAgo, badgeText } from "../lib/notifications.js";

test("링크: 앱 안 경로만 허용", () => {
  assert.equal(safeLink("/clubs/abc"), "/clubs/abc");
  assert.equal(safeLink("/clubs?mine=1"), "/clubs?mine=1");
  for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "clubs/1", "/\\evil.com", "/a\nb", "", null, undefined, 5, {}]) {
    assert.equal(safeLink(bad), null, String(bad));
  }
});

test("시간 표시", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(timeAgo("2026-10-15T11:59:30Z", now), "방금 전");
  assert.equal(timeAgo("2026-10-15T11:55:00Z", now), "5분 전");
  assert.equal(timeAgo("2026-10-15T09:00:00Z", now), "3시간 전");
  assert.equal(timeAgo("2026-10-13T12:00:00Z", now), "2일 전");
  assert.match(timeAgo("2026-09-01T00:00:00Z", now), /2026/);
  assert.equal(timeAgo("not a date", now), "");
  assert.equal(timeAgo("2026-10-15T12:00:05Z", now), "방금 전");   // 시계가 조금 어긋난 미래 시각
});

test("뱃지 숫자", () => {
  assert.equal(badgeText(0), "0");
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
  assert.equal(badgeText(-3), "0");
  assert.equal(badgeText(NaN), "0");
  assert.equal(badgeText(undefined), "0");
});
