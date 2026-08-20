// 서버/클라이언트 어디서나 쓸 수 있는 순수 함수입니다. (next/headers 등 서버 전용 의존성 없음)
export function hasPermission(permissions, code, { clubId = null, companyId = null } = {}) {
  return permissions.some((p) => {
    if (p.permission_code !== code) return false;
    if (p.club_id === null && p.company_id === null) return true; // 전사 권한
    if (clubId && p.club_id === clubId) return true;
    if (companyId && p.company_id === companyId) return true;
    return false;
  });
}
