import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import LogoutButton from "@/components/LogoutButton";

const FORM_FILES = [
  {
    title: "사내 동호회 신설·운영 지침",
    description: "동호회 가입, 신설, 지원금 신청/지급 절차 전체 안내 문서입니다.",
    href: "/동호회_신설_운영_지침.pdf",
  },
  {
    title: "동호회 보조금(활동비 지원금) 신청양식",
    description: "참석자 명단, 비용 지출내역을 작성하는 양식입니다. 활동보고서 등록 시 이 양식을 채워서 함께 첨부해주세요.",
    href: "/동호회_보조금_신청양식.pdf",
  },
];

export default async function FormsPage() {
  const { authUser, profile, permissions } = await getCurrentProfile();
  if (!authUser) redirect("/login");

  const isGuest = profile?.status !== "approved";

  return (
    <div className="app-shell">
      {isGuest ? (
        <div className="sidebar">
          <div className="side-logo">ATEC PLAY<span>통합 동호회 관리</span></div>
          <a href="/pending" className="side-link"><span className="side-dot" />동호회 둘러보기</a>
          <a href="/guide" className="side-link"><span className="side-dot" />운영지침</a>
          <a href="/forms" className="side-link active"><span className="side-dot" />양식함</a>
          <div className="side-user">
            <div className="avatar" style={{ background: "var(--gray-bg)", color: "var(--ink-2)" }}>
              {profile?.name?.slice(0, 2) || "게스트"}
            </div>
            <div style={{ flex: 1 }}>
              <div className="name">{profile?.name}</div>
              <div className="role">게스트 · 승인 대기</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      ) : (
        <Sidebar profile={profile} permissions={permissions} active="/forms" />
      )}
      <div className="main">
        <div className="topbar">
          <div>
            <div className="crumb">홈 / 양식함</div>
            <h1>양식함</h1>
          </div>
        </div>
        <div className="grid-2">
          {FORM_FILES.map((f) => (
            <div className="card" key={f.href}>
              <div className="section-title">{f.title}</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 14 }}>{f.description}</div>
              <a className="btn-sm btn-outline" href={f.href} download target="_blank" rel="noreferrer">
                다운로드
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
