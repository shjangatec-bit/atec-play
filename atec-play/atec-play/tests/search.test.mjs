import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTerms, primaryTerm, likePattern, matchesAllTerms, highlightSegments, snippet, uniqueById, MAX_TERMS, MAX_TERM_LENGTH } from "../lib/search.js";

test("검색어 분리: 공백 정리, 중복 제거(대소문자 무시), 개수·길이 제한", () => {
  assert.deepEqual(parseTerms("  보드게임   카페  "), ["보드게임", "카페"]);
  assert.deepEqual(parseTerms("Board board BOARD game"), ["Board", "game"]);
  assert.deepEqual(parseTerms(""), []);
  assert.deepEqual(parseTerms(null), []);
  assert.deepEqual(parseTerms(undefined), []);
  assert.equal(parseTerms("a b c d e f g h").length, MAX_TERMS);
  assert.equal(parseTerms("가".repeat(500))[0].length, MAX_TERM_LENGTH);
});

test("한글 조합형(맥)·완성형 입력을 같게 취급", () => {
  const decomposed = "보드게임".normalize("NFD");
  assert.notEqual(decomposed, "보드게임");
  assert.deepEqual(parseTerms(decomposed), ["보드게임"]);
  assert.equal(matchesAllTerms(["우리 보드게임 모임"], parseTerms(decomposed)), true);
});

test("DB 1차 조회용 검색어: 가장 긴 것", () => {
  assert.equal(primaryTerm(["카페", "보드게임", "모임"]), "보드게임");
  assert.equal(primaryTerm(["가나", "다라"]), "가나");
  assert.equal(primaryTerm([]), "");
});

test("LIKE 패턴: % _ \\ 는 글자 그대로 찾도록 이스케이프", () => {
  assert.equal(likePattern("abc"), "%abc%");
  assert.equal(likePattern("100%"), "%100\\%%");
  assert.equal(likePattern("a_b"), "%a\\_b%");
  assert.equal(likePattern("c:\\dir"), "%c:\\\\dir%");
  assert.equal(likePattern("%_\\"), "%\\%\\_\\\\%");
});

test("필터 문법을 흉내 낸 입력도 패턴의 '글자'일 뿐이다(조회 조건을 바꿀 수 없음)", () => {
  for (const evil of ['x),or(id.eq.1', 'a,b.ilike.%', '"quoted"', "'; drop table posts;--", "*", "a%b_c"]) {
    const p = likePattern(evil);
    assert.ok(p.startsWith("%") && p.endsWith("%"));
    assert.ok(!/(?<!\\)[%_]/.test(p.slice(1, -1)), `이스케이프 안 된 와일드카드: ${p}`);
  }
});

test("모두 포함해야 일치(AND), 대소문자·여러 필드 무관", () => {
  const fields = ["10월 보드게임 모임 공지", "장소는 홍대 Board Cafe 입니다"];
  assert.equal(matchesAllTerms(fields, ["보드게임", "홍대"]), true);   // 제목+본문에 나뉘어 있어도 OK
  assert.equal(matchesAllTerms(fields, ["board", "cafe"]), true);       // 대소문자 무시
  assert.equal(matchesAllTerms(fields, ["보드게임", "축구"]), false);   // 하나라도 없으면 불일치
  assert.equal(matchesAllTerms(fields, []), true);                      // 검색어 없음 = 전체
  assert.equal(matchesAllTerms([null, undefined], ["a"]), false);
});

test("강조: 일치한 부분만 hit, 여러 검색어·겹침·대소문자, 정규식 특수문자 안전", () => {
  const seg = (t, terms) => highlightSegments(t, terms).map((s) => (s.hit ? `[${s.text}]` : s.text)).join("");
  assert.equal(seg("보드게임 카페 모임", ["보드", "카페"]), "[보드]게임 [카페] 모임");
  assert.equal(seg("Board GAME", ["board", "game"]), "[Board] [GAME]");
  assert.equal(seg("abcabc", ["bc", "abc"]), "[abcabc]");                  // 붙어 있는 일치는 하나의 강조로 합쳐짐
  assert.equal(seg("xabcdy", ["abc", "bcd"]), "x[abcd]y");                 // 겹치는 검색어
  assert.equal(seg("ab-ab", ["ab"]), "[ab]-[ab]");                         // 떨어져 있으면 따로
  assert.equal(seg("가격은 (10%) + 1 입니다", ["(10%)", "+"]), "가격은 [(10%)] [+] 1 입니다");
  assert.equal(seg("a.b", [".*"]), "a.b");                                 // 정규식으로 해석되지 않음
  assert.equal(seg("내용", []), "내용");
  assert.equal(seg("", ["a"]), "");
  assert.equal(highlightSegments("가나다", ["나"]).map((s) => s.text).join(""), "가나다"); // 합치면 원문 그대로
});

test("발췌: 처음 일치한 곳 주변만, 앞뒤 … 표시, 짧은 글은 그대로", () => {
  assert.equal(snippet("짧은 글", ["글"]), "짧은 글");
  const long = "가".repeat(100) + " 보드게임 " + "나".repeat(100);
  const s = snippet(long, ["보드게임"], 20);
  assert.ok(s.startsWith("…") && s.endsWith("…") && s.includes("보드게임"));
  assert.ok(s.length <= 20 * 2 + 2);
  assert.equal(snippet("가".repeat(200), ["없음"], 10), "가".repeat(20) + "…"); // 일치 없음 → 앞부분
});

test("id 기준 중복 제거(제목 조회·본문 조회 결과 합치기)", () => {
  assert.deepEqual(uniqueById([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], null).map((r) => r.id), [1, 2, 3]);
});
