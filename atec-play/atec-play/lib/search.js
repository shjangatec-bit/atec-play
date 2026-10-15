// 검색 공통 로직 (동호회 현황·통합 검색·게시판 검색이 같은 규칙을 씁니다)
//  · 띄어쓰기로 나눈 검색어는 모두 포함해야 합니다(AND). 대소문자는 구분하지 않습니다.
//  · DB 에는 "가장 긴 검색어 하나"로만 1차 조회(ilike)하고, 나머지 조건은 여기서 정확히 걸러냅니다.
//    (필터 문법을 직접 조립하지 않으므로 입력값으로 조회 조건이 바뀔 수 없습니다)

export const MAX_TERMS = 5;
export const MAX_TERM_LENGTH = 50;

// 검색어 문장 → 중복 없는 검색어 목록. 앞뒤 공백·연속 공백 제거, 한글 조합형/완성형 통일(NFC), 길이·개수 제한
export function parseTerms(input) {
  const seen = new Set();
  const terms = [];
  for (const raw of String(input ?? "").normalize("NFC").split(/\s+/)) {
    const t = raw.slice(0, MAX_TERM_LENGTH);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    terms.push(t);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}

// DB 1차 조회에 쓸 검색어: 가장 긴 것(같으면 먼저 입력한 것)
export const primaryTerm = (terms) => terms.reduce((best, t) => (t.length > best.length ? t : best), "");

// LIKE/ILIKE 패턴에서 특별한 의미를 갖는 문자(% _ \)를 글자 그대로 찾도록 이스케이프하고 앞뒤에 % 를 붙임
export const likePattern = (term) => `%${String(term).replace(/[\\%_]/g, "\\$&")}%`;

const norm = (s) => String(s ?? "").normalize("NFC").toLowerCase();

// 모든 검색어가 fields(제목·본문 등) 중 어딘가에 들어 있는지
export function matchesAllTerms(fields, terms) {
  if (terms.length === 0) return true;
  const hay = fields.map(norm).join("\n");
  return terms.every((t) => hay.includes(norm(t)));
}

// 글을 "일반 글자 / 검색어와 일치한 글자" 조각으로 나눕니다. (화면에서 일치한 부분만 강조). 정규식을 쓰지 않아 특수문자가 있어도 안전
export function highlightSegments(text, terms) {
  const src = String(text ?? "");
  const hay = norm(src);
  // normalize 로 글자 수가 달라지는 드문 경우에는 강조 없이 그대로 보여줌
  if (hay.length !== src.length || terms.length === 0) return [{ text: src, hit: false }];
  const marks = new Array(src.length).fill(false);
  for (const t of terms) {
    const needle = norm(t);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const i = hay.indexOf(needle, from);
      if (i === -1) break;
      for (let k = i; k < i + needle.length; k++) marks[k] = true;
      from = i + needle.length;
    }
  }
  const out = [];
  let start = 0;
  for (let i = 1; i <= src.length; i++) {
    if (i === src.length || marks[i] !== marks[start]) {
      out.push({ text: src.slice(start, i), hit: marks[start] });
      start = i;
    }
  }
  return out.length ? out : [{ text: src, hit: false }];
}

// 본문에서 처음 일치한 곳 주변만 잘라서 보여줍니다. (앞뒤에 … 표시)
export function snippet(text, terms, radius = 40) {
  const src = String(text ?? "").replace(/\s+/g, " ").trim();
  if (src.length <= radius * 2) return src;
  const hay = norm(src);
  if (hay.length !== src.length) return src.slice(0, radius * 2) + "…";
  let first = -1;
  for (const t of terms) {
    const i = hay.indexOf(norm(t));
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  if (first === -1) return src.slice(0, radius * 2) + (src.length > radius * 2 ? "…" : "");
  const start = Math.max(0, first - radius);
  const end = Math.min(src.length, first + radius);
  return (start > 0 ? "…" : "") + src.slice(start, end) + (end < src.length ? "…" : "");
}

// 같은 id 는 한 번만 (제목 조회 결과와 본문 조회 결과를 합칠 때)
export function uniqueById(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const row of list || []) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        out.push(row);
      }
    }
  }
  return out;
}
