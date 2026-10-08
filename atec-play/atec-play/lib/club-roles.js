// 동호회 직책(회장/총무/회원)에서 자동으로 정해지는 권한(운영진/일반) 안내용 상수입니다.
// 실제 부여는 DB(supabase/07_roles_separation.sql 의 club_perm_codes)가 하며, 이 파일은 화면 표시와 점검용입니다.
// DB 와 목록이 어긋나면 tests/club-roles.test.mjs 가 실패합니다.

export const CLUB_PERM_LABELS = {
  CLUB_MEMBER_APPROVE: "가입/탈회 승인",
  CLUB_VIEW: "동호회 정보 조회",
  CLUB_POST_WRITE: "게시글 작성",
  CLUB_REPORT_WRITE: "활동보고서/증빙 업로드",
  CLUB_REPORT_VIEW: "증빙 열람",
  CLUB_BUDGET_VIEW: "지원금 현황 조회",
};

// 운영진(직책이 회장·총무이고 승인 상태)
export const STAFF_CODES = ["CLUB_MEMBER_APPROVE", "CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_REPORT_WRITE", "CLUB_REPORT_VIEW", "CLUB_BUDGET_VIEW"];
// 일반(승인된 회원)
export const BASE_CODES = ["CLUB_VIEW", "CLUB_POST_WRITE", "CLUB_BUDGET_VIEW"];

export const expectedClubCodes = (isStaff) => (isStaff ? STAFF_CODES : BASE_CODES);

// 실제로 저장된 권한(have)을 직책에서 정해지는 권한과 비교합니다. 부족/불필요한 코드를 돌려줍니다.
export function compareClubCodes(have, isStaff) {
  const want = expectedClubCodes(isStaff);
  const has = new Set(have);
  return {
    missing: want.filter((c) => !has.has(c)),
    extra: STAFF_CODES.filter((c) => has.has(c) && !want.includes(c)),
  };
}
