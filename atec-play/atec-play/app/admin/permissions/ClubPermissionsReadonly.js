import { CLUB_PERM_LABELS, STAFF_CODES, BASE_CODES, compareClubCodes } from "@/lib/club-roles";

// 동호회 직책에서 자동으로 정해지는 권한을 "보기만" 하는 영역입니다. (수정은 직책을 바꾸면 자동 반영)
export default function ClubPermissionsReadonly({ user, allPerms }) {
  const memberships = (user?.club_members || []).filter((m) => m.status === "approved" && m.club);

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">동호회 직책별 권한 안내 (자동 적용 · 읽기 전용)</div>
        <table>
          <thead>
            <tr>
              <th>권한</th>
              <th style={{ textAlign: "center" }}>일반 (회원)</th>
              <th style={{ textAlign: "center" }}>운영진 (회장·총무)</th>
            </tr>
          </thead>
          <tbody>
            {STAFF_CODES.map((code) => (
              <tr key={code}>
                <td>{CLUB_PERM_LABELS[code]}</td>
                <td style={{ textAlign: "center" }}>{BASE_CODES.includes(code) ? "○" : "✕"}</td>
                <td style={{ textAlign: "center" }}>○</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="empty-note" style={{ paddingTop: 10 }}>
          회장과 총무의 권한은 같습니다. 직책을 바꾸면 이 권한이 자동으로 켜지고 꺼지므로, 여기서 따로 설정하지 않습니다.
          직책 변경은 <b>동호회 화면 → 회원 현황 탭</b>에서 회장 또는 통합관리자가 합니다.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">{user?.name} 님의 동호회 직책과 적용된 권한 (읽기 전용)</div>
        {memberships.length === 0 ? (
          <div className="empty-note">가입 승인된 동호회가 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>동호회</th>
                <th>직책</th>
                <th>권한</th>
                <th>실제 적용된 권한</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const have = [
                  ...new Set(
                    allPerms
                      .filter((p) => p.user_id === user.id && p.club_id === m.club.id && p.company_id === null && STAFF_CODES.includes(p.permission_code))
                      .map((p) => p.permission_code)
                  ),
                ];
                const { missing, extra } = compareClubCodes(have, !!m.is_staff);
                const mismatch = missing.length > 0 || extra.length > 0;
                return (
                  <tr key={m.club.id}>
                    <td>{m.club.name}</td>
                    <td>
                      <span className={`badge ${m.role_label === "회장" ? "badge-brand" : "badge-gray"}`}>{m.role_label || "-"}</span>
                    </td>
                    <td>{m.is_staff ? "운영진" : "일반"}</td>
                    <td>
                      {have.length === 0 && <span className="empty-note" style={{ padding: 0, display: "inline" }}>적용된 권한 없음</span>}
                      {STAFF_CODES.filter((c) => have.includes(c)).map((c) => (
                        <span key={c} className="badge badge-green" style={{ marginRight: 4, marginBottom: 3, display: "inline-block" }}>
                          {CLUB_PERM_LABELS[c]}
                        </span>
                      ))}
                      {mismatch && (
                        <div style={{ marginTop: 6 }}>
                          <span className="badge badge-amber">
                            직책과 어긋남 {missing.length > 0 && `· 부족 ${missing.length}개`} {extra.length > 0 && `· 불필요 ${extra.length}개`}
                          </span>{" "}
                          <a href="/admin/role-audit" style={{ fontSize: 12 }}>직책·권한 점검에서 확인</a>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
